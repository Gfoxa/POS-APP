"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { discountInputSchema } from "@/server/orders/validation";
import { DiscountServiceError, saveDiscount } from "@/server/services/discounts";

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function checked(formData: FormData, name: string, fallback: boolean) {
  const values = formData.getAll(name).map(String);
  return values.length ? values.includes("true") || values.includes("on") : fallback;
}

function submittedValues(formData: FormData) {
  const values: NonNullable<CatalogActionState["values"]> = {};
  for (const name of new Set(formData.keys())) {
    if (name === "isActive") values[name] = checked(formData, name, true);
    else values[name] = value(formData, name);
  }
  return values;
}

async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const user = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  return user?.isActive ? user.id : null;
}

export async function saveDiscountAction(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("discounts");
  const parsed = discountInputSchema.safeParse({
    id: value(formData, "id") || undefined,
    name: value(formData, "name"),
    type: value(formData, "type"),
    scope: value(formData, "scope"),
    value: value(formData, "value"),
    maxAmount: value(formData, "maxAmount") || null,
    productId: value(formData, "productId") || null,
    isActive: checked(formData, "isActive", true),
    startsAt: value(formData, "startsAt") || null,
    endsAt: value(formData, "endsAt") || null,
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data diskon.", error: true, values: submittedValues(formData) };
  try {
    await saveDiscount(parsed.data, (await actorId(user.id)) ?? user.id);
    revalidatePath("/discounts");
    revalidatePath("/pos");
    return { message: parsed.data.id ? "Diskon berhasil diperbarui." : "Diskon berhasil ditambahkan." };
  } catch (error) {
    if (error instanceof DiscountServiceError) return { message: error.message, error: true, values: submittedValues(formData) };
    console.error("Discount action failed.", error);
    return { message: "Diskon belum dapat diproses. Coba lagi.", error: true, values: submittedValues(formData) };
  }
}
