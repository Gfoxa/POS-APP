import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db/prisma";

const integrationDescribe = process.env.INVENTORY_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("Phase 5 inventory schema against PostgreSQL", () => {
  it("preserves seeded product recipes and adds addon ownership and checkout snapshots", async () => {
    const prisma = getPrismaClient();
    try {
      const recipes = await prisma.recipe.count({ where: { productId: { not: null } } });
      expect(recipes).toBeGreaterThan(0);
      const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; column_default: string | null }>>`
        SELECT table_name, column_name, column_default FROM information_schema.columns
        WHERE table_schema = current_schema() AND
          ((table_name = 'Ingredient' AND column_name = 'isActive') OR
           (table_name = 'Recipe' AND column_name = 'addonId') OR
           (table_name = 'OrderItemIngredient' AND column_name = 'quantityRequired'))`;
      expect(columns).toHaveLength(3);
      expect(columns.find((column) => column.column_name === "isActive")?.column_default).toBe("true");
      const check = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint WHERE conname = 'Recipe_exactly_one_owner_check'`;
      expect(check).toHaveLength(1);
      const recipeIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'Recipe'`;
      expect(recipeIndexes.map((index) => index.indexname)).toEqual(expect.arrayContaining(["Recipe_productId_key", "Recipe_addonId_key"]));
      const snapshotForeignKeys = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint WHERE conrelid = '"OrderItemIngredient"'::regclass AND contype = 'f'`;
      expect(snapshotForeignKeys.map((constraint) => constraint.conname)).toEqual(expect.arrayContaining(["OrderItemIngredient_orderItemId_fkey", "OrderItemIngredient_ingredientId_fkey"]));
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'OrderItemIngredient'`;
      expect(indexes.map((index) => index.indexname)).toEqual(expect.arrayContaining(["OrderItemIngredient_orderItemId_ingredientId_key", "OrderItemIngredient_ingredientId_idx"]));
      const openingMovements = await prisma.inventoryTransaction.count({ where: { type: "PURCHASE", idempotencyKey: { startsWith: "seed:opening:" } } });
      expect(openingMovements).toBeGreaterThan(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
