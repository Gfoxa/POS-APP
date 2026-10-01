import { z } from "zod";
import { USER_ROLES } from "@/lib/permissions/roles";

const password = z.string().min(12, "Kata sandi baru minimal 12 karakter.").max(72).refine((value) => new TextEncoder().encode(value).length <= 72, "Kata sandi terlalu panjang.");
const identity = {
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120),
  email: z.email().trim().toLowerCase().max(254),
  role: z.enum(USER_ROLES),
};

export const newUserInputSchema = z.strictObject({ ...identity, password });
export const updateUserInputSchema = z.strictObject({
  id: z.uuid(), ...identity, isActive: z.boolean(), password: z.union([password, z.literal("")]).optional().default(""),
});
export type NewUserInput = z.infer<typeof newUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
