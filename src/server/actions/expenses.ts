"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { expenseInputSchema } from "@/server/finance/validation";
import { createExpense, FinanceServiceError } from "@/server/services/finance";

async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const owner = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  if (!owner?.isActive) throw new Error("Pengguna pemilik lokal tidak aktif.");
  return owner.id;
}

export async function createExpenseAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("expenses");
  const parsed = expenseInputSchema.safeParse({ cashSessionId: form.get("cashSessionId")?.toString() ?? "", category: form.get("category")?.toString() ?? "", description: form.get("description")?.toString() ?? "", amount: form.get("amount")?.toString() ?? "", paymentMethod: form.get("paymentMethod")?.toString() ?? "", incurredAt: form.get("incurredAt")?.toString() ?? "" });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data pengeluaran.", error: true };
  try {
    await createExpense(parsed.data, await actorId(user.id));
    revalidatePath("/expenses"); revalidatePath("/cash-session"); revalidatePath("/reports"); revalidatePath("/dashboard");
    return { message: "Pengeluaran dicatat." };
  } catch (error) {
    if (error instanceof FinanceServiceError) return { message: error.message, error: true };
    console.error("Expense action failed.", error);
    return { message: "Pengeluaran belum dapat disimpan. Coba lagi.", error: true };
  }
}
