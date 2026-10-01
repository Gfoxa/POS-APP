import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { hashPassword } from "@/server/auth/password";
import type { NewUserInput, UpdateUserInput } from "@/server/users/validation";

export class UserServiceError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "DUPLICATE" | "LAST_OWNER" | "SELF_CHANGE" | "DATABASE") { super(message); this.name = "UserServiceError"; }
}
function safeError(error: unknown): never {
  if (error instanceof UserServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new UserServiceError("Email sudah digunakan.", "DUPLICATE");
    if (error.code === "P2025") throw new UserServiceError("Pengguna tidak ditemukan.", "NOT_FOUND");
  }
  console.error("User administration failed.", error);
  throw new UserServiceError("Perubahan pengguna belum dapat disimpan. Coba lagi.", "DATABASE");
}

async function lockOwnerRole(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT "id" FROM "Role" WHERE "name" = 'OWNER' FOR UPDATE`;
}

export async function listUsers() {
  return getPrismaClient().user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, isActive: true, createdAt: true, updatedAt: true, role: { select: { name: true } } } }).then((rows) => rows.map((row) => ({ ...row, role: row.role.name })));
}

export async function createUser(input: NewUserInput, actorId: string) {
  const passwordHash = await hashPassword(input.password);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.role === "OWNER") await lockOwnerRole(tx);
      const role = await tx.role.findUnique({ where: { name: input.role }, select: { id: true } });
      if (!role) throw new UserServiceError("Peran pengguna tidak tersedia.", "DATABASE");
      const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash, roleId: role.id }, select: { id: true, name: true, email: true, isActive: true, createdAt: true, updatedAt: true, role: { select: { name: true } } } });
      await tx.auditLog.create({ data: { userId: actorId, action: "USER_CREATED", entity: "User", entityId: user.id, metadata: { email: user.email, role: input.role } } });
      return { ...user, role: user.role.name };
    });
  } catch (error) { return safeError(error); }
}

export async function updateUser(input: UpdateUserInput, actorId: string) {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      await lockOwnerRole(tx);
      const current = await tx.user.findUnique({ where: { id: input.id }, include: { role: { select: { name: true } } } });
      if (!current) throw new UserServiceError("Pengguna tidak ditemukan.", "NOT_FOUND");
      if (input.id === actorId && (!input.isActive || input.role !== current.role.name)) throw new UserServiceError("Pemilik tidak dapat menonaktifkan atau mengubah perannya sendiri.", "SELF_CHANGE");
      if (current.role.name === "OWNER" && current.isActive && (!input.isActive || input.role !== "OWNER")) {
        const remaining = await tx.user.count({ where: { id: { not: current.id }, isActive: true, role: { name: "OWNER" } } });
        if (remaining === 0) throw new UserServiceError("Sistem harus memiliki setidaknya satu pemilik aktif.", "LAST_OWNER");
      }
      const role = await tx.role.findUnique({ where: { name: input.role }, select: { id: true } });
      if (!role) throw new UserServiceError("Peran pengguna tidak tersedia.", "DATABASE");
      const user = await tx.user.update({ where: { id: input.id }, data: { name: input.name, email: input.email, roleId: role.id, isActive: input.isActive, ...(passwordHash ? { passwordHash } : {}) }, select: { id: true, name: true, email: true, isActive: true, createdAt: true, updatedAt: true, role: { select: { name: true } } } });
      await tx.auditLog.create({ data: { userId: actorId, action: "USER_UPDATED", entity: "User", entityId: user.id, metadata: { email: user.email, role: input.role, isActive: user.isActive, passwordChanged: Boolean(passwordHash) } } });
      return { ...user, role: user.role.name };
    });
  } catch (error) { return safeError(error); }
}
