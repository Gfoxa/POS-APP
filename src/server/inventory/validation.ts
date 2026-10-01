import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

const uuid = z.uuid();
const decimal = (scale: number, message: string) => z.string().trim()
  .regex(new RegExp(`^\\d{1,11}(?:\\.\\d{1,${scale}})?$`), message);
const nonnegativeQuantity = decimal(3, "Masukkan jumlah yang valid.");
const positiveQuantity = nonnegativeQuantity.pipe(z.string().refine((value) => new Prisma.Decimal(value).greaterThan(0), "Jumlah harus lebih besar dari nol."));
const signedQuantity = z.string().trim().regex(/^-?\d{1,11}(?:\.\d{1,3})?$/, "Masukkan jumlah yang valid.")
  .pipe(z.string().refine((value) => !new Prisma.Decimal(value).isZero(), "Jumlah tidak boleh nol."));
const unitCost = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,4})?$/, "Masukkan biaya satuan yang valid.");
const text = (max: number) => z.string().trim().max(max).transform((value) => value || null).optional();

export const ingredientInputSchema = z.strictObject({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Nama bahan wajib diisi.").max(120),
  unit: z.enum(["GRAM", "KILOGRAM", "MILLILITER", "LITER", "PIECE"]),
  minimumStock: nonnegativeQuantity,
  isActive: z.boolean().optional(),
});

const recipeItemSchema = z.strictObject({ ingredientId: uuid, quantity: positiveQuantity });
export const recipeInputSchema = z.strictObject({
  productId: uuid.optional(),
  addonId: uuid.optional(),
  items: z.array(recipeItemSchema).min(1, "Tambahkan setidaknya satu bahan."),
}).superRefine((value, context) => {
  if (Boolean(value.productId) === Boolean(value.addonId)) context.addIssue({ code: "custom", path: ["productId"], message: "Pilih tepat satu produk atau tambahan." });
  const ids = value.items.map((item) => item.ingredientId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["items"], message: "Bahan yang sama tidak boleh dicantumkan dua kali." });
});

const movementCommon = { ingredientId: uuid, idempotencyKey: uuid, note: text(500) };
export const inventoryMovementInputSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...movementCommon, type: z.literal("PURCHASE"), quantity: positiveQuantity, unitCost }),
  z.strictObject({ ...movementCommon, type: z.literal("ADJUSTMENT"), quantityDelta: signedQuantity }),
  z.strictObject({ ...movementCommon, type: z.literal("WASTE"), quantity: positiveQuantity }),
  z.strictObject({ ...movementCommon, type: z.literal("STOCK_OPNAME"), countedStock: nonnegativeQuantity }),
  z.strictObject({ ...movementCommon, type: z.literal("RETURN"), quantity: positiveQuantity }),
]);

export type IngredientInput = z.infer<typeof ingredientInputSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type InventoryMovementInput = z.infer<typeof inventoryMovementInputSchema>;
