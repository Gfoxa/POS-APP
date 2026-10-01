import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const uuid = z.uuid();
export const orderIdSchema = uuid;
export const refundInputSchema = z.object({ orderId: uuid, reason: z.string().trim().min(3, "Jelaskan alasan pengembalian minimal 3 karakter.").max(500, "Alasan terlalu panjang.") });
const positiveAmount = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Masukkan nominal yang valid.")
  .refine((value) => {
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return false;
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) > 0n;
  }, "Nominal harus lebih besar dari nol.")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  });
const tenderAmount = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Masukkan nominal yang valid.")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  });
const optionalAmount = positiveAmount.nullable().optional();
const dateTime = z.union([
  z.string().trim().refine((value) => !value || !Number.isNaN(Date.parse(value)), "Tanggal tidak valid.").transform((value) => value || null),
  z.null(),
]);
function dateBoundaryTimestamp(value: string, endOfDay: boolean) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+07:00`);
  return Date.parse(value);
}

const orderLineInputSchema = z.object({
  productId: uuid,
  variantId: uuid.nullable().optional(),
  addonIds: z.array(uuid).max(30).optional().default([]),
  quantity: z.number().int().min(1).max(100),
  note: optionalText(500).optional(),
});

export const saveDraftInputSchema = z.object({
  orderId: uuid.optional(),
  type: z.enum(["DINE_IN", "TAKEAWAY"]),
  tableId: uuid.nullable().optional(),
  customerId: uuid.nullable().optional(),
  discountId: uuid.nullable().optional(),
  note: optionalText(1000).optional(),
  lines: z.array(orderLineInputSchema).min(1, "Tambahkan setidaknya satu produk.").max(100),
}).superRefine((value, context) => {
  if (value.type === "DINE_IN" && !value.tableId) context.addIssue({ code: "custom", path: ["tableId"], message: "Pilih meja untuk pesanan makan di tempat." });
  if (value.type === "TAKEAWAY" && value.tableId) context.addIssue({ code: "custom", path: ["tableId"], message: "Pesanan bawa pulang tidak menggunakan meja." });
});

export const checkoutInputSchema = z.object({
  orderId: orderIdSchema,
  method: z.enum(["CASH", "QRIS", "DEBIT", "CREDIT_CARD", "OTHER"]),
  tenderedAmount: tenderAmount,
  referenceNumber: z.string().trim().max(100).transform((value) => value || null).optional(),
});

export const discountInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Nama diskon wajib diisi.").max(120),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  scope: z.enum(["PRODUCT", "ORDER"]),
  value: positiveAmount,
  maxAmount: optionalAmount,
  productId: uuid.nullable().optional(),
  isActive: z.boolean().optional().default(true),
  startsAt: dateTime.optional(),
  endsAt: dateTime.optional(),
}).superRefine((value, context) => {
  if (value.scope === "PRODUCT" && !value.productId) context.addIssue({ code: "custom", path: ["productId"], message: "Pilih produk untuk diskon produk." });
  if (value.scope === "ORDER" && value.productId) context.addIssue({ code: "custom", path: ["productId"], message: "Diskon pesanan tidak boleh memilih produk." });
  if (value.type === "PERCENTAGE") {
    const [whole, fraction = ""] = value.value.split(".");
    if (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) > 10000n) {
      context.addIssue({ code: "custom", path: ["value"], message: "Persentase diskon tidak boleh melebihi 100%." });
    }
  }
  if (value.startsAt && value.endsAt && dateBoundaryTimestamp(value.endsAt, true) <= dateBoundaryTimestamp(value.startsAt, false)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "Tanggal akhir harus setelah tanggal mulai." });
  }
});

export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type DiscountInput = z.infer<typeof discountInputSchema>;
