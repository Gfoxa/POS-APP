"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { customerInputSchema } from "@/server/customers/validation";
import { CustomerServiceError, saveCustomer, setCustomerActive } from "@/server/services/customers";

const value = (form: FormData, key: string) => form.get(key)?.toString() ?? "";
async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const owner = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  if (!owner?.isActive) throw new Error("Pengguna pemilik lokal tidak aktif.");
  return owner.id;
}
function failed(error: unknown): CatalogActionState {
  if (error instanceof CustomerServiceError) return { message: error.message, error: true };
  console.error("Customer action failed.", error);
  return { message: "Data pelanggan belum dapat disimpan. Coba lagi.", error: true };
}

export async function saveCustomerAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("customers");
  const parsed = customerInputSchema.safeParse({ id: value(form, "id") || undefined, name: value(form, "name"), phone: value(form, "phone"), email: value(form, "email"), notes: value(form, "notes") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data pelanggan.", error: true };
  try {
    await saveCustomer(parsed.data, await actorId(user.id));
    revalidatePath("/customers"); revalidatePath("/pos"); revalidatePath("/orders");
    return { message: parsed.data.id ? "Pelanggan diperbarui." : "Pelanggan ditambahkan." };
  } catch (error) { return failed(error); }
}

export async function setCustomerActiveAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("customers");
  const id = form.get("id")?.toString() ?? "";
  const active = form.get("active")?.toString() === "true";
  if (!customerInputSchema.shape.id.safeParse(id).success) return { message: "Pelanggan tidak ditemukan.", error: true };
  try {
    await setCustomerActive(id, active, await actorId(user.id));
    revalidatePath("/customers"); revalidatePath("/pos");
    return { message: active ? "Pelanggan diaktifkan." : "Pelanggan dinonaktifkan." };
  } catch (error) { return failed(error); }
}
