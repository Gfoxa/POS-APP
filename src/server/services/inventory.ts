import "server-only";
import { Prisma, type Ingredient, type InventoryTransaction, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import { calculateWeightedAverageCost, type RecipeRequirement } from "@/server/inventory/calculation";
import { ingredientInputSchema, inventoryMovementInputSchema, recipeInputSchema, type IngredientInput, type InventoryMovementInput, type RecipeInput } from "@/server/inventory/validation";

type Db = PrismaClient | Prisma.TransactionClient;

export class InventoryError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "INVALID_INPUT" | "IN_USE" | "INSUFFICIENT_STOCK" | "INACTIVE" | "DATABASE") {
    super(message);
    this.name = "InventoryError";
  }
}

function mapError(error: unknown): never {
  if (error instanceof InventoryError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new InventoryError("Nama atau resep sudah digunakan.", "INVALID_INPUT");
    if (error.code === "P2025") throw new InventoryError("Data bahan atau resep tidak ditemukan.", "NOT_FOUND");
  }
  console.error("Inventory operation failed.", error);
  throw new InventoryError("Perubahan persediaan belum dapat disimpan. Coba lagi.", "DATABASE");
}

async function audit(db: Db, actorId: string, action: string, entity: string, entityId: string, metadata?: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { userId: actorId, action, entity, entityId, metadata } });
}

