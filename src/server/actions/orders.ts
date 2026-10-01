"use server";

import { revalidatePath } from "next/cache";
import { requireRouteAccess } from "@/lib/auth/guards";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { OrderServiceError, cancelDraftOrder, checkoutCart, saveDraftOrder } from "@/server/services/orders";
import { checkoutInputSchema, orderIdSchema, saveDraftInputSchema } from "@/server/orders/validation";
import type { OrderActionState } from "@/server/orders/action-state";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function parseCart(formData: FormData) {
  try {
    return JSON.parse(value(formData, "cart")) as unknown;
  } catch {
    return null;
  }
}

function draftData(formData: FormData) {
  const cart = parseCart(formData);
  return saveDraftInputSchema.safeParse({
    ...(value(formData, "orderId") ? { orderId: value(formData, "orderId") } : {}),
    type: value(formData, "type"),
    tableId: value(formData, "tableId") || null,
    customerId: value(formData, "customerId") || null,
    discountId: value(formData, "discountId") || null,
    note: value(formData, "note"),
    lines: cart,
  });
}

async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const user = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  return user?.isActive ? user.id : userId;
}

function serviceFailure(error: unknown, saved?: { id: string; orderNumber: string }): OrderActionState {
  if (error instanceof OrderServiceError) return { message: error.message, error: true, orderId: saved?.id, orderNumber: saved?.orderNumber };
  console.error("Order action failed.", error);
  return { message: "Pesanan belum dapat diproses. Coba lagi.", error: true, orderId: saved?.id, orderNumber: saved?.orderNumber };
}

export async function saveDraftAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireRouteAccess("pos");
  const parsed = draftData(formData);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa kembali isi pesanan.", error: true };
  try {
    const order = await saveDraftOrder(parsed.data, await actorId(user.id));
    revalidatePath("/pos");
    revalidatePath("/orders");
    revalidatePath("/tables");
    return { message: "Pesanan disimpan untuk dilanjutkan nanti.", orderId: order.id, orderNumber: order.orderNumber };
  } catch (error) {
    return serviceFailure(error);
  }
}

export async function checkoutCartAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireRouteAccess("pos");
  const draft = draftData(formData);
  if (!draft.success) return { message: draft.error.issues[0]?.message ?? "Periksa kembali isi pesanan.", error: true };
  const payment = checkoutInputSchema.omit({ orderId: true }).safeParse({
    method: value(formData, "method"),
    tenderedAmount: value(formData, "tenderedAmount"),
    referenceNumber: value(formData, "referenceNumber"),
  });
  if (!payment.success) return { message: payment.error.issues[0]?.message ?? "Periksa kembali data pembayaran.", error: true };
  const checkoutKey = orderIdSchema.safeParse(value(formData, "checkoutKey"));
  if (!checkoutKey.success) return { message: "Sesi pembayaran tidak valid. Muat ulang halaman dan coba lagi.", error: true };
  try {
    const actor = await actorId(user.id);
    const order = await checkoutCart(draft.data, payment.data, checkoutKey.data, actor);
    revalidatePath("/pos");
    revalidatePath("/orders");
    revalidatePath("/dashboard");
    revalidatePath("/cash-session");
    return { message: "Pembayaran berhasil. Pesanan dikonfirmasi.", orderId: order.id, orderNumber: order.orderNumber };
  } catch (error) {
    return serviceFailure(error);
  }
}

export async function cancelDraftAction(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireRouteAccess("pos");
  const parsedId = orderIdSchema.safeParse(value(formData, "orderId"));
  if (!parsedId.success) return { message: "Pesanan draft tidak ditemukan.", error: true };
  try {
    await cancelDraftOrder(parsedId.data, await actorId(user.id));
    revalidatePath("/pos");
    revalidatePath("/orders");
    revalidatePath("/tables");
    return { message: "Pesanan draft dibatalkan." };
  } catch (error) {
    return serviceFailure(error);
  }
}
