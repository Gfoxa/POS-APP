import { describe, expect, it } from "vitest";
import { checkoutInputSchema, discountInputSchema, orderIdSchema, saveDraftInputSchema } from "./validation";

const id = "550e8400-e29b-41d4-a716-446655440000";

describe("order input validation", () => {
  it("accepts a bounded cart with optional variant, add-ons, customer, and notes", () => {
    expect(saveDraftInputSchema.safeParse({
      type: "DINE_IN", tableId: id, customerId: id, note: "No straw", lines: [{ productId: id, variantId: id, addonIds: [id], quantity: 2, note: "Less sugar" }],
    }).success).toBe(true);
  });

  it("requires a table for dine-in and forbids tables for takeaway", () => {
    const lines = [{ productId: id, quantity: 1 }];
    expect(saveDraftInputSchema.safeParse({ type: "DINE_IN", tableId: id, lines }).success).toBe(true);
    expect(saveDraftInputSchema.safeParse({ type: "DINE_IN", tableId: null, lines }).success).toBe(false);
    expect(saveDraftInputSchema.safeParse({ type: "TAKEAWAY", tableId: id, lines }).success).toBe(false);
  });

  it("rejects empty carts, invalid IDs, and unsafe quantities", () => {
    expect(saveDraftInputSchema.safeParse({ type: "TAKEAWAY", lines: [] }).success).toBe(false);
    expect(saveDraftInputSchema.safeParse({ type: "TAKEAWAY", lines: [{ productId: "bad", quantity: 0 }] }).success).toBe(false);
  });

  it("validates percentage discounts and requires product IDs only for product scope", () => {
    expect(discountInputSchema.safeParse({ name: "10%", scope: "ORDER", type: "PERCENTAGE", value: "10.00", isActive: true }).success).toBe(true);
    expect(discountInputSchema.safeParse({ name: "Too much", scope: "ORDER", type: "PERCENTAGE", value: "100.01", isActive: true }).success).toBe(false);
    expect(discountInputSchema.safeParse({ name: "Product", scope: "PRODUCT", type: "FIXED_AMOUNT", value: "5000", isActive: true }).success).toBe(false);
    expect(discountInputSchema.safeParse({ name: "One day", scope: "ORDER", type: "PERCENTAGE", value: "10", isActive: true, startsAt: "2026-10-01", endsAt: "2026-10-01" }).success).toBe(true);
  });

  it("validates payment methods, money, and optional reference numbers", () => {
    expect(orderIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(checkoutInputSchema.safeParse({ orderId: id, method: "CASH", tenderedAmount: "10000", referenceNumber: "" }).success).toBe(true);
    expect(checkoutInputSchema.safeParse({ orderId: id, method: "BITCOIN", tenderedAmount: "10000" }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ orderId: id, method: "CASH", tenderedAmount: "-1" }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ orderId: id, method: "CASH", tenderedAmount: "0" }).success).toBe(true);
  });
});
