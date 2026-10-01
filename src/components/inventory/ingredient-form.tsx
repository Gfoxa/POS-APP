"use client";

import { useActionState } from "react";
import { saveIngredientAction } from "@/server/actions/inventory";
import { EMPTY_CATALOG_ACTION_STATE, fieldChecked, fieldValue } from "@/server/catalog/action-state";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";

type IngredientDefaults = { id?: string; name?: string; unit?: string; minimumStock?: string; isActive?: boolean };

export function IngredientForm({ initial = {} }: { initial?: IngredientDefaults }) {
  const [state, action, pending] = useActionState(saveIngredientAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="catalog-form">
    {initial.id && <input name="id" type="hidden" value={initial.id} />}
    <label className="catalog-field"><span>Nama bahan</span><input autoComplete="off" defaultValue={fieldValue(state, "name", initial.name ?? "")} maxLength={120} name="name" placeholder="Contoh: Biji kopi" required /></label>
    <label className="catalog-field"><span>Satuan</span><select defaultValue={fieldValue(state, "unit", initial.unit ?? "GRAM")} name="unit"><option value="GRAM">Gram (g)</option><option value="KILOGRAM">Kilogram (kg)</option><option value="MILLILITER">Mililiter (ml)</option><option value="LITER">Liter (l)</option><option value="PIECE">Buah</option></select></label>
    <label className="catalog-field"><span>Batas stok minimum</span><input defaultValue={fieldValue(state, "minimumStock", initial.minimumStock ?? "0")} inputMode="decimal" name="minimumStock" required /></label>
    <label className="catalog-check"><input name="isActive" type="hidden" value="false" /><input defaultChecked={fieldChecked(state, "isActive", initial.isActive ?? true)} name="isActive" type="checkbox" value="true" /><span>Bahan aktif untuk resep dan transaksi baru</span></label>
    <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : initial.id ? "Simpan bahan" : "Tambah bahan"}</button>
    <CatalogFeedback error={state.error} message={state.message} />
  </form>;
}
