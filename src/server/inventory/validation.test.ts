import { describe, expect, it } from "vitest";
import { inventoryMovementInputSchema, ingredientInputSchema, recipeInputSchema } from "./validation";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

describe("inventory input validation", () => {
  it("trims ingredient names and rejects stock or cost edits", () => {
    expect(ingredientInputSchema.parse({ name: "  Coffee  ", unit: "GRAM", minimumStock: "1.250" }).name).toBe("Coffee");
    expect(ingredientInputSchema.safeParse({ name: "Coffee", unit: "GRAM", minimumStock: "0", currentStock: "10" }).success).toBe(false);
  });

  it("requires a recipe owner and unique positive ingredient quantities", () => {
    expect(recipeInputSchema.safeParse({ productId: id, addonId: otherId, items: [{ ingredientId: id, quantity: "1" }] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ productId: id, items: [{ ingredientId: id, quantity: "1" }, { ingredientId: id, quantity: "2" }] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ productId: id, items: [{ ingredientId: otherId, quantity: "0" }] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ productId: "bad", items: [{ ingredientId: otherId, quantity: "1" }] }).success).toBe(false);
  });

  it("validates signed adjustment, count, quantity, and cost bounds", () => {
    const base = { ingredientId: id, idempotencyKey: otherId };
    expect(inventoryMovementInputSchema.safeParse({ ...base, type: "ADJUSTMENT", quantityDelta: "-1.250" }).success).toBe(true);
    expect(inventoryMovementInputSchema.safeParse({ ...base, type: "ADJUSTMENT", quantityDelta: "0" }).success).toBe(false);
    expect(inventoryMovementInputSchema.safeParse({ ...base, type: "STOCK_OPNAME", countedStock: "-1" }).success).toBe(false);
    expect(inventoryMovementInputSchema.safeParse({ ...base, type: "PURCHASE", quantity: "1", unitCost: "-2" }).success).toBe(false);
    expect(inventoryMovementInputSchema.safeParse({ ...base, type: "PURCHASE", quantity: "1.0001", unitCost: "2" }).success).toBe(false);
    expect(inventoryMovementInputSchema.safeParse({ ...base, type: "PURCHASE", quantity: "abc", unitCost: "2" }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ productId: id, items: [{ ingredientId: otherId, quantity: "abc" }] }).success).toBe(false);
  });

  it("does not accept SALE from a client", () => {
    expect(inventoryMovementInputSchema.safeParse({ ingredientId: id, type: "SALE", quantity: "1", idempotencyKey: otherId }).success).toBe(false);
  });
});
