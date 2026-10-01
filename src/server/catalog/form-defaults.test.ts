import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { addonFormDefaults, productFormDefaults, variantFormDefaults } from "./form-defaults";

describe("catalog form defaults", () => {
  it("converts Prisma Decimal prices to plain form strings", () => {
    expect(productFormDefaults({
      id: "product-1", name: "Latte", sku: "LATTE", categoryId: "category-1",
      description: null, imageUrl: null, basePrice: new Prisma.Decimal("25000.5"),
      isActive: true, trackInventory: true,
    })).toEqual({
      id: "product-1", name: "Latte", sku: "LATTE", categoryId: "category-1",
      description: null, imageUrl: null, basePrice: "25000.50", isActive: true, trackInventory: true,
    });
    expect(variantFormDefaults({ id: "variant-1", name: "Large", sku: "LATTE-L", price: new Prisma.Decimal("30000"), isActive: true }).price).toBe("30000.00");
    expect(addonFormDefaults({ id: "addon-1", name: "Extra shot", price: new Prisma.Decimal("7000"), isActive: true, productIds: ["product-1"] }).price).toBe("7000.00");
  });
});
