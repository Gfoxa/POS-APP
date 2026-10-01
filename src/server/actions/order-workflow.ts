"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRouteAccess } from "@/lib/auth/guards";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { refundPaidOrder, transitionOrder, OrderWorkflowError } from "@/server/services/order-workflow";
import { refundInputSchema } from "@/server/orders/validation";
import type { TableActionState } from "@/server/actions/tables";

const inputSchema = z.object({ orderId: z.uuid(), expectedStatus: z.enum(["CONFIRMED", "PREPARING", "READY"]), nextStatus: z.enum(["PREPARING", "READY", "COMPLETED"]) });
function value(formData: FormData, key: string) { return formData.get(key)?.toString() ?? ""; }

export async function transitionOrderAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const parsed = inputSchema.safeParse({ orderId: value(formData, "orderId"), expectedStatus: value(formData, "expectedStatus"), nextStatus: value(formData, "nextStatus") });
  if (!parsed.success) return { message: "Perubahan status tidak valid.", error: true };
  const user = await requireRouteAccess(parsed.data.nextStatus === "COMPLETED" ? "tables" : "kitchen");
  try {
    let actorId = user.id;
    if (isLocalPreviewMode()) {
      const { getPrismaClient } = await import("@/lib/db/prisma");
      const actor = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
      if (actor?.isActive) actorId = actor.id;
    }
    await transitionOrder(parsed.data.orderId, parsed.data.expectedStatus, parsed.data.nextStatus, actorId, user.role);
    for (const path of ["/pos", "/tables", "/kitchen", "/orders", "/dashboard", "/inventory", "/inventory/ingredients"]) revalidatePath(path);
    return { message: "Status pesanan diperbarui." };
  } catch (error) {
    if (error instanceof OrderWorkflowError) return { message: error.message, error: true };
    console.error("Order workflow action failed.", error);
    return { message: "Status pesanan belum dapat diperbarui. Coba lagi.", error: true };
  }
}

export async function refundOrderAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const parsed = refundInputSchema.safeParse({ orderId: value(formData, "orderId"), reason: value(formData, "reason") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Data pengembalian tidak valid.", error: true };
  const user = await requireRouteAccess("orders");
  try {
    let actorId = user.id;
    if (isLocalPreviewMode()) {
      const { getPrismaClient } = await import("@/lib/db/prisma");
      const actor = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
      if (actor?.isActive) actorId = actor.id;
    }
    await refundPaidOrder(parsed.data.orderId, parsed.data.reason, actorId, user.role);
    for (const path of ["/orders", "/dashboard", "/reports", "/cash-session", "/audit-logs"]) revalidatePath(path);
    return { message: "Pengembalian dana berhasil dicatat." };
  } catch (error) {
    if (error instanceof OrderWorkflowError) return { message: error.message, error: true };
    console.error("Order refund action failed.", error);
    return { message: "Pengembalian dana belum dapat diproses. Coba lagi.", error: true };
  }
}