export async function saveIngredient(input: IngredientInput, actorId: string): Promise<Ingredient> {
  const parsed = ingredientInputSchema.parse(input);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      let saved: Ingredient;
      if (!parsed.id) {
        saved = await tx.ingredient.create({ data: { name: parsed.name, unit: parsed.unit, minimumStock: new Prisma.Decimal(parsed.minimumStock), isActive: parsed.isActive ?? true } });
        await audit(tx, actorId, "INGREDIENT_CREATED", "Ingredient", saved.id, { unit: saved.unit });
      } else {
        await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${parsed.id}::uuid FOR UPDATE`;
        const current = await tx.ingredient.findUnique({ where: { id: parsed.id }, include: { recipes: { select: { id: true }, take: 1 }, transactions: { select: { id: true }, take: 1 }, orderSnapshots: { select: { id: true }, take: 1 } } });
        if (!current) throw new InventoryError("Bahan tidak ditemukan.", "NOT_FOUND");
        if (current.unit !== parsed.unit && (current.recipes.length > 0 || current.transactions.length > 0 || current.orderSnapshots.length > 0)) throw new InventoryError("Satuan tidak dapat diubah karena bahan sudah digunakan.", "IN_USE");
        saved = await tx.ingredient.update({ where: { id: parsed.id }, data: { name: parsed.name, unit: parsed.unit, minimumStock: new Prisma.Decimal(parsed.minimumStock), ...(parsed.isActive === undefined ? {} : { isActive: parsed.isActive }) } });
        await audit(tx, actorId, "INGREDIENT_UPDATED", "Ingredient", saved.id, { unit: saved.unit, isActive: saved.isActive });
      }
      return saved;
    });
  } catch (error) { return mapError(error); }
}

export async function deactivateIngredient(id: string, actorId: string): Promise<void> {
  const prisma = getPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.ingredient.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
      if (!changed.count) throw new InventoryError("Bahan tidak ditemukan atau sudah dinonaktifkan.", "NOT_FOUND");
      await audit(tx, actorId, "INGREDIENT_DEACTIVATED", "Ingredient", id);
    });
  } catch (error) { return mapError(error); }
}

export async function saveRecipe(input: RecipeInput, actorId: string) {
  const parsed = recipeInputSchema.parse(input);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      for (const ingredientId of [...new Set(parsed.items.map((item) => item.ingredientId))].sort()) await lockIngredient(tx, ingredientId);
      const ingredients = await tx.ingredient.findMany({ where: { id: { in: parsed.items.map((item) => item.ingredientId) }, isActive: true }, select: { id: true } });
      if (ingredients.length !== parsed.items.length) throw new InventoryError("Pilih bahan aktif yang tersedia.", "INACTIVE");
      const target = parsed.productId
        ? await tx.product.findUnique({ where: { id: parsed.productId, isActive: true }, select: { id: true, name: true } })
        : await tx.addon.findUnique({ where: { id: parsed.addonId, isActive: true }, select: { id: true, name: true } });
      if (!target) throw new InventoryError("Produk atau tambahan tidak ditemukan atau tidak aktif.", "NOT_FOUND");
      const where = parsed.productId ? { productId: parsed.productId } : { addonId: parsed.addonId };
      const old = await tx.recipe.findFirst({ where, select: { id: true } });
      const recipe = old
        ? await tx.recipe.update({ where: { id: old.id }, data: { name: target.name, items: { deleteMany: {}, create: parsed.items.map((item) => ({ ingredientId: item.ingredientId, quantity: new Prisma.Decimal(item.quantity) })) } }, include: { items: { include: { ingredient: true } } } })
        : await tx.recipe.create({ data: { name: target.name, ...(parsed.productId ? { productId: parsed.productId } : { addonId: parsed.addonId }), items: { create: parsed.items.map((item) => ({ ingredientId: item.ingredientId, quantity: new Prisma.Decimal(item.quantity) })) } }, include: { items: { include: { ingredient: true } } } });
      await audit(tx, actorId, old ? "RECIPE_UPDATED" : "RECIPE_CREATED", "Recipe", recipe.id, { productId: parsed.productId ?? null, addonId: parsed.addonId ?? null, itemCount: recipe.items.length });
      return recipe;
    });
  } catch (error) { return mapError(error); }
}

async function lockIngredient(tx: Prisma.TransactionClient, ingredientId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; currentStock: Prisma.Decimal; costPerUnit: Prisma.Decimal; isActive: boolean }>>`
    SELECT "id", "currentStock", "costPerUnit", "isActive" FROM "Ingredient" WHERE "id" = ${ingredientId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new InventoryError("Bahan tidak ditemukan.", "NOT_FOUND");
  return rows[0];
}

export async function recordInventoryMovement(input: InventoryMovementInput, actorId: string): Promise<InventoryTransaction> {
  const parsed = inventoryMovementInputSchema.parse(input);
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
      if (existing) return existing;
      const ingredient = await lockIngredient(tx, parsed.ingredientId);
      if (!ingredient.isActive) throw new InventoryError("Bahan tidak aktif.", "INACTIVE");
      const retry = await tx.inventoryTransaction.findUnique({ where: { idempotencyKey: parsed.idempotencyKey } });
      if (retry) return retry;
      const current = ingredient.currentStock;
      let delta: Prisma.Decimal;
      let nextCost = ingredient.costPerUnit;
      if (parsed.type === "PURCHASE") {
        const quantity = new Prisma.Decimal(parsed.quantity);
        const cost = new Prisma.Decimal(parsed.unitCost);
        delta = quantity;
        nextCost = calculateWeightedAverageCost(current, ingredient.costPerUnit, quantity, cost);
      } else if (parsed.type === "ADJUSTMENT") {
        delta = new Prisma.Decimal(parsed.quantityDelta);
      } else if (parsed.type === "STOCK_OPNAME") {
        delta = new Prisma.Decimal(parsed.countedStock).minus(current);
      } else if (parsed.type === "WASTE") {
        delta = new Prisma.Decimal(parsed.quantity).negated();
      } else {
        delta = new Prisma.Decimal(parsed.quantity);
      }
      if (delta.isZero()) throw new InventoryError("Perubahan stok tidak boleh nol.", "INVALID_INPUT");
      const nextStock = current.plus(delta);
      if (nextStock.isNegative()) throw new InventoryError("Stok tidak mencukupi.", "INSUFFICIENT_STOCK");
      await tx.ingredient.update({ where: { id: parsed.ingredientId }, data: { currentStock: nextStock, ...(parsed.type === "PURCHASE" ? { costPerUnit: nextCost } : {}) } });
      const row = await tx.inventoryTransaction.create({ data: {
        ingredientId: parsed.ingredientId,
        type: parsed.type,
        quantityDelta: delta,
        unitCostSnapshot: parsed.type === "PURCHASE" ? new Prisma.Decimal(parsed.unitCost) : ingredient.costPerUnit,
        note: parsed.note ?? null,
        idempotencyKey: parsed.idempotencyKey,
        performedById: actorId,
      } });
      await audit(tx, actorId, "INVENTORY_MOVEMENT_RECORDED", "InventoryTransaction", row.id, { type: row.type, ingredientId: row.ingredientId, quantityDelta: row.quantityDelta.toString() });
      return row;
    });
  } catch (error) { return mapError(error); }
}

