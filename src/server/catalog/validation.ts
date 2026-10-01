import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null);

const checkbox = z.preprocess(
  (value) => value === true || value === "on" || value === "true",
  z.boolean(),
);

export const moneyInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Masukkan angka dengan maksimal 2 angka desimal.")
  .refine((value) => {
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return false;
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) > 0n;
  }, "Harga harus lebih besar dari nol.")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  });

const nameInput = z.string().trim().min(1, "Nama wajib diisi.").max(120);
const skuInput = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "SKU wajib diisi.")
  .max(50)
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/, "SKU hanya boleh berisi huruf, angka, titik, garis bawah, dan tanda hubung.");

export const categoryInputSchema = z.object({
  id: z.uuid().optional(),
  name: nameInput,
  description: optionalText(500),
  isActive: checkbox.optional().default(true),
});

export const productInputSchema = z.object({
  id: z.uuid().optional(),
  name: nameInput,
  sku: skuInput,
  categoryId: z.uuid("Pilih kategori yang valid."),
  description: optionalText(2000),
  imageUrl: z.union([z.literal(""), z.url()]).transform((value) => value || null),
  basePrice: moneyInputSchema,
  isActive: checkbox.optional().default(true),
  trackInventory: checkbox.optional().default(false),
});

export const variantInputSchema = z.object({
  id: z.uuid().optional(),
  productId: z.uuid(),
  name: nameInput,
  sku: skuInput,
  price: moneyInputSchema,
  isActive: checkbox.optional().default(true),
});

export const addonInputSchema = z.object({
  id: z.uuid().optional(),
  name: nameInput,
  price: moneyInputSchema,
  isActive: checkbox.optional().default(true),
  productIds: z.array(z.uuid()).max(200).optional().default([]),
});

export const productStatusInputSchema = z.object({
  id: z.uuid(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type AddonInput = z.infer<typeof addonInputSchema>;
