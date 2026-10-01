import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus menggunakan format YYYY-MM-DD.")
  .refine((value) => {
    const [year, month, date] = value.split("-").map(Number);
    const check = new Date(Date.UTC(year, month - 1, date));
    return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date;
  }, "Tanggal tidak valid.");

export const reportRangeSchema = z.strictObject({
  range: z.enum(["TODAY", "YESTERDAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"]).default("TODAY"),
  from: z.preprocess((value) => value === "" ? undefined : value, day.optional()),
  to: z.preprocess((value) => value === "" ? undefined : value, day.optional()),
}).superRefine((value, context) => {
  if (value.range === "CUSTOM" && (!value.from || !value.to)) context.addIssue({ code: "custom", path: ["from"], message: "Isi tanggal awal dan akhir." });
  if (value.range === "CUSTOM" && value.from && value.to && value.from > value.to) context.addIssue({ code: "custom", path: ["to"], message: "Tanggal akhir harus sama atau setelah tanggal awal." });
});

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;
