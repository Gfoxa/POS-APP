"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRouteAccess } from "@/lib/auth/guards";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { mergeTablesInputSchema, splitDraftInputSchema, tableIdSchema, tableInputSchema, tableStatusInputSchema } from "@/server/tables/validation";
import { splitDraftOrder } from "@/server/services/table-orders";
import { mergeTables, moveOrderToTable, saveTable, setTableOperation, unmergeTable, TableServiceError } from "@/server/services/tables";

export type TableActionState = { message: string; error?: boolean };
const uuid = z.uuid();

function value(formData: FormData, key: string) { return formData.get(key)?.toString() ?? ""; }
function actionFailure(error: unknown): TableActionState {
  if (error instanceof TableServiceError || error instanceof Error && "code" in error) return { message: error.message, error: true };
  console.error("Table action failed.", error);
  return { message: "Permintaan belum dapat diproses. Coba lagi.", error: true };
}
async function actorId(userId: string) {
  if (!isLocalPreviewMode()) return userId;
  const { getPrismaClient } = await import("@/lib/db/prisma");
  const user = await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } });
  return user?.isActive ? user.id : userId;
}
function revalidateTables() { for (const path of ["/pos", "/tables", "/kitchen", "/orders", "/dashboard"]) revalidatePath(path); }

export async function saveTableAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const user = await requireRouteAccess("tables");
  const parsed = tableInputSchema.safeParse({ id: value(formData, "id") || undefined, name: value(formData, "name"), capacity: Number(value(formData, "capacity")), isActive: value(formData, "isActive") !== "false" });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa data meja.", error: true };
  try { await saveTable(parsed.data, await actorId(user.id)); revalidateTables(); return { message: parsed.data.id ? "Meja diperbarui." : "Meja ditambahkan." }; }
  catch (error) { return actionFailure(error); }
}

export async function tableOperationAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const user = await requireRouteAccess("tables");
  const parsed = tableStatusInputSchema.safeParse({ tableId: value(formData, "tableId"), operation: value(formData, "operation") });
  if (!parsed.success) return { message: "Operasi meja tidak valid.", error: true };
  try { await setTableOperation(parsed.data, await actorId(user.id)); revalidateTables(); return { message: "Status meja diperbarui." }; }
  catch (error) { return actionFailure(error); }
}

export async function mergeTablesAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const user = await requireRouteAccess("tables");
  const parsed = mergeTablesInputSchema.safeParse({ primaryTableId: value(formData, "primaryTableId"), memberTableIds: formData.getAll("memberTableIds").map(String) });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Pilih meja untuk digabungkan.", error: true };
  try { await mergeTables(parsed.data, await actorId(user.id)); revalidateTables(); return { message: "Meja berhasil digabungkan." }; }
  catch (error) { return actionFailure(error); }
}

export async function unmergeTableAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const user = await requireRouteAccess("tables");
  const parsed = tableIdSchema.safeParse(value(formData, "tableId"));
  if (!parsed.success) return { message: "Meja tidak ditemukan.", error: true };
  try { await unmergeTable(parsed.data, await actorId(user.id)); revalidateTables(); return { message: "Meja dipisahkan dari grup." }; }
  catch (error) { return actionFailure(error); }
}

export async function moveOrderToTableAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const user = await requireRouteAccess("tables");
  const parsed = z.object({ orderId: uuid, tableId: uuid }).safeParse({ orderId: value(formData, "orderId"), tableId: value(formData, "tableId") });
  if (!parsed.success) return { message: "Pesanan atau meja tidak valid.", error: true };
  try { await moveOrderToTable(parsed.data.orderId, parsed.data.tableId, await actorId(user.id)); revalidateTables(); return { message: "Pesanan dipindahkan." }; }
  catch (error) { return actionFailure(error); }
}

export async function splitDraftAction(_previous: TableActionState, formData: FormData): Promise<TableActionState> {
  const user = await requireRouteAccess("pos");
  let lines: unknown;
  try { lines = JSON.parse(value(formData, "lines")) as unknown; } catch { return { message: "Daftar produk tidak valid.", error: true }; }
  const parsed = splitDraftInputSchema.safeParse({ orderId: value(formData, "orderId"), lines });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Periksa jumlah produk.", error: true };
  try { await splitDraftOrder(parsed.data, await actorId(user.id)); revalidateTables(); return { message: "Tagihan berhasil dipisah." }; }
  catch (error) { return actionFailure(error); }
}
