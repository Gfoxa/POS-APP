import { Prisma } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { calculateRecipeRequirements, calculateWeightedAverageCost } from "./calculation";

describe("inventory calculations", () => {
  it("calculates weighted average cost with decimal arithmetic and four-place rounding", () => {
    expect(calculateWeightedAverageCost(new Prisma.Decimal("2"), new Prisma.Decimal("1.1111"), new Prisma.Decimal("1"), new Prisma.Decimal("2")).toFixed(4)).toBe("1.4074");
  });

  it("uses purchase cost when the ingredient has no stock", () => {
    expect(calculateWeightedAverageCost(new Prisma.Decimal("0"), new Prisma.Decimal("0"), new Prisma.Decimal("3"), new Prisma.Decimal("2.12345")).toFixed(4)).toBe("2.1235");
  });

  it("keeps enough precision at the maximum supported quantity and cost", () => {
    expect(calculateWeightedAverageCost(
      new Prisma.Decimal("40000000000.001"),
      new Prisma.Decimal("9000000000.9999"),
      new Prisma.Decimal("40000000000.002"),
      new Prisma.Decimal("9000000000.0000"),
    ).toFixed(4)).toBe("9000000000.4999");
  });

  it("multiplies product and addon recipes and keeps snapshots per order item", () => {
    const requirements = calculateRecipeRequirements([
      { orderItemId: "line-1", quantity: 2, product: [{ ingredientId: "beans", ingredientName: "Coffee", unit: "GRAM", quantity: "18", costPerUnit: "0.5000" }], addons: [{ quantity: 1, recipe: [{ ingredientId: "milk", ingredientName: "Milk", unit: "MILLILITER", quantity: "30", costPerUnit: "0.0100" }] }] },
      { orderItemId: "line-2", quantity: 1, product: [{ ingredientId: "beans", ingredientName: "Coffee", unit: "GRAM", quantity: "18", costPerUnit: "0.5000" }], addons: [{ quantity: 2, recipe: [{ ingredientId: "milk", ingredientName: "Milk", unit: "MILLILITER", quantity: "30", costPerUnit: "0.0100" }] }] },
    ]);
    expect(requirements).toEqual([
      expect.objectContaining({ orderItemId: "line-1", ingredientId: "beans", quantityRequired: new Prisma.Decimal("36") }),
      expect.objectContaining({ orderItemId: "line-1", ingredientId: "milk", quantityRequired: new Prisma.Decimal("60") }),
      expect.objectContaining({ orderItemId: "line-2", ingredientId: "beans", quantityRequired: new Prisma.Decimal("18") }),
      expect.objectContaining({ orderItemId: "line-2", ingredientId: "milk", quantityRequired: new Prisma.Decimal("60") }),
    ]);
  });
});
