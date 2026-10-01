import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const basisPoints = z.string().trim().regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Masukkan persentase dari 0 sampai 100.")
  .pipe(z.string().transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  }).refine((value) => value <= 10000, "Persentase tidak boleh melebihi 100%.") );

export const cafeSettingsInputSchema = z.strictObject({
  name: z.string().trim().min(1, "Nama kafe wajib diisi.").max(100),
  address: optionalText(250),
  phone: optionalText(32),
  taxRate: basisPoints,
  serviceChargeRate: basisPoints,
}).transform(({ taxRate, serviceChargeRate, ...identity }) => ({ ...identity, taxRateBasisPoints: taxRate, serviceChargeRateBasisPoints: serviceChargeRate }));

export type CafeSettingsInput = z.infer<typeof cafeSettingsInputSchema>;
