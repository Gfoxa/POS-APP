import { z } from "zod";

const uuid = z.uuid();

export const tableIdSchema = uuid;

export const tableInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Nama meja wajib diisi.").max(40),
  capacity: z.number().int().min(1).max(30),
  isActive: z.boolean().optional(),
});

export const tableStatusInputSchema = z.object({
  tableId: uuid,
  operation: z.enum(["RESERVE", "RELEASE", "START_CLEANING", "MARK_AVAILABLE"]),
});

export const mergeTablesInputSchema = z.object({
  primaryTableId: uuid,
  memberTableIds: z.array(uuid).min(1).max(10),
}).superRefine(({ primaryTableId, memberTableIds }, context) => {
  if (memberTableIds.includes(primaryTableId)) {
    context.addIssue({ code: "custom", path: ["memberTableIds"], message: "Meja utama tidak dapat menjadi anggota grupnya sendiri." });
  }
  if (new Set(memberTableIds).size !== memberTableIds.length) {
    context.addIssue({ code: "custom", path: ["memberTableIds"], message: "Pilih setiap meja satu kali." });
  }
});

export const splitDraftInputSchema = z.object({
  orderId: uuid,
  lines: z.array(z.object({ orderItemId: uuid, quantity: z.number().int().min(1).max(100) })).min(1).max(100),
}).superRefine(({ lines }, context) => {
  const ids = lines.map((line) => line.orderItemId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["lines"], message: "Produk yang sama tidak dapat dipisah dua kali dalam satu aksi." });
  }
});

export type TableInput = z.infer<typeof tableInputSchema>;
export type TableStatusInput = z.infer<typeof tableStatusInputSchema>;
export type MergeTablesInput = z.infer<typeof mergeTablesInputSchema>;
export type SplitDraftInput = z.infer<typeof splitDraftInputSchema>;
