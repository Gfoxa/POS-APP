import type { UserRole } from "@/lib/permissions/roles";

export function canViewOrder(role: UserRole, actorId: string, cashierId: string): boolean {
  return role === "OWNER" || role === "MANAGER" || (role === "CASHIER" && actorId === cashierId);
}
