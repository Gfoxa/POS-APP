"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { ingredientInputSchema, inventoryMovementInputSchema, recipeInputSchema } from "@/server/inventory/validation";
import { deactivateIngredient, InventoryError, recordInventoryMovement, saveIngredient, saveRecipe } from "@/server/services/inventory";

const value = (form: FormData, key: string) => form.get(key)?.toString() ?? "";
const checked = (form: FormData, key: string, fallback: boolean) => {
  const entries = form.getAll(key).map(String);
  return entries.length ? entries.includes("true") : fallback;
};

async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const owner = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  if (!owner?.isActive) throw new Error("Pengguna pemilik lokal tidak aktif.");
  return owner.id;
}

function failure(error: unknown, fallback: string): CatalogActionState {
  if (error instanceof InventoryError || error instanceof Error && error.name === "ZodError") return { message: error.message || fallback, error: true };
  console.error("Inventory action failed.", error);
  return { message: fallback, error: true };
}

function refreshInventory() {
  for (const route of ["/inventory", "/inventory/ingredients", "/inventory/recipes", "/products", "/pos", "/orders", "/dashboard", "/kitchen"]) revalidatePath(route);
}

export async function saveIngredientAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("inventory");
  const parsed = ingredientInputSchema.safeParse({ id: value(form, "id") || undefined, name: value(form, "name"), unit: value(form, "unit"), minimumStock: value(form, "minimumStock"), isActive: checked(form, "isActive", true) });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data bahan.", error: true };
  try {
    await saveIngredient(parsed.data, await actorId(user.id));
    refreshInventory();
    return { message: parsed.data.id ? "Bahan berhasil diperbarui." : "Bahan berhasil ditambahkan." };
  } catch (error) { return failure(error, "Bahan belum dapat disimpan."); }
}

export async function deactivateIngredientAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("inventory");
  const id = value(form, "id");
  if (!ingredientInputSchema.shape.id.safeParse(id).success) return { message: "Bahan tidak ditemukan.", error: true };
  try {
    await deactivateIngredient(id, await actorId(user.id));
    refreshInventory();
    return { message: "Bahan dinonaktifkan." };
  } catch (error) { return failure(error, "Bahan belum dapat dinonaktifkan."); }
}

export async function recordInventoryMovementAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("inventory");
  const type = value(form, "type");
  const common = { ingredientId: value(form, "ingredientId"), idempotencyKey: value(form, "idempotencyKey"), note: value(form, "note") };
  const input = type === "PURCHASE" ? { ...common, type, quantity: value(form, "quantity"), unitCost: value(form, "unitCost") }
    : type === "ADJUSTMENT" ? { ...common, type, quantityDelta: value(form, "quantityDelta") }
      : type === "STOCK_OPNAME" ? { ...common, type, countedStock: value(form, "countedStock") }
        : { ...common, type, quantity: value(form, "quantity") };
  const parsed = inventoryMovementInputSchema.safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data pergerakan stok.", error: true };
  try {
    await recordInventoryMovement(parsed.data, await actorId(user.id));
    refreshInventory();
    return { message: "Pergerakan stok berhasil dicatat." };
  } catch (error) { return failure(error, "Pergerakan stok belum dapat dicatat."); }
}

export async function saveRecipeAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("inventory");
  const selectedIngredientIds = form.getAll("ingredientId").map(String);
  const parsed = recipeInputSchema.safeParse({
    productId: value(form, "productId") || undefined,
    addonId: value(form, "addonId") || undefined,
    items: selectedIngredientIds.map((ingredientId) => ({ ingredientId, quantity: value(form, `quantity_${ingredientId}`) })),
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data resep.", error: true };
  try {
    await saveRecipe(parsed.data, await actorId(user.id));
    refreshInventory();
    return { message: "Resep berhasil disimpan." };
  } catch (error) { return failure(error, "Resep belum dapat disimpan."); }
}
