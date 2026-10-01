import { Prisma } from "@/generated/prisma/client";

export type RecipeRequirementInput = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: string | Prisma.Decimal;
  costPerUnit: string | Prisma.Decimal;
  isActive?: boolean;
};

export type RecipeRequirementLine = {
  orderItemId: string;
  quantity: number;
  product: RecipeRequirementInput[];
  addons: Array<{ quantity: number; recipe: RecipeRequirementInput[] }>;
};

export type RecipeRequirement = {
  orderItemId: string;
  ingredientId: string;
  ingredientNameSnapshot: string;
  unitSnapshot: string;
  quantityRequired: Prisma.Decimal;
  costPerUnitSnapshot: Prisma.Decimal;
};

export function calculateWeightedAverageCost(
  oldQty: Prisma.Decimal,
  oldCost: Prisma.Decimal,
  purchaseQty: Prisma.Decimal,
  purchaseCost: Prisma.Decimal,
): Prisma.Decimal {
  const ExactDecimal = Prisma.Decimal.clone({ precision: 40 });
  const previousQuantity = new ExactDecimal(oldQty.toString());
  const incomingQuantity = new ExactDecimal(purchaseQty.toString());
  const totalQty = previousQuantity.plus(incomingQuantity);
  if (totalQty.isZero()) return new Prisma.Decimal(0).toDecimalPlaces(4);
  const average = previousQuantity.times(oldCost.toString()).plus(incomingQuantity.times(purchaseCost.toString())).div(totalQty).toDecimalPlaces(4, ExactDecimal.ROUND_HALF_UP);
  return new Prisma.Decimal(average.toString());
}

export function calculateRecipeRequirements(lines: RecipeRequirementLine[]): RecipeRequirement[] {
  const values = new Map<string, RecipeRequirement>();
  const addItems = (line: RecipeRequirementLine, items: RecipeRequirementInput[], multiplier: Prisma.Decimal) => {
    for (const item of items) {
      const key = `${line.orderItemId}:${item.ingredientId}`;
      const required = new Prisma.Decimal(item.quantity).times(multiplier);
      const current = values.get(key);
      values.set(key, {
        orderItemId: line.orderItemId,
        ingredientId: item.ingredientId,
        ingredientNameSnapshot: item.ingredientName,
        unitSnapshot: item.unit,
        quantityRequired: (current?.quantityRequired ?? new Prisma.Decimal(0)).plus(required),
        costPerUnitSnapshot: new Prisma.Decimal(item.costPerUnit),
      });
    }
  };
  for (const line of lines) {
    const lineQuantity = new Prisma.Decimal(line.quantity);
    addItems(line, line.product, lineQuantity);
    for (const addon of line.addons) addItems(line, addon.recipe, lineQuantity.times(addon.quantity));
  }
  return [...values.values()].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId) || a.ingredientId.localeCompare(b.ingredientId));
}
