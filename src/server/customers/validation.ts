import { z } from "zod";

const optional = (max: number) => z.string().trim().max(max).transform((value) => value || null).optional().default(null);

export const customerInputSchema = z.strictObject({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Nama pelanggan wajib diisi.").max(120),
  phone: optional(32),
  email: z.union([z.email().trim().toLowerCase().max(254), z.literal("")]).transform((value) => value || null).optional().default(null),
  notes: optional(1000),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
