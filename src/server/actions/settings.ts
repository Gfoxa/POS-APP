"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { cafeSettingsInputSchema } from "@/server/settings/validation";
import { saveCafeSettings, SettingsServiceError } from "@/server/services/settings";

export async function saveCafeSettingsAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("settings");
  const parsed = cafeSettingsInputSchema.safeParse({ name: form.get("name")?.toString() ?? "", address: form.get("address")?.toString() ?? "", phone: form.get("phone")?.toString() ?? "", taxRate: form.get("taxRate")?.toString() ?? "", serviceChargeRate: form.get("serviceChargeRate")?.toString() ?? "" });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa pengaturan kafe.", error: true };
  let actorId = user.id;
  if (isLocalPreviewMode()) {
    const { getPrismaClient } = await import("@/lib/db/prisma");
    const owner = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
    actorId = owner?.isActive ? owner.id : "";
  }
  if (!actorId) return { message: "Pengguna pemilik lokal tidak aktif.", error: true };
  try {
    await saveCafeSettings(parsed.data, actorId);
    revalidatePath("/settings"); revalidatePath("/pos"); revalidatePath("/dashboard");
    return { message: "Pengaturan kafe disimpan. Tarif baru berlaku untuk transaksi berikutnya." };
  } catch (error) {
    if (error instanceof SettingsServiceError) return { message: error.message, error: true };
    console.error("Settings action failed.", error);
    return { message: "Pengaturan belum dapat disimpan. Coba lagi.", error: true };
  }
}
