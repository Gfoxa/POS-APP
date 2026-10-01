import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type { CafeSettingsInput } from "@/server/settings/validation";

type Db = PrismaClient | Prisma.TransactionClient;
export type CafeSettings = { name: string; address: string | null; phone: string | null; taxRateBasisPoints: number; serviceChargeRateBasisPoints: number };
const defaults: CafeSettings = { name: "Kopi Sore", address: null, phone: null, taxRateBasisPoints: 1100, serviceChargeRateBasisPoints: 0 };

export async function getCafeSettings(db: Db = getPrismaClient()): Promise<CafeSettings> {
  const rows = await db.cafeSetting.findMany({ where: { key: { in: ["name", "address", "phone", "taxRateBasisPoints", "serviceChargeRateBasisPoints"] } }, select: { key: true, value: true } });
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const tax = Number(values.get("taxRateBasisPoints") ?? defaults.taxRateBasisPoints);
  const service = Number(values.get("serviceChargeRateBasisPoints") ?? defaults.serviceChargeRateBasisPoints);
  return {
    name: values.get("name") ?? defaults.name,
    address: values.get("address") || null,
    phone: values.get("phone") || null,
    taxRateBasisPoints: Number.isSafeInteger(tax) && tax >= 0 && tax <= 10000 ? tax : defaults.taxRateBasisPoints,
    serviceChargeRateBasisPoints: Number.isSafeInteger(service) && service >= 0 && service <= 10000 ? service : defaults.serviceChargeRateBasisPoints,
  };
}

export class SettingsServiceError extends Error {
  constructor(message: string, readonly code: "DATABASE") { super(message); this.name = "SettingsServiceError"; }
}

export async function saveCafeSettings(input: CafeSettingsInput, actorId: string) {
  const prisma = getPrismaClient();
  const values: Record<string, string> = {
    name: input.name, address: input.address ?? "", phone: input.phone ?? "",
    taxRateBasisPoints: input.taxRateBasisPoints.toString(), serviceChargeRateBasisPoints: input.serviceChargeRateBasisPoints.toString(),
  };
  try {
    return await prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) await tx.cafeSetting.upsert({ where: { key }, create: { key, value, updatedById: actorId }, update: { value, updatedById: actorId } });
      await tx.auditLog.create({ data: { userId: actorId, action: "CAFE_SETTINGS_UPDATED", entity: "CafeSetting", entityId: "cafe", metadata: { taxRateBasisPoints: input.taxRateBasisPoints, serviceChargeRateBasisPoints: input.serviceChargeRateBasisPoints } } });
      return getCafeSettings(tx);
    });
  } catch (error) {
    console.error("Cafe settings update failed.", error);
    throw new SettingsServiceError("Pengaturan kafe belum dapat disimpan. Coba lagi.", "DATABASE");
  }
}
