import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { recordInventoryMovement, saveIngredient, saveRecipe } from "./inventory";

const integrationDescribe = process.env.INVENTORY_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("inventory service against PostgreSQL", () => {
  it("records purchases atomically, computes weighted cost, and replays an idempotency key", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before inventory integration tests.");
    const suffix = Date.now();
    const ingredient = await saveIngredient({ name: `Inventory test ${suffix}`, unit: "GRAM", minimumStock: "1", isActive: true }, owner.id);
    const key = crypto.randomUUID();
    try {
      const first = await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "2", unitCost: "1.1111", idempotencyKey: key }, owner.id);
      const second = await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "3", unitCost: "2", idempotencyKey: crypto.randomUUID() }, owner.id);
      const retry = await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "9", unitCost: "9", idempotencyKey: key }, owner.id);
      expect(retry.id).toBe(first.id);
      const current = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
      expect(current.currentStock.equals(new Prisma.Decimal("5"))).toBe(true);
      expect(current.costPerUnit.equals(new Prisma.Decimal("1.6444"))).toBe(true);
      expect(await prisma.inventoryTransaction.count({ where: { ingredientId: ingredient.id } })).toBe(2);
      expect(await prisma.auditLog.count({ where: { entity: "InventoryTransaction", action: "INVENTORY_MOVEMENT_RECORDED", entityId: { in: [first.id, second.id] } } })).toBe(2);
    } finally {
      const movements = await prisma.inventoryTransaction.findMany({ where: { ingredientId: ingredient.id }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ingredient.id, ...movements.map((movement) => movement.id)] } } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.$disconnect();
    }
  });

  it("rejects movement that would make stock negative and leaves no ledger row", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const ingredient = await saveIngredient({ name: `Empty ingredient ${Date.now()}`, unit: "PIECE", minimumStock: "0", isActive: true }, owner.id);
    const key = crypto.randomUUID();
    try {
      await expect(recordInventoryMovement({ ingredientId: ingredient.id, type: "WASTE", quantity: "1", idempotencyKey: key }, owner.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      expect(await prisma.inventoryTransaction.count({ where: { ingredientId: ingredient.id } })).toBe(0);
      expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock.isZero()).toBe(true);
    } finally {
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.$disconnect();
    }
  });

  it("serializes competing stock removals so only one can consume the available balance", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const ingredient = await saveIngredient({ name: `Concurrent stock ${Date.now()}`, unit: "GRAM", minimumStock: "0", isActive: true }, owner.id);
    try {
      await recordInventoryMovement({ ingredientId: ingredient.id, type: "PURCHASE", quantity: "5", unitCost: "1", idempotencyKey: crypto.randomUUID() }, owner.id);
      const outcomes = await Promise.allSettled([
        recordInventoryMovement({ ingredientId: ingredient.id, type: "WASTE", quantity: "4", idempotencyKey: crypto.randomUUID() }, owner.id),
        recordInventoryMovement({ ingredientId: ingredient.id, type: "WASTE", quantity: "4", idempotencyKey: crypto.randomUUID() }, owner.id),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
      expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock.toFixed(3)).toBe("1.000");
      expect(await prisma.inventoryTransaction.count({ where: { ingredientId: ingredient.id } })).toBe(2);
    } finally {
      const movements = await prisma.inventoryTransaction.findMany({ where: { ingredientId: ingredient.id }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ingredient.id, ...movements.map((movement) => movement.id)] } } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.$disconnect();
    }
  });

  it("records adjustment, waste, stock opname, and return as signed balance changes", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const ingredient = await saveIngredient({ name: `Movement signs ${Date.now()}`, unit: "GRAM", minimumStock: "0", isActive: true }, owner.id);
    try {
      const common = { ingredientId: ingredient.id };
      const movements = [
        await recordInventoryMovement({ ...common, type: "PURCHASE", quantity: "10", unitCost: "1", idempotencyKey: crypto.randomUUID() }, owner.id),
        await recordInventoryMovement({ ...common, type: "ADJUSTMENT", quantityDelta: "-2", idempotencyKey: crypto.randomUUID() }, owner.id),
        await recordInventoryMovement({ ...common, type: "WASTE", quantity: "2", idempotencyKey: crypto.randomUUID() }, owner.id),
        await recordInventoryMovement({ ...common, type: "STOCK_OPNAME", countedStock: "4", idempotencyKey: crypto.randomUUID() }, owner.id),
        await recordInventoryMovement({ ...common, type: "RETURN", quantity: "1", idempotencyKey: crypto.randomUUID() }, owner.id),
      ];
      expect(movements.map((movement) => movement.quantityDelta.toFixed(3))).toEqual(["10.000", "-2.000", "-2.000", "-2.000", "1.000"]);
      expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock.toFixed(3)).toBe("5.000");
      await expect(recordInventoryMovement({ ...common, type: "STOCK_OPNAME", countedStock: "5", idempotencyKey: crypto.randomUUID() }, owner.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    } finally {
      const movements = await prisma.inventoryTransaction.findMany({ where: { ingredientId: ingredient.id }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ingredient.id, ...movements.map((movement) => movement.id)] } } });
      await prisma.inventoryTransaction.deleteMany({ where: { ingredientId: ingredient.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.$disconnect();
    }
  });

  it("prevents unit changes after recipe history and supports addon-owned recipes", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const suffix = Date.now();
    const ingredient = await saveIngredient({ name: `Addon ingredient ${suffix}`, unit: "GRAM", minimumStock: "0", isActive: true }, owner.id);
    const addon = await prisma.addon.create({ data: { name: `Recipe addon ${suffix}`, price: "100.00" } });
    try {
      const recipe = await saveRecipe({ addonId: addon.id, items: [{ ingredientId: ingredient.id, quantity: "1" }] }, owner.id);
      expect(recipe.addonId).toBe(addon.id);
      await expect(saveIngredient({ id: ingredient.id, name: ingredient.name, unit: "KILOGRAM", minimumStock: "0", isActive: true }, owner.id)).rejects.toMatchObject({ code: "IN_USE" });
      await expect(saveIngredient({ name: ingredient.name, unit: "GRAM", minimumStock: "0", isActive: true }, owner.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    } finally {
      const recipe = await prisma.recipe.findUnique({ where: { addonId: addon.id }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [ingredient.id, addon.id, ...(recipe ? [recipe.id] : [])] } } });
      if (recipe) await prisma.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
      await prisma.recipe.deleteMany({ where: { addonId: addon.id } });
      await prisma.addon.delete({ where: { id: addon.id } });
      await prisma.ingredient.delete({ where: { id: ingredient.id } });
      await prisma.$disconnect();
    }
  });
});
