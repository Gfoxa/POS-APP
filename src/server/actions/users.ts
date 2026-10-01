"use server";

import { revalidatePath } from "next/cache";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { requireRouteAccess } from "@/lib/auth/guards";
import type { CatalogActionState } from "@/server/catalog/action-state";
import { newUserInputSchema, updateUserInputSchema } from "@/server/users/validation";
import { createUser, updateUser, UserServiceError } from "@/server/services/users";

async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const owner = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  return owner?.isActive ? owner.id : "";
}
function failed(error: unknown): CatalogActionState {
  if (error instanceof UserServiceError) return { message: error.message, error: true };
  console.error("User action failed.", error);
  return { message: "Perubahan pengguna belum dapat disimpan.", error: true };
}

export async function createUserAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("users");
  const parsed = newUserInputSchema.safeParse({ name: form.get("name")?.toString() ?? "", email: form.get("email")?.toString() ?? "", password: form.get("password")?.toString() ?? "", role: form.get("role")?.toString() ?? "" });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data pengguna.", error: true };
  const actor = await actorId(user.id);
  if (!actor) return { message: "Pemilik lokal tidak aktif.", error: true };
  try { await createUser(parsed.data, actor); revalidatePath("/users"); return { message: "Pengguna dibuat." }; }
  catch (error) { return failed(error); }
}

export async function updateUserAction(_previous: CatalogActionState, form: FormData): Promise<CatalogActionState> {
  const user = await requireRouteAccess("users");
  const parsed = updateUserInputSchema.safeParse({ id: form.get("id")?.toString() ?? "", name: form.get("name")?.toString() ?? "", email: form.get("email")?.toString() ?? "", password: form.get("password")?.toString() ?? "", role: form.get("role")?.toString() ?? "", isActive: form.getAll("isActive").map(String).includes("true") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data pengguna.", error: true };
  const actor = await actorId(user.id);
  if (!actor) return { message: "Pemilik lokal tidak aktif.", error: true };
  try { await updateUser(parsed.data, actor); revalidatePath("/users"); return { message: "Pengguna diperbarui." }; }
  catch (error) { return failed(error); }
}
