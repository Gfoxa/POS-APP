import "dotenv/config";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { addonInputSchema, productInputSchema, categoryInputSchema } from "@/server/catalog/validation";
import { discountInputSchema, saveDraftInputSchema } from "@/server/orders/validation";
import { splitDraftInputSchema } from "@/server/tables/validation";
import { createCategory, createProduct, saveAddon } from "@/server/services/catalog";
import { cancelDraftOrder, checkoutCart, getPosData } from "@/server/services/orders";
import { saveDiscount } from "@/server/services/discounts";
import { saveTable, setTableOperation } from "@/server/services/tables";
import { saveTableDraft, splitDraftOrder } from "@/server/services/table-orders";

const integrationDescribe = process.env.ORDER_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("dine-in table orders against PostgreSQL", () => {
  const prisma = getPrismaClient();
  const tableIds: string[] = [];
  const orderIds: string[] = [];
  let ownerId = "";
  let categoryId = "";
  let productId = "";
  let addonId = "";
  let discountId = "";
  let catalogSuffix = "";

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before table-order integration tests.");
    ownerId = owner.id;
  });

  async function newTable(name: string, isActive = true) {
    const table = await saveTable({ name, capacity: 4, isActive }, ownerId);
    tableIds.push(table.id);
    return table;
  }

  async function setupProduct(suffix: string) {
    if (productId) return;
    catalogSuffix = suffix;
    const category = await createCategory(categoryInputSchema.parse({ name: `Split category ${suffix}`, description: "Integration test" }), ownerId);
    categoryId = category.id;
    const product = await createProduct(productInputSchema.parse({
      name: `Split product ${suffix}`, sku: `SPL-${suffix}`, categoryId: category.id,
      description: "", imageUrl: "", basePrice: "10000", isActive: "true", trackInventory: "false",
    }), ownerId);
    productId = product.id;
    const addon = await saveAddon(addonInputSchema.parse({ name: `Split addon ${suffix}`, price: "2000", isActive: "true", productIds: [product.id] }), ownerId);
    addonId = addon.id;
  }

  function draft(tableId: string, quantity: number, discountIdValue: string | null = null) {
    return saveDraftInputSchema.parse({
      type: "DINE_IN", tableId, customerId: null, discountId: discountIdValue,
      note: "Dine-in order note", lines: [{ productId, variantId: null, addonIds: [addonId], quantity, note: "Less sugar" }],
    });
  }

  afterAll(async () => {
    if (orderIds.length) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (tableIds.length) {
      await prisma.cafeTable.updateMany({ where: { id: { in: tableIds } }, data: { mergedIntoId: null } });
      await prisma.order.updateMany({ where: { tableId: { in: tableIds } }, data: { tableId: null } });
      await prisma.cafeTable.deleteMany({ where: { id: { in: tableIds } } });
    }
    if (discountId) await prisma.discount.deleteMany({ where: { id: discountId } });
    if (addonId) await prisma.addon.deleteMany({ where: { id: addonId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it("assigns dine-in drafts to an available or occupied table group", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const table = await newTable(`Assign ${suffix}`);
    const first = await saveTableDraft(draft(table.id, 1), ownerId);
    orderIds.push(first.id);
    expect(first.tableId).toBe(table.id);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("OCCUPIED");
    const second = await saveTableDraft(draft(table.id, 1), ownerId);
    orderIds.push(second.id);
    expect(second.tableId).toBe(table.id);
    expect((await getPosData(ownerId)).tables).toEqual(expect.arrayContaining([expect.objectContaining({ id: table.id, status: "OCCUPIED", members: [table.name] })]));
  });

  it("cancels an unpaid dine-in draft and releases its table group into cleaning", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const table = await newTable(`Cancel draft ${suffix}`);
    const order = await saveTableDraft(draft(table.id, 1), ownerId);
    orderIds.push(order.id);
    await cancelDraftOrder(order.id, ownerId);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, cancelledAt: true } })).toMatchObject({ status: "CANCELLED", cancelledAt: expect.any(Date) });
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id }, select: { status: true } })).status).toBe("CLEANING");
  });

  it("rejects reserved and inactive tables without creating a draft", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const reserved = await newTable(`Reserved ${suffix}`);
    await setTableOperation({ tableId: reserved.id, operation: "RESERVE" }, ownerId);
    await expect(saveTableDraft(draft(reserved.id, 1), ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    const inactive = await newTable(`Inactive ${suffix}`, false);
    await expect(saveTableDraft(draft(inactive.id, 1), ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await prisma.order.count({ where: { tableId: { in: [reserved.id, inactive.id] }, status: "DRAFT" } })).toBe(0);
  });

  it("splits selected quantities, item notes, and add-ons into a separately priced draft", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const table = await newTable(`Split ${suffix}`);
    const source = await saveTableDraft(draft(table.id, 3), ownerId);
    orderIds.push(source.id);
    const sourceItem = source.items[0];
    const result = await splitDraftOrder(splitDraftInputSchema.parse({ orderId: source.id, lines: [{ orderItemId: sourceItem.id, quantity: 1 }] }), ownerId);
    orderIds.push(result.splitOrder.id);
    expect(result.sourceOrder.items[0].quantity).toBe(2);
    expect(result.splitOrder.items[0].quantity).toBe(1);
    expect(result.sourceOrder.items[0].note).toBe("Less sugar");
    expect(result.splitOrder.items[0].addons[0].addonName).toBe(`Split addon ${catalogSuffix}`);
    expect(result.sourceOrder.tableId).toBe(table.id);
    expect(result.splitOrder.tableId).toBe(table.id);
    expect(result.sourceOrder.total.equals(new Prisma.Decimal("26640.00"))).toBe(true);
    expect(result.splitOrder.total.equals(new Prisma.Decimal("13320.00"))).toBe(true);
  });

  it("leaves both drafts and audits unchanged when a split would empty the source or exceed its quantity", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const table = await newTable(`No empty ${suffix}`);
    const source = await saveTableDraft(draft(table.id, 2), ownerId);
    orderIds.push(source.id);
    const auditBefore = await prisma.auditLog.count({ where: { entityId: source.id } });
    await expect(splitDraftOrder(splitDraftInputSchema.parse({ orderId: source.id, lines: [{ orderItemId: source.items[0].id, quantity: 2 }] }), ownerId))
      .rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(splitDraftOrder(splitDraftInputSchema.parse({ orderId: source.id, lines: [{ orderItemId: source.items[0].id, quantity: 3 }] }), ownerId))
      .rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: source.id }, include: { items: true } });
    expect(unchanged.items).toHaveLength(1);
    expect(unchanged.items[0].quantity).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: source.id } })).toBe(auditBefore);
  });

  it("serializes concurrent splits so one item quantity cannot be sold twice", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const table = await newTable(`Concurrent split ${suffix}`);
    const source = await saveTableDraft(draft(table.id, 3), ownerId);
    orderIds.push(source.id);
    const splitInput = splitDraftInputSchema.parse({ orderId: source.id, lines: [{ orderItemId: source.items[0].id, quantity: 1 }] });
    const results = await Promise.allSettled([splitDraftOrder(splitInput, ownerId), splitDraftOrder(splitInput, ownerId)]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    for (const result of fulfilled) if (result.status === "fulfilled") orderIds.push(result.value.splitOrder.id);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const remaining = await prisma.order.findUniqueOrThrow({ where: { id: source.id }, include: { items: true } });
    expect(remaining.items[0].quantity).toBe(2);
    expect(await prisma.order.count({ where: { tableId: table.id, status: "DRAFT" } })).toBe(2);
  });

  it("requires a discount to be removed before splitting and prevents splitting a paid order", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    await setupProduct(suffix);
    const table = await newTable(`Protected split ${suffix}`);
    const discount = await saveDiscount(discountInputSchema.parse({ name: `Blocked split ${suffix}`, type: "FIXED_AMOUNT", scope: "ORDER", value: "1000", isActive: true }), ownerId);
    discountId = discount.id;
    const discounted = await saveTableDraft(draft(table.id, 2, discount.id), ownerId);
    orderIds.push(discounted.id);
    await expect(splitDraftOrder(splitDraftInputSchema.parse({ orderId: discounted.id, lines: [{ orderItemId: discounted.items[0].id, quantity: 1 }] }), ownerId))
      .rejects.toMatchObject({ code: "INVALID_STATE" });

    const payable = await saveTableDraft(draft(table.id, 1), ownerId);
    orderIds.push(payable.id);
    await checkoutCart({ ...draft(table.id, 1), orderId: payable.id }, { method: "CASH", tenderedAmount: "13320", referenceNumber: null }, crypto.randomUUID(), ownerId);
    const paidItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: payable.id } });
    await expect(splitDraftOrder(splitDraftInputSchema.parse({ orderId: payable.id, lines: [{ orderItemId: paidItem.id, quantity: 1 }] }), ownerId))
      .rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
