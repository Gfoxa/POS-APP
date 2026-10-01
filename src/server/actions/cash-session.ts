"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { cashSessionInputSchema } from "@/server/finance/validation";
import { closeCashSession, FinanceServiceError, openCashSession } from "@/server/services/finance";

async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const owner = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  if (!owner?.isActive) throw new Error("Pengguna pemilik lokal tidak aktif.");
  return owner.id;
}
function failed(error: unknown): CatalogActionState {
  if (error instanceof FinanceServiceError) return { message: error.message, error: true };
  console.error("Cash session action failed.", error);
  return { message: "Sesi kasir belum dapat diproses. Coba lagi.", error: true };
}

export async function openCashSessionAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("cash-session");
  const parsed = cashSessionInputSchema.safeParse({ openingCash: form.get("openingCash")?.toString() ?? "" });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa uang awal.", error: true };
  try {
    await openCashSession(parsed.data.openingCash, await actorId(user.id));
    revalidatePath("/cash-session"); revalidatePath("/expenses"); revalidatePath("/pos");
    return { message: "Sesi kasir dibuka." };
  } catch (error) { return failed(error); }
}

export async function closeCashSessionAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("cash-session");
  const sessionId = form.get("sessionId")?.toString() ?? "";
  if (!cashSessionInputSchema.shape.openingCash.safeParse(form.get("actualClosingCash")?.toString() ?? "").success || !/^[0-9a-f-]{36}$/i.test(sessionId)) return { message: "Masukkan uang aktual yang valid.", error: true };
  const actual = cashSessionInputSchema.shape.openingCash.parse(form.get("actualClosingCash")?.toString());
  try {
    const closed = await closeCashSession(sessionId, actual, await actorId(user.id));
    revalidatePath("/cash-session"); revalidatePath("/expenses"); revalidatePath("/reports");
    return { message: `Sesi kasir ditutup. Selisih ${closed.difference?.toFixed(2) ?? "0.00"}.` };
  } catch (error) { return failed(error); }
}
