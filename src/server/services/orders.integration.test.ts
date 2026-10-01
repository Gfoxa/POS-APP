import "dotenv/config";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { createCategory, createProduct, createVariant, deleteVariant } from "@/server/services/catalog";
import { checkoutOrder, checkoutCart, saveDraftOrder, cancelDraftOrder, getOrderForReceipt } from "@/server/services/orders";
import { discountInputSchema } from "@/server/orders/validation";
import { saveDiscount } from "@/server/services/discounts";
import { deactivateIngredient, recordInventoryMovement, saveIngredient, saveRecipe } from "./inventory";
import { openCashSession } from "./finance";
import { cafeSettingsInputSchema } from "@/server/settings/validation";
import { getCafeSettings, saveCafeSettings } from "./settings";

const integrationDescribe = process.env.ORDER_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("POS order services against PostgreSQL", () => {
  it("requires cashier sessions at payment and attaches each payment to the locked session", async () => {
    const prisma = getPrismaClient();
    const cashier = await prisma.user.findFirstOrThrow({ where: { role: { name: "CASHIER" }, isActive: true }, select: { id: true } });
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Session checkout ${suffix}`, description: null, isActive: true }, cashier.id);
    const product = await createProduct({ name: `Session sale ${suffix}`, sku: `CS-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000", isActive: true, trackInventory: false }, cashier.id);
    let orderId: string | undefined;
    let sessionId: string | undefined;
    try {
      const draft = await saveDraftOrder({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }] }, cashier.id);
      orderId = draft.id;
      await expect(checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "50000", referenceNumber: null }, cashier.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
      expect(await prisma.payment.count({ where: { orderId: draft.id } })).toBe(0);
      const session = await openCashSession("0", cashier.id);
      sessionId = session.id;
      const paid = await checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "50000", referenceNumber: null }, cashier.id);
      expect(paid.payments[0].cashSessionId).toBe(session.id);
    } finally {
      if (orderId) { await prisma.auditLog.deleteMany({ where: { entityId: orderId } }); await prisma.payment.deleteMany({ where: { orderId } }); await prisma.orderItem.deleteMany({ where: { orderId } }); await prisma.order.deleteMany({ where: { id: orderId } }); }
      if (sessionId) { await prisma.auditLog.deleteMany({ where: { entityId: sessionId } }); await prisma.cashSession.deleteMany({ where: { id: sessionId } }); }
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("applies cafe tax and service settings to server checkout totals", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const original = await getCafeSettings();
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Configured tax ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `Configured rate item ${suffix}`, sku: `CR-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000", isActive: true, trackInventory: false }, owner.id);
    let orderId: string | undefined;
    try {
      await saveCafeSettings(cafeSettingsInputSchema.parse({ name: original.name, address: original.address ?? "", phone: original.phone ?? "", taxRate: "10.5", serviceChargeRate: "2" }), owner.id);
      const order = await checkoutCart({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }] }, { method: "CASH", tenderedAmount: "2000", referenceNumber: null }, crypto.randomUUID(), owner.id);
      orderId = order.id;
      expect(order.taxRate.toFixed(5)).toBe("0.10500");
      expect(order.taxAmount.toFixed(2)).toBe("105.00");
      expect(order.serviceChargeRate.toFixed(5)).toBe("0.02000");
      expect(order.serviceChargeAmount.toFixed(2)).toBe("20.00");
      expect(order.total.toFixed(2)).toBe("1125.00");
    } finally {
      await saveCafeSettings(cafeSettingsInputSchema.parse({ name: original.name, address: original.address ?? "", phone: original.phone ?? "", taxRate: (original.taxRateBasisPoints / 100).toFixed(2), serviceChargeRate: (original.serviceChargeRateBasisPoints / 100).toFixed(2) }), owner.id);
      if (orderId) { await prisma.auditLog.deleteMany({ where: { entityId: orderId } }); await prisma.payment.deleteMany({ where: { orderId } }); await prisma.orderItem.deleteMany({ where: { orderId } }); await prisma.order.deleteMany({ where: { id: orderId } }); }
      await prisma.auditLog.deleteMany({ where: { entity: "Product", entityId: product.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("refuses to snapshot a recipe after its ingredient has been deactivated", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = Date.now();
    const category = await createCategory({ name: `Inactive recipe ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `Inactive milk product ${suffix}`, sku: `IM-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: true }, owner.id);
    const ingredient = await saveIngredient({ name: `Inactive milk ${suffix}`, unit: "MILLILITER", minimumStock: "0", isActive: true }, owner.id);
    try {
      await saveRecipe({ productId: product.id, items: [{ ingredientId: ingredient.id, quantity: "10" }] }, owner.id);
      await deactivateIngredient(ingredient.id, owner.id);
      const orderId = crypto.randomUUID();
      await expect(checkoutCart({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }] }, { method: "CASH", tenderedAmount: "1110.00", referenceNumber: null }, orderId, owner.id)).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      expect(await prisma.order.findUnique({ where: { id: orderId } })).toBeNull();
      expect(await prisma.payment.count({ where: { orderId } })).toBe(0);
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [product.id, ingredient.id] } } });
      await prisma.recipeItem.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.recipe.deleteMany({ where: { productId: product.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("writes inventory snapshots when checking out a previously saved draft", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = Date.now();
    const category = await createCategory({ name: `Saved snapshot ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `Saved recipe product ${suffix}`, sku: `SD-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: true }, owner.id);
    const ingredient = await saveIngredient({ name: `Saved recipe ingredient ${suffix}`, unit: "GRAM", minimumStock: "0", isActive: true }, owner.id);
    let orderId: string | undefined;
    try {
      await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "10", unitCost: "2.0000", idempotencyKey: crypto.randomUUID() }, owner.id);
      await saveRecipe({ productId: product.id, items: [{ ingredientId: ingredient.id, quantity: "4.5" }] }, owner.id);
      const draft = await saveDraftOrder({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 2, note: null }] }, owner.id);
      orderId = draft.id;
      expect(await prisma.orderItemIngredient.count({ where: { orderItem: { orderId: draft.id } } })).toBe(0);
      const order = await checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "2220.00", referenceNumber: null }, owner.id);
      const snapshots = await prisma.orderItemIngredient.findMany({ where: { orderItem: { orderId: order.id } } });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].quantityRequired.toFixed(3)).toBe("9.000");
      expect(snapshots[0].costPerUnitSnapshot.toFixed(4)).toBe("2.0000");
    } finally {
      if (orderId) {
        await prisma.auditLog.deleteMany({ where: { entityId: { in: [orderId, ingredient.id] } } });
        await prisma.orderItemIngredient.deleteMany({ where: { orderItem: { orderId } } });
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.recipeItem.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.recipe.deleteMany({ where: { productId: product.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [product.id, ingredient.id] } } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("checks out a saved draft that contains an add-on", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = Date.now();
    const category = await createCategory({ name: `Draft addon ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `Draft addon product ${suffix}`, sku: `DA-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: false }, owner.id);
    const addon = await prisma.addon.create({ data: { name: `Draft addon option ${suffix}`, price: "100.00", products: { connect: { id: product.id } } } });
    let orderId: string | undefined;
    try {
      const draft = await saveDraftOrder({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [addon.id], quantity: 1, note: null }] }, owner.id);
      orderId = draft.id;
      const order = await checkoutOrder({ orderId, method: "CASH", tenderedAmount: "1221.00", referenceNumber: null }, owner.id);
      expect(order.status).toBe("CONFIRMED");
      expect(order.items[0].addons).toHaveLength(1);
      expect(order.items[0].addons[0].addonId).toBe(addon.id);
    } finally {
      if (orderId) {
        await prisma.auditLog.deleteMany({ where: { entityId: orderId } });
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItemAddon.deleteMany({ where: { orderItem: { orderId } } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.addon.delete({ where: { id: addon.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("captures immutable ingredient requirements and costs for a new cart", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = Date.now();
    const category = await createCategory({ name: `Snapshot ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `Snapshot latte ${suffix}`, sku: `SN-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: true }, owner.id);
    const ingredient = await saveIngredient({ name: `Snapshot milk ${suffix}`, unit: "MILLILITER", minimumStock: "0", isActive: true }, owner.id);
    const addon = await prisma.addon.create({ data: { name: `No inventory addon ${suffix}`, price: "100.00", products: { connect: { id: product.id } } } });
    const key = crypto.randomUUID();
    let orderId: string | undefined;
    try {
      await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "100", unitCost: "0.1250", idempotencyKey: crypto.randomUUID() }, owner.id);
      await saveRecipe({ productId: product.id, items: [{ ingredientId: ingredient.id, quantity: "30" }] }, owner.id);
      const order = await checkoutCart({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [addon.id], quantity: 2, note: null }] }, { method: "CASH", tenderedAmount: "2442.00", referenceNumber: null }, key, owner.id);
      orderId = order.id;
      const before = await prisma.orderItemIngredient.findMany({ where: { orderItem: { orderId: order.id } } });
      expect(before).toHaveLength(1);
      expect(before[0].quantityRequired.equals(new Prisma.Decimal("60"))).toBe(true);
      expect(before[0].costPerUnitSnapshot.equals(new Prisma.Decimal("0.1250"))).toBe(true);
      await saveIngredient({ id: ingredient.id, name: `Renamed milk ${suffix}`, unit: "MILLILITER", minimumStock: "0", isActive: true }, owner.id);
      await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "100", unitCost: "1.0000", idempotencyKey: crypto.randomUUID() }, owner.id);
      await saveRecipe({ productId: product.id, items: [{ ingredientId: ingredient.id, quantity: "45" }] }, owner.id);
      const after = await prisma.orderItemIngredient.findMany({ where: { orderItem: { orderId: order.id } } });
      expect(after[0].ingredientNameSnapshot).toBe(before[0].ingredientNameSnapshot);
      expect(after[0].quantityRequired.equals(new Prisma.Decimal("60"))).toBe(true);
      expect(after[0].costPerUnitSnapshot.equals(new Prisma.Decimal("0.1250"))).toBe(true);
    } finally {
      if (orderId) {
        await prisma.auditLog.deleteMany({ where: { entityId: { in: [orderId, ingredient.id] } } });
        await prisma.orderItemIngredient.deleteMany({ where: { orderItem: { orderId } } });
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.recipeItem.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.recipe.deleteMany({ where: { productId: product.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [product.id, ingredient.id] } } });
      await prisma.addon.delete({ where: { id: addon.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("rejects checkout of a tracked product without a recipe before charging", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = Date.now();
    const category = await createCategory({ name: `Recipe required ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `No recipe ${suffix}`, sku: `NR-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: true }, owner.id);
    let orderId: string | undefined;
    try {
      const draft = await saveDraftOrder({ type: "TAKEAWAY", customerId: null, discountId: null, note: null, lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }] }, owner.id);
      orderId = draft.id;
      await expect(checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "1110.00", referenceNumber: null }, owner.id)).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: draft.id }, select: { status: true } })).toEqual({ status: "DRAFT" });
      expect(await prisma.payment.count({ where: { orderId: draft.id } })).toBe(0);
    } finally {
      if (orderId) {
        await prisma.auditLog.deleteMany({ where: { entity: "Order", entityId: orderId } });
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.category.delete({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("holds/resumes a draft and atomically checks out one payment using current catalog prices", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before order integration tests.");
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Order test ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({
      name: `Order product ${suffix}`, sku: `ORD-${suffix}`, categoryId: category.id,
      description: null, imageUrl: null, basePrice: "100000.00", isActive: true, trackInventory: false,
    }, owner.id);
    const variant = await createVariant({ productId: product.id, name: "Draft-only large", sku: `DVL-${suffix}`, price: "100000.00", isActive: true }, owner.id);
    const discount = await saveDiscount(discountInputSchema.parse({
      name: `Order discount ${suffix}`, type: "FIXED_AMOUNT", scope: "ORDER", value: "10000.00", isActive: true,
    }), owner.id);
    let orderId: string | undefined;

    try {
      const draft = await saveDraftOrder({
        type: "TAKEAWAY", customerId: null, discountId: discount.id, note: "test draft",
        lines: [{ productId: product.id, variantId: variant.id, addonIds: [], quantity: 1, note: null }],
      }, owner.id);
      orderId = draft.id;
      await expect(deleteVariant(variant.id, owner.id)).rejects.toMatchObject({ code: "IN_USE" });
      expect(draft.status).toBe("DRAFT");
      expect(draft.total.equals(new Prisma.Decimal("99900.00"))).toBe(true);
      expect(draft.discountName).toBe(discount.name);

      await prisma.product.update({ where: { id: product.id }, data: { basePrice: new Prisma.Decimal("110000.00") } });
      const resumed = await saveDraftOrder({
        orderId: draft.id, type: "TAKEAWAY", customerId: null, discountId: discount.id, note: "resumed",
        lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }],
      }, owner.id);
      expect(resumed.note).toBe("resumed");

      const concurrentCheckout = await Promise.allSettled([
        checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "130000.00", referenceNumber: null }, owner.id),
        checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "130000.00", referenceNumber: null }, owner.id),
      ]);
      expect(concurrentCheckout.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const successfulCheckout = concurrentCheckout.find((result) => result.status === "fulfilled");
      if (!successfulCheckout || successfulCheckout.status !== "fulfilled") throw new Error("One of the concurrent checkouts must succeed.");
      const checkedOut = successfulCheckout.value;
      expect(checkedOut.status).toBe("CONFIRMED");
      expect(checkedOut.total.equals(new Prisma.Decimal("111000.00"))).toBe(true);
      expect(checkedOut.discountAmount.equals(new Prisma.Decimal("10000.00"))).toBe(true);
      expect(checkedOut.discountName).toBe(discount.name);
      expect(checkedOut.payments).toHaveLength(1);
      expect(checkedOut.payments[0].amount.equals(checkedOut.total)).toBe(true);
      expect(checkedOut.payments[0].tenderedAmount?.equals(new Prisma.Decimal("130000.00"))).toBe(true);
      expect(checkedOut.payments[0].changeAmount?.equals(new Prisma.Decimal("19000.00"))).toBe(true);
      await expect(checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "130000.00", referenceNumber: null }, owner.id))
        .rejects.toMatchObject({ code: "INVALID_STATE" });
      const receipt = await getOrderForReceipt(draft.id);
      expect(receipt?.items[0].productName).toBe(product.name);
      expect(receipt?.items[0].unitPrice.equals(new Prisma.Decimal("110000.00"))).toBe(true);
      expect(receipt?.taxRate.equals(new Prisma.Decimal("0.11000"))).toBe(true);
      expect(receipt?.discountName).toBe(discount.name);
    } finally {
      if (orderId) {
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.discount.deleteMany({ where: { id: discount.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("does not leave a partially checked out order when tender is invalid", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before order integration tests.");
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Invalid tender ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({
      name: `Invalid product ${suffix}`, sku: `INV-${suffix}`, categoryId: category.id,
      description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: false,
    }, owner.id);
    let orderId: string | undefined;
    try {
      const draft = await saveDraftOrder({
        type: "TAKEAWAY", customerId: null, discountId: null, note: null,
        lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }],
      }, owner.id);
      orderId = draft.id;
      await expect(checkoutOrder({ orderId: draft.id, method: "CASH", tenderedAmount: "1.00", referenceNumber: null }, owner.id))
        .rejects.toMatchObject({ code: "INVALID_PAYMENT" });
      expect(await prisma.order.findUnique({ where: { id: draft.id }, select: { status: true } })).toMatchObject({ status: "DRAFT" });
      expect(await prisma.payment.count({ where: { orderId: draft.id } })).toBe(0);
    } finally {
      if (orderId) {
        await cancelDraftOrder(orderId, owner.id);
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("does not create or mutate a cart when tender is rejected, and prevents duplicate cart retries", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before order integration tests.");
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Atomic checkout ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({
      name: `Atomic product ${suffix}`, sku: `ATM-${suffix}`, categoryId: category.id,
      description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: false,
    }, owner.id);
    const key = crypto.randomUUID();
    const input = { type: "TAKEAWAY" as const, customerId: null, discountId: null, note: "original", lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }] };
    let orderId: string | undefined;
    try {
      await expect(checkoutCart(input, { method: "CASH", tenderedAmount: "1.00", referenceNumber: null }, key, owner.id))
        .rejects.toMatchObject({ code: "INVALID_PAYMENT" });
      expect(await prisma.order.findUnique({ where: { id: key } })).toBeNull();
      expect(await prisma.auditLog.count({ where: { entity: "Order", entityId: key } })).toBe(0);

      const checkedOut = await checkoutCart(input, { method: "CASH", tenderedAmount: "1110.00", referenceNumber: null }, key, owner.id);
      orderId = checkedOut.id;
      expect(checkedOut.status).toBe("CONFIRMED");
      expect(checkedOut.payments).toHaveLength(1);
      await expect(checkoutCart({ ...input, note: "retry modified" }, { method: "CASH", tenderedAmount: "1110.00", referenceNumber: null }, key, owner.id))
        .rejects.toBeDefined();
      expect(await prisma.order.count({ where: { cashierId: owner.id, status: "CONFIRMED", id: key } })).toBe(1);
      expect(await prisma.payment.count({ where: { orderId: key } })).toBe(1);
      expect((await prisma.order.findUnique({ where: { id: key }, select: { note: true } }))?.note).toBe("original");
    } finally {
      if (orderId) {
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });

  it("keeps a draft save from rewriting the order after a concurrent checkout", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before order integration tests.");
    const suffix = `${Date.now()}`;
    const category = await createCategory({ name: `Save race ${suffix}`, description: null, isActive: true }, owner.id);
    const product = await createProduct({ name: `Race product ${suffix}`, sku: `RAC-${suffix}`, categoryId: category.id, description: null, imageUrl: null, basePrice: "1000.00", isActive: true, trackInventory: false }, owner.id);
    let orderId: string | undefined;
    try {
      const original = { type: "TAKEAWAY" as const, customerId: null, discountId: null, note: "before", lines: [{ productId: product.id, variantId: null, addonIds: [], quantity: 1, note: null }] };
      const draft = await saveDraftOrder(original, owner.id);
      orderId = draft.id;
      const [saveResult, checkoutResult] = await Promise.allSettled([
        saveDraftOrder({ ...original, orderId: draft.id, note: "concurrent edit", lines: [{ ...original.lines[0], quantity: 2 }] }, owner.id),
        checkoutCart({ ...original, orderId: draft.id }, { method: "CASH", tenderedAmount: "1110.00", referenceNumber: null }, crypto.randomUUID(), owner.id),
      ]);
      expect(checkoutResult.status === "fulfilled" || saveResult.status === "fulfilled").toBe(true);
      const final = await prisma.order.findUnique({ where: { id: draft.id }, include: { items: true, payments: true } });
      expect(final).not.toBeNull();
      if (final?.status === "CONFIRMED") {
        expect(final.payments).toHaveLength(1);
        expect(final.payments[0].amount.equals(final.total)).toBe(true);
        expect(final.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(1);
        expect(final.note).toBe("before");
      } else {
        expect(final?.status).toBe("DRAFT");
        expect(final?.payments).toHaveLength(0);
      }
    } finally {
      if (orderId) {
        await prisma.payment.deleteMany({ where: { orderId } });
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
      }
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.category.deleteMany({ where: { id: category.id } });
      await prisma.$disconnect();
    }
  });
});
