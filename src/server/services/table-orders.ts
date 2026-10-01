import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type { SaveDraftInput } from "@/server/orders/validation";
import { splitDraftInputSchema, type SplitDraftInput } from "@/server/tables/validation";
import { claimDineInTable, TableServiceError } from "@/server/services/tables";
import { OrderServiceError, saveDraftOrder, saveDraftOrderInTransaction } from "@/server/services/orders";

export async function saveTableDraft(input: SaveDraftInput, actorId: string) {
  if (input.type !== "DINE_IN" || !input.tableId) throw new OrderServiceError("Pilih meja untuk pesanan makan di tempat.", "INVALID_REFERENCE");
  return saveDraftOrder(input, actorId);
}

function invalidSplit(error: unknown): never {
  if (error instanceof TableOrderServiceError || error instanceof OrderServiceError) throw error;
  if (error instanceof TableServiceError) {
    const code = error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "INVALID_STATE" ? "INVALID_STATE" : "INVALID_REFERENCE";
    throw new OrderServiceError(error.message, code);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") throw new OrderServiceError("Pesanan tidak ditemukan.", "NOT_FOUND");
    if (error.code === "P2003" || error.code === "P2014") throw new OrderServiceError("Data pesanan sedang digunakan.", "INVALID_REFERENCE");
  }
  console.error("Table order operation failed.", error);
  throw new OrderServiceError("Pesanan belum dapat dipisah. Coba lagi.", "DATABASE");
}

export class TableOrderServiceError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "INVALID_STATE" | "INVALID_REFERENCE" | "DATABASE") {
    super(message);
    this.name = "TableOrderServiceError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

async function audit(db: Db, actorId: string, orderId: string, metadata: Prisma.InputJsonObject) {
  await db.auditLog.create({ data: { userId: actorId, action: "ORDER_DRAFT_SPLIT", entity: "Order", entityId: orderId, metadata } });
}

export async function splitDraftOrder(input: SplitDraftInput, actorId: string) {
  const parsed = splitDraftInputSchema.safeParse(input);
  if (!parsed.success) throw new TableOrderServiceError("Periksa kembali produk dan jumlah yang dipisah.", "INVALID_REFERENCE");
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.order.updateMany({
        where: { id: parsed.data.orderId, cashierId: actorId, status: "DRAFT" },
        data: { updatedAt: new Date() },
      });
      if (!locked.count) throw new TableOrderServiceError("Pesanan draft tidak ditemukan atau sudah berubah status.", "INVALID_STATE");
      const order = await tx.order.findUnique({
        where: { id: parsed.data.orderId },
        include: { items: { include: { addons: true } } },
      });
      if (!order || order.cashierId !== actorId) throw new TableOrderServiceError("Pesanan draft tidak ditemukan.", "NOT_FOUND");
      if (order.status !== "DRAFT" || order.type !== "DINE_IN" || !order.tableId) {
        throw new TableOrderServiceError("Hanya draft makan di tempat yang dapat dipisah.", "INVALID_STATE");
      }
      if (order.discountId) throw new TableOrderServiceError("Hapus diskon sebelum memisahkan pesanan.", "INVALID_STATE");

      const requested = new Map(parsed.data.lines.map((line) => [line.orderItemId, line.quantity]));
      const originalLines = order.items.map((item) => ({
        item,
        quantityToMove: requested.get(item.id) ?? 0,
      }));
      if (parsed.data.lines.some((line) => !order.items.some((item) => item.id === line.orderItemId))) {
        throw new TableOrderServiceError("Produk yang dipilih bukan bagian dari pesanan ini.", "INVALID_REFERENCE");
      }
      if (originalLines.some(({ item, quantityToMove }) => quantityToMove > item.quantity)) {
        throw new TableOrderServiceError("Jumlah yang dipisah melebihi jumlah pada pesanan.", "INVALID_REFERENCE");
      }

      const sourceLines = originalLines.filter(({ item, quantityToMove }) => item.quantity > quantityToMove).map(({ item, quantityToMove }) => ({
        productId: item.productId,
        variantId: item.variantId,
        addonIds: item.addons.map((addon) => addon.addonId),
        quantity: item.quantity - quantityToMove,
        note: item.note,
      }));
      const splitLines = originalLines.filter(({ quantityToMove }) => quantityToMove > 0).map(({ item, quantityToMove }) => ({
        productId: item.productId,
        variantId: item.variantId,
        addonIds: item.addons.map((addon) => addon.addonId),
        quantity: quantityToMove,
        note: item.note,
      }));
      if (!sourceLines.length || !splitLines.length) throw new TableOrderServiceError("Kedua pesanan harus memiliki sedikitnya satu produk.", "INVALID_STATE");

      await claimDineInTable(tx, order.tableId);
      const shared: Omit<SaveDraftInput, "orderId" | "lines"> = {
        type: "DINE_IN", tableId: order.tableId, customerId: order.customerId,
        discountId: null, note: order.note,
      };
      const sourceOrder = await saveDraftOrderInTransaction(tx, { ...shared, orderId: order.id, lines: sourceLines }, actorId);
      const splitOrder = await saveDraftOrderInTransaction(tx, { ...shared, lines: splitLines }, actorId);
      await audit(tx, actorId, sourceOrder.id, { splitOrderId: splitOrder.id, movedLines: parsed.data.lines });
      await audit(tx, actorId, splitOrder.id, { sourceOrderId: sourceOrder.id, movedLines: parsed.data.lines });
      return { sourceOrder, splitOrder };
    });
  } catch (error) {
    return invalidSplit(error);
  }
}
