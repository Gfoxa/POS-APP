import { z } from "zod";

const money = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Masukkan nominal yang valid.")
  .refine((value) => {
    if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return false;
    const [whole, cents = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(cents.padEnd(2, "0")) > 0n;
  }, "Nominal harus lebih besar dari nol.")
  .transform((value) => { const [whole, cents = ""] = value.split("."); return `${BigInt(whole)}.${cents.padEnd(2, "0")}`; });

const nonnegativeMoney = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Masukkan nominal yang valid.")
  .transform((value) => { const [whole, cents = ""] = value.split("."); return `${BigInt(whole)}.${cents.padEnd(2, "0")}`; });

export const expenseInputSchema = z.strictObject({
  cashSessionId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null).optional().default(null),
  category: z.string().trim().min(1, "Kategori wajib diisi.").max(80),
  description: z.string().trim().min(1, "Deskripsi wajib diisi.").max(240),
  amount: money,
  paymentMethod: z.enum(["CASH", "QRIS", "DEBIT", "CREDIT_CARD", "OTHER"]),
  incurredAt: z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal pengeluaran tidak valid."),
}).superRefine((value, context) => {
  if (value.paymentMethod === "CASH" && !value.cashSessionId) context.addIssue({ code: "custom", path: ["cashSessionId"], message: "Pilih sesi kasir untuk pengeluaran tunai." });
  if (value.paymentMethod !== "CASH" && value.cashSessionId) context.addIssue({ code: "custom", path: ["cashSessionId"], message: "Sesi kasir hanya berlaku untuk pengeluaran tunai." });
});

export const cashSessionInputSchema = z.strictObject({
  openingCash: nonnegativeMoney,
  actualClosingCash: nonnegativeMoney.optional(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type CashSessionInput = z.infer<typeof cashSessionInputSchema>;