export async function deductOrderInventoryInTransaction(tx: Prisma.TransactionClient, orderId: string, actorId: string): Promise<void> {
  const snapshots = await tx.orderItemIngredient.findMany({ where: { orderItem: { orderId } }, orderBy: [{ ingredientId: "asc" }, { orderItemId: "asc" }], select: { orderItemId: true, ingredientId: true, quantityRequired: true, costPerUnitSnapshot: true } });
  if (!snapshots.length) return;
  const ids = [...new Set(snapshots.map((row) => row.ingredientId))].sort();
  const locked = new Map<string, Prisma.Decimal>();
  for (const id of ids) locked.set(id, (await lockIngredient(tx, id)).currentStock);
  const totalByIngredient = new Map<string, Prisma.Decimal>();
  for (const row of snapshots) totalByIngredient.set(row.ingredientId, (totalByIngredient.get(row.ingredientId) ?? new Prisma.Decimal(0)).plus(row.quantityRequired));
  for (const [id, needed] of totalByIngredient) if ((locked.get(id) ?? new Prisma.Decimal(0)).lessThan(needed)) throw new InventoryError("Stok bahan tidak mencukupi untuk menyelesaikan pesanan.", "INSUFFICIENT_STOCK");
  for (const [id, needed] of totalByIngredient) await tx.ingredient.update({ where: { id }, data: { currentStock: (locked.get(id) as Prisma.Decimal).minus(needed) } });
  for (const row of snapshots) {
    const idempotencyKey = `sale:${orderId}:${row.orderItemId}:${row.ingredientId}`;
    const movement = await tx.inventoryTransaction.create({ data: { ingredientId: row.ingredientId, type: "SALE", quantityDelta: row.quantityRequired.negated(), unitCostSnapshot: row.costPerUnitSnapshot, idempotencyKey, orderId, orderItemId: row.orderItemId, performedById: actorId, note: "Pengurangan bahan saat pesanan selesai" } });
    await audit(tx, actorId, "INVENTORY_SALE_RECORDED", "InventoryTransaction", movement.id, { orderId, orderItemId: row.orderItemId, ingredientId: row.ingredientId, quantityDelta: movement.quantityDelta.toString() });
  }
}

export async function getInventoryOverview() {
  const prisma = getPrismaClient();
  const [ingredients, recentMovements] = await Promise.all([
    prisma.ingredient.findMany({ where: { isActive: true }, orderBy: { currentStock: "asc" }, select: { id: true, name: true, unit: true, currentStock: true, minimumStock: true } }),
    prisma.inventoryTransaction.findMany({ take: 12, orderBy: { createdAt: "desc" }, include: { ingredient: { select: { name: true, unit: true } }, performedBy: { select: { name: true } } } }),
  ]);
  return { ingredientCount: ingredients.length, stockedIngredientCount: ingredients.filter((ingredient) => ingredient.currentStock.greaterThan(0)).length, lowStock: ingredients.filter((ingredient) => ingredient.currentStock.lte(ingredient.minimumStock)), recentMovements };
}

export async function listIngredients() {
  return getPrismaClient().ingredient.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
}

export async function listRecipes() {
  return getPrismaClient().recipe.findMany({ orderBy: { name: "asc" }, include: { product: { select: { id: true, name: true } }, addon: { select: { id: true, name: true } }, items: { orderBy: { ingredient: { name: "asc" } }, include: { ingredient: { select: { id: true, name: true, unit: true, isActive: true } } } } } });
}

export async function listRecipeTargets() {
  const prisma = getPrismaClient();
  const recipe = { include: { items: { include: { ingredient: { select: { id: true, name: true, unit: true, isActive: true } } } } } };
  const [products, addons] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true }, orderBy: { name: "asc" },
      select: { id: true, name: true, trackInventory: true, recipe },
    }),
    prisma.addon.findMany({
      where: { isActive: true }, orderBy: { name: "asc" },
      select: { id: true, name: true, recipe },
    }),
  ]);
  return { products, addons };
}

export async function listInventoryMovements(take = 100) {
  return getPrismaClient().inventoryTransaction.findMany({ take: Math.min(500, Math.max(1, take)), orderBy: { createdAt: "desc" }, include: { ingredient: { select: { name: true, unit: true } }, performedBy: { select: { name: true } } } });
}

export type { RecipeRequirement };
