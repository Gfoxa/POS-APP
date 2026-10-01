import "dotenv/config";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db/prisma";
import { refundPaidOrder, transitionOrder, listKitchenOrders } from "@/server/services/order-workflow";
import { moveOrderToTable } from "@/server/services/tables";
import { deactivateIngredient, recordInventoryMovement, saveIngredient } from "@/server/services/inventory";
import { openCashSession, getCashSessionLiveTotals } from "@/server/services/finance";

const integrationDescribe = process.env.ORDER_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("order workflow against PostgreSQL", () => {
  const prisma = getPrismaClient();
  const orderIds: string[] = [];
  const tableIds: string[] = [];
  const cashSessionIds: string[] = [];
  let ownerId = "";

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before order integration tests.");
    ownerId = owner.id;
  });

  async function order(status: "CONFIRMED" | "PREPARING" | "READY", tableId: string | null = null) {
    const result = await prisma.order.create({ data: {
      orderNumber: `WF-${crypto.randomUUID().slice(0, 12)}`, type: tableId ? "DINE_IN" : "TAKEAWAY",
      status, cashierId: ownerId, tableId,
    } });
    orderIds.push(result.id);
    return result;
  }

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...orderIds, ...cashSessionIds] } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItemIngredient.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: cashSessionIds } } });
    await prisma.cafeTable.deleteMany({ where: { id: { in: tableIds } } });
    await prisma.$disconnect();
  });

  it("guards role/status transitions, audits each update, and cleans a table after completion", async () => {
    const table = await prisma.cafeTable.create({ data: { name: `Workflow ${crypto.randomUUID().slice(0, 8)}`, capacity: 2, status: "OCCUPIED" } });
    tableIds.push(table.id);
    const ticket = await order("CONFIRMED", table.id);
    await expect(transitionOrder(ticket.id, "CONFIRMED", "PREPARING", ownerId, "CASHIER")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(transitionOrder(ticket.id, "CONFIRMED", "READY", ownerId, "KITCHEN")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await transitionOrder(ticket.id, "CONFIRMED", "PREPARING", ownerId, "KITCHEN");
    await transitionOrder(ticket.id, "PREPARING", "READY", ownerId, "OWNER");
    await expect(transitionOrder(ticket.id, "READY", "REFUNDED", ownerId, "OWNER")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await transitionOrder(ticket.id, "READY", "COMPLETED", ownerId, "CASHIER");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true, completedAt: true } })).toMatchObject({ status: "COMPLETED", completedAt: expect.any(Date) });
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("CLEANING");
    expect(await prisma.auditLog.count({ where: { entity: "Order", entityId: ticket.id, action: "ORDER_STATUS_CHANGED" } })).toBe(3);
  });

  it("refunds a completed payment once, retains the charge, and audits the reason", async () => {
    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    const ticket = await prisma.order.create({ data: { orderNumber: `WF-REFUND-${crypto.randomUUID().slice(0, 8)}`, type: "TAKEAWAY", status: "COMPLETED", cashierId: ownerId, subtotal: "500", total: "555", completedAt: new Date(), items: { create: { productId: product.id, productName: "Refund test", quantity: 1, unitPrice: "500" } } } });
    orderIds.push(ticket.id);
    await prisma.payment.create({ data: { orderId: ticket.id, kind: "CHARGE", amount: "555", method: "QRIS", cashierId: ownerId } });
    const refund = await refundPaidOrder(ticket.id, "Pesanan salah", ownerId, "OWNER");
    expect(refund.amount.toFixed(2)).toBe("555.00");
    await expect(refundPaidOrder(ticket.id, "Dobel", ownerId, "OWNER")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(refundPaidOrder(ticket.id, "Tidak berhak", ownerId, "CASHIER")).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true } })).toEqual({ status: "REFUNDED" });
    expect(await prisma.payment.count({ where: { orderId: ticket.id, kind: "CHARGE" } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: ticket.id, kind: "REFUND" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: ticket.id, action: "ORDER_REFUNDED" } })).toBe(1);
  });

  it("requires a cash session for refunds and includes the payout in drawer totals", async () => {
    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    const ticket = await prisma.order.create({ data: { orderNumber: `WF-CASH-REFUND-${crypto.randomUUID().slice(0, 8)}`, type: "TAKEAWAY", status: "READY", cashierId: ownerId, subtotal: "500", total: "555", items: { create: { productId: product.id, productName: "Cash refund test", quantity: 1, unitPrice: "500" } } } });
    orderIds.push(ticket.id);
    await prisma.payment.create({ data: { orderId: ticket.id, kind: "CHARGE", amount: "555", method: "CASH", cashierId: ownerId } });
    await expect(refundPaidOrder(ticket.id, "Salah input", ownerId, "OWNER")).rejects.toMatchObject({ code: "INVALID_STATE" });
    const session = await openCashSession("600", ownerId);
    cashSessionIds.push(session.id);
    await refundPaidOrder(ticket.id, "Salah input", ownerId, "OWNER");
    const live = await getCashSessionLiveTotals(session.id);
    expect(live.cashRefunds.toFixed(2)).toBe("555.00");
    expect(live.expectedClosingCash.toFixed(2)).toBe("45.00");
  });

  it("deducts checkout snapshots atomically and still consumes an ingredient deactivated afterward", async () => {
    const product = await prisma.product.findFirstOrThrow({ select: { id: true, name: true, basePrice: true } });
    const ingredient = await saveIngredient({ name: `Workflow stock ${crypto.randomUUID()}`, unit: "GRAM", minimumStock: "0", isActive: true }, ownerId);
    const ticket = await order("READY");
    try {
      await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "5", unitCost: "0.5000", idempotencyKey: crypto.randomUUID() }, ownerId);
      const item = await prisma.orderItem.create({ data: { orderId: ticket.id, productId: product.id, productName: product.name, quantity: 1, unitPrice: product.basePrice } });
      await prisma.orderItemIngredient.create({ data: { orderItemId: item.id, ingredientId: ingredient.id, ingredientNameSnapshot: ingredient.name, unitSnapshot: ingredient.unit, quantityRequired: "3", costPerUnitSnapshot: "0.4000" } });
      await deactivateIngredient(ingredient.id, ownerId);
      const completions = await Promise.allSettled([
        transitionOrder(ticket.id, "READY", "COMPLETED", ownerId, "CASHIER"),
        transitionOrder(ticket.id, "READY", "COMPLETED", ownerId, "OWNER"),
      ]);
      expect(completions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(completions.filter((result) => result.status === "rejected")).toHaveLength(1);
      const balance = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id }, select: { currentStock: true } });
      expect(balance.currentStock.toFixed(3)).toBe("2.000");
      const sale = await prisma.inventoryTransaction.findFirstOrThrow({ where: { orderId: ticket.id, type: "SALE" } });
      expect(sale.quantityDelta.toFixed(3)).toBe("-3.000");
      expect(sale.unitCostSnapshot?.toFixed(4)).toBe("0.4000");
      await expect(transitionOrder(ticket.id, "READY", "COMPLETED", ownerId, "OWNER")).rejects.toBeDefined();
      expect(await prisma.inventoryTransaction.count({ where: { orderId: ticket.id, type: "SALE" } })).toBe(1);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ticket.id, ingredient.id] } } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.orderItemIngredient.deleteMany({ where: { orderItem: { orderId: ticket.id } } });
      await prisma.orderItem.deleteMany({ where: { orderId: ticket.id } });
      await prisma.order.delete({ where: { id: ticket.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
    }
  });

  it("rolls back order completion and every stock write when one ingredient is insufficient", async () => {
    const product = await prisma.product.findFirstOrThrow({ select: { id: true, name: true, basePrice: true } });
    const ingredient = await saveIngredient({ name: `Insufficient stock ${crypto.randomUUID()}`, unit: "GRAM", minimumStock: "0", isActive: true }, ownerId);
    const stocked = await saveIngredient({ name: `Stocked peer ${crypto.randomUUID()}`, unit: "GRAM", minimumStock: "0", isActive: true }, ownerId);
    const ticket = await order("READY");
    try {
      await recordInventoryMovement({ ingredientId: stocked.id, type: "PURCHASE", quantity: "4", unitCost: "1.0000", idempotencyKey: crypto.randomUUID() }, ownerId);
      const item = await prisma.orderItem.create({ data: { orderId: ticket.id, productId: product.id, productName: product.name, quantity: 1, unitPrice: product.basePrice } });
      await prisma.orderItemIngredient.create({ data: { orderItemId: item.id, ingredientId: ingredient.id, ingredientNameSnapshot: ingredient.name, unitSnapshot: ingredient.unit, quantityRequired: "1", costPerUnitSnapshot: "0.0000" } });
      await prisma.orderItemIngredient.create({ data: { orderItemId: item.id, ingredientId: stocked.id, ingredientNameSnapshot: stocked.name, unitSnapshot: stocked.unit, quantityRequired: "1", costPerUnitSnapshot: "1.0000" } });
      await expect(transitionOrder(ticket.id, "READY", "COMPLETED", ownerId, "CASHIER")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true } })).toEqual({ status: "READY" });
      expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock.isZero()).toBe(true);
      expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: stocked.id } })).currentStock.toFixed(3)).toBe("4.000");
      expect(await prisma.inventoryTransaction.count({ where: { orderId: ticket.id } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { entityId: ticket.id, action: "ORDER_STATUS_CHANGED" } })).toBe(0);
    } finally {
      const movementIds = await prisma.inventoryTransaction.findMany({ where: { ingredientId: stocked.id }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ticket.id, ingredient.id, stocked.id, ...movementIds.map((movement) => movement.id)] } } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: stocked.id } });
      await prisma.orderItemIngredient.deleteMany({ where: { orderItem: { orderId: ticket.id } } });
      await prisma.orderItem.deleteMany({ where: { orderId: ticket.id } });
      await prisma.order.delete({ where: { id: ticket.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: stocked.id } });
    }
  });

  it("allows only one concurrent transition from the same expected status", async () => {
    const ticket = await order("CONFIRMED");
    const results = await Promise.allSettled([
      transitionOrder(ticket.id, "CONFIRMED", "PREPARING", ownerId, "KITCHEN"),
      transitionOrder(ticket.id, "CONFIRMED", "PREPARING", ownerId, "OWNER"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entity: "Order", entityId: ticket.id, action: "ORDER_STATUS_CHANGED" } })).toBe(1);
  });

  it("marks a table group cleaning when its final two orders complete concurrently", async () => {
    const table = await prisma.cafeTable.create({ data: { name: `Concurrent finish ${crypto.randomUUID().slice(0, 8)}`, capacity: 4, status: "OCCUPIED" } });
    tableIds.push(table.id);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const first = await order("READY", table.id);
      const second = await order("READY", table.id);
      const results = await Promise.allSettled([
        transitionOrder(first.id, "READY", "COMPLETED", ownerId, "CASHIER"),
        transitionOrder(second.id, "READY", "COMPLETED", ownerId, "OWNER"),
      ]);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("CLEANING");
      await prisma.cafeTable.update({ where: { id: table.id }, data: { status: "OCCUPIED" } });
    }
  });

  it("does not complete against a stale table assignment while a table move is in flight", async () => {
    const source = await prisma.cafeTable.create({ data: { name: `Move race source ${crypto.randomUUID().slice(0, 8)}`, capacity: 2, status: "OCCUPIED" } });
    const destination = await prisma.cafeTable.create({ data: { name: `Move race destination ${crypto.randomUUID().slice(0, 8)}`, capacity: 2 } });
    tableIds.push(source.id, destination.id);
    const ticket = await order("READY", source.id);
    const results = await Promise.allSettled([
      moveOrderToTable(ticket.id, destination.id, ownerId),
      transitionOrder(ticket.id, "READY", "COMPLETED", ownerId, "CASHIER"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const current = await prisma.order.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true, tableId: true } });
    if (current.status === "COMPLETED") {
      expect(current.tableId).toBe(source.id);
      expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: source.id } })).status).toBe("CLEANING");
      expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: destination.id } })).status).toBe("AVAILABLE");
    } else {
      expect(current.status).toBe("READY");
      expect(current.tableId).toBe(destination.id);
      expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: destination.id } })).status).toBe("OCCUPIED");
    }
  });

  it("returns only a privacy-safe projection of active kitchen orders", async () => {
    const ticket = await order("CONFIRMED");
    const preparing = await order("PREPARING");
    const ready = await order("READY");
    const completed = await order("READY");
    await transitionOrder(completed.id, "READY", "COMPLETED", ownerId, "OWNER");
    const kitchen = await listKitchenOrders();
    const projection = kitchen.find((entry) => entry.id === ticket.id);
    expect(projection).toMatchObject({ id: ticket.id, status: "CONFIRMED", items: [] });
    expect(kitchen.map((entry) => entry.id)).toEqual(expect.arrayContaining([preparing.id, ready.id]));
    expect(kitchen.map((entry) => entry.id)).not.toContain(completed.id);
    expect(projection).not.toHaveProperty("payments");
    expect(projection).not.toHaveProperty("cashier");
    expect(projection).not.toHaveProperty("customer");
    expect(projection).not.toHaveProperty("total");
  });
});
