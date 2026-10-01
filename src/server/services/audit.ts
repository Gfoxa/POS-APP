import "server-only";
import type { UserRole } from "@/lib/permissions/roles";
import { getPrismaClient } from "@/lib/db/prisma";

export class AuditServiceError extends Error {
  constructor(readonly code: "FORBIDDEN") { super("Anda tidak memiliki akses ke catatan audit."); this.name = "AuditServiceError"; }
}

export async function listAuditLogs(page: number, role: UserRole) {
  if (role !== "OWNER" && role !== "MANAGER") throw new AuditServiceError("FORBIDDEN");
  const safePage = Number.isSafeInteger(page) ? Math.max(1, Math.min(10000, page)) : 1;
  const take = 50;
  const [rows, total] = await Promise.all([
    getPrismaClient().auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (safePage - 1) * take, take, select: { id: true, action: true, entity: true, entityId: true, metadata: true, createdAt: true, user: { select: { name: true, email: true } } } }),
    getPrismaClient().auditLog.count(),
  ]);
  return { rows, total, page: safePage, pageCount: Math.max(1, Math.ceil(total / take)) };
}
