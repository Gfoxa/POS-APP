import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db/prisma";
import { verifyPassword } from "@/server/auth/password";
import { createUser, listUsers, updateUser } from "./users";

const integrationDescribe = process.env.PHASE6_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("user administration", () => {
  it("creates hashed credentials, updates role and deactivates without exposing password hashes", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = `${Date.now()}`;
    let userId: string | undefined;
    try {
      const created = await createUser({ name: `New cashier ${suffix}`, email: `cashier-${suffix}@cafe.local`, password: "StrongPassword!42", role: "CASHIER" }, owner.id);
      userId = created.id;
      expect(created).not.toHaveProperty("passwordHash");
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, select: { passwordHash: true } });
      expect(await verifyPassword("StrongPassword!42", stored.passwordHash)).toBe(true);
      await updateUser({ id: created.id, name: created.name, email: created.email, role: "MANAGER", isActive: false, password: "" }, owner.id);
      expect((await listUsers()).find((item) => item.id === created.id)).toMatchObject({ role: "MANAGER", isActive: false });
      expect(await prisma.auditLog.count({ where: { entity: "User", entityId: created.id } })).toBe(2);
    } finally {
      if (userId) { await prisma.auditLog.deleteMany({ where: { entityId: userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
      await prisma.$disconnect();
    }
  });
});
