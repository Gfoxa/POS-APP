import "server-only";
import { Prisma, type OrderStatus, type PrismaClient } from "@/generated/prisma/client";
import type { UserRole } from "@/lib/permissions/roles";
import { getPrismaClient } from "@/lib/db/prisma";
import { canTransitionOrder } from "@/server/orders/workflow";
import { refreshTableGroupAfterOrderChange, resolveTableRootInTransaction } from "@/server/services/tables";
import { deductOrderInventoryInTransaction, InventoryError } from "@/server/services/inventory";

export class OrderWorkflowError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "INVALID_STATE" | "INSUFFICIENT_STOCK" | "DATABASE") {
    super(message);
    this.name = "OrderWorkflowError";
  }
}

export async function refundPaidOrder(orderId: string, reason: string, actorId: string, actorRole: UserRole) {
  if (actorRole !== "OWNER" && actorRole !== "MANAGER") throw new OrderWorkflowError("Hanya pemilik atau manajer yang dapat memproses pengembalian dana.", "INVALID_STATE");
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      if (!locked.length) throw new OrderWorkflowError("Pesanan tidak ditemukan.", "NOT_FOUND");
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { kind: "CHARGE" }, orderBy: { paidAt: "asc" } }, table: { select: { id: true, mergedIntoId: true } } } });
      if (!["CONFIRMED", "PREPARING", "READY", "COMPLETED"].includes(order.status) || !order.payments.length) throw new OrderWorkflowError("Hanya pesanan aktif yang sudah dibayar yang dapat dikembalikan.", "INVALID_STATE");
      const priorRefund = await tx.payment.findFirst({ where: { orderId, kind: "REFUND" }, select: { id: true } });
      if (priorRefund) throw new OrderWorkflowError("Pesanan ini sudah dikembalikan.", "INVALID_STATE");
      const charge = order.payments[0];
      let cashSessionId: string | null = null;
      if (charge.method === "CASH") {
        const open = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "CashSession" WHERE "cashierId" = ${actorId}::uuid AND "closedAt" IS NULL FOR UPDATE`;
        if (!open.length) throw new OrderWorkflowError("Buka sesi kasir sebelum mengembalikan pembayaran tunai.", "INVALID_STATE");
        cashSessionId = open[0].id;
      }
      const refund = await tx.payment.create({ data: { orderId, kind: "REFUND", amount: charge.amount, method: charge.method, referenceNumber: charge.referenceNumber ? `Refund of ${charge.referenceNumber}` : null, cashierId: actorId, cashSessionId } });
      const changed = await tx.order.updateMany({ where: { id: orderId, status: { in: ["CONFIRMED", "PREPARING", "READY", "COMPLETED"] } }, data: { status: "REFUNDED" } });
      if (!changed.count) throw new OrderWorkflowError("Status pesanan berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      await tx.auditLog.create({ data: { userId: actorId, action: "ORDER_REFUNDED", entity: "Order", entityId: orderId, metadata: { amount: charge.amount.toFixed(2), method: charge.method, reason: reason.trim(), refundPaymentId: refund.id } } });
      if (order.table) await refreshTableGroupAfterOrderChange(tx, order.table.mergedIntoId ?? order.table.id);
      return { id: orderId, refundId: refund.id, amount: refund.amount };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof OrderWorkflowError) throw error;
    console.error("Order refund failed.", error);
    throw new OrderWorkflowError("Pengembalian dana belum dapat diproses. Coba lagi.", "DATABASE");
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

function safeError(error: unknown): never {
  if (error instanceof OrderWorkflowError) throw error;
  if (error instanceof InventoryError) throw new OrderWorkflowError(error.message, error.code === "INSUFFICIENT_STOCK" ? "INSUFFICIENT_STOCK" : "DATABASE");
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new OrderWorkflowError("Pesanan tidak ditemukan.", "NOT_FOUND");
  }
  console.error("Order workflow operation failed.", error);
  throw new OrderWorkflowError("Status pesanan belum dapat diperbarui. Coba lagi.", "DATABASE");
}

async function audit(db: Db, actorId: string, orderId: string, from: OrderStatus, to: OrderStatus) {
  await db.auditLog.create({
    data: {
      userId: actorId,
      action: "ORDER_STATUS_CHANGED",
      entity: "Order",
      entityId: orderId,
      metadata: { from, to },
    },
  });
}

export async function transitionOrder(orderId: string, expectedStatus: OrderStatus, nextStatus: OrderStatus, actorId: string, actorRole: UserRole) {
  if (!canTransitionOrder(expectedStatus, nextStatus, actorRole)) {
    throw new OrderWorkflowError("Perubahan status pesanan tidak diizinkan.", "INVALID_STATE");
  }
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, type: true, tableId: true } });
      if (!current) throw new OrderWorkflowError("Pesanan tidak ditemukan.", "NOT_FOUND");
      const changed = await tx.order.updateMany({
        where: { id: orderId, type: current.type, tableId: current.tableId, status: expectedStatus },
        data: { status: nextStatus, ...(nextStatus === "COMPLETED" ? { completedAt: new Date() } : {}) },
      });
      if (!changed.count) throw new OrderWorkflowError("Status pesanan sudah berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      if (nextStatus === "COMPLETED") await deductOrderInventoryInTransaction(tx, orderId, actorId);
      await audit(tx, actorId, orderId, expectedStatus, nextStatus);
      if (nextStatus === "COMPLETED" && current.type === "DINE_IN" && current.tableId) {
        const rootId = await resolveTableRootInTransaction(tx, current.tableId);
        await refreshTableGroupAfterOrderChange(tx, rootId);
      }
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, status: true, completedAt: true } });
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function listKitchenOrders() {
  const prisma = getPrismaClient();
  try {
    const rows = await prisma.order.findMany({
      where: { status: { in: ["CONFIRMED", "PREPARING", "READY"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        note: true,
        createdAt: true,
        table: {
          select: {
            name: true,
            mergedInto: { select: { name: true, mergedTables: { select: { name: true }, orderBy: { name: "asc" } } } },
            mergedTables: { select: { name: true }, orderBy: { name: "asc" } },
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productName: true,
            variantName: true,
            quantity: true,
            note: true,
            addons: { select: { addonName: true, quantity: true }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    return rows.map((order) => {
      const tableRoot = order.table?.mergedInto;
      const tableNames = tableRoot
        ? [tableRoot.name, ...tableRoot.mergedTables.map((table) => table.name)]
        : order.table ? [order.table.name, ...order.table.mergedTables.map((table) => table.name)] : [];
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status as "CONFIRMED" | "PREPARING" | "READY",
        type: order.type,
        note: order.note,
        createdAt: order.createdAt,
        tableLabel: tableNames.length ? tableNames.join(" + ") : null,
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          note: item.note,
          addons: item.addons,
        })),
      };
    });
  } catch (error) {
    return safeError(error);
  }
}
