import type { OrderStatus } from "@/generated/prisma/client";
import type { UserRole } from "@/lib/permissions/roles";

const TRANSITION_ROLES: Partial<Record<`${OrderStatus}:${OrderStatus}`, readonly UserRole[]>> = {
  "CONFIRMED:PREPARING": ["OWNER", "KITCHEN"],
  "PREPARING:READY": ["OWNER", "KITCHEN"],
  "READY:COMPLETED": ["OWNER", "CASHIER"],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, actorRole: UserRole): boolean {
  return TRANSITION_ROLES[`${from}:${to}`]?.includes(actorRole) ?? false;
}
