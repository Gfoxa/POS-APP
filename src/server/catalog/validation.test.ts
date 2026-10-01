import { describe, expect, it } from "vitest";
import {
  addonInputSchema,
  categoryInputSchema,
  moneyInputSchema,
  productInputSchema,
  productStatusInputSchema,
  variantInputSchema,
} from "./validation";

describe("catalog validation", () => {
  it("accepts exact positive decimal prices without floating point conversion", () => {
    expect(moneyInputSchema.parse("25000.50")).toBe("25000.50");
    expect(moneyInputSchema.safeParse("0").success).toBe(false);
    expect(moneyInputSchema.safeParse("1e3").success).toBe(false);
    expect(moneyInputSchema.safeParse("9999999999999").success).toBe(false);
  });

  it("trims category names and defaults categories to active", () => {
    expect(categoryInputSchema.parse({ name: "  Coffee  ", description: "" })).toEqual({
      name: "Coffee",
      description: null,
      isActive: true,
    });
    expect(categoryInputSchema.safeParse({ name: "  ", description: "" }).success).toBe(false);
  });

  it("normalizes product SKUs and rejects malformed references and image URLs", () => {
    const parsed = productInputSchema.parse({
      name: " Latte ", sku: " latte-01 ", categoryId: "550e8400-e29b-41d4-a716-446655440000",
      description: "", imageUrl: "", basePrice: "25000.00", isActive: "true", trackInventory: "on",
    });
    expect(parsed.sku).toBe("LATTE-01");
    expect(parsed.basePrice).toBe("25000.00");
    expect(parsed.imageUrl).toBeNull();
    expect(productInputSchema.safeParse({ ...parsed, categoryId: "bad" }).success).toBe(false);
  });

  it("requires valid product references and exact prices for variants and add-ons", () => {
    expect(variantInputSchema.safeParse({ productId: "bad", name: "Large", sku: "LATTE-L", price: "30000" }).success).toBe(false);
    expect(addonInputSchema.safeParse({ name: "Extra shot", price: "7000", isActive: "true" }).success).toBe(true);
    expect(addonInputSchema.safeParse({ name: "Extra shot", price: "-7000", isActive: "true" }).success).toBe(false);
  });

  it("requires an explicit valid status when toggling a product", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(productStatusInputSchema.parse({ id, isActive: "true" }).isActive).toBe(true);
    expect(productStatusInputSchema.safeParse({ id, isActive: "yes" }).success).toBe(false);
    expect(productStatusInputSchema.safeParse({ id }).success).toBe(false);
  });
});
