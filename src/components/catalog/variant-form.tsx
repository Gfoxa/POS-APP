"use client";

import { useActionState } from "react";
import { deleteVariantAction, saveVariantAction } from "@/server/actions/catalog";
import { EMPTY_CATALOG_ACTION_STATE, fieldChecked, fieldValue } from "@/server/catalog/action-state";
import type { VariantFormDefaults } from "@/server/catalog/form-defaults";
import { CatalogFeedback } from "./catalog-feedback";

export function VariantForm({ productId, initial = {} }: { productId: string; initial?: Partial<VariantFormDefaults> }) {
  const [state, formAction, pending] = useActionState(saveVariantAction, EMPTY_CATALOG_ACTION_STATE);
  const price = fieldValue(state, "price", initial.price ?? "");
  return (
    <form action={formAction} className="catalog-form catalog-form--variant">
      <input name="productId" type="hidden" value={productId} />
      {initial.id && <input name="id" type="hidden" value={initial.id} />}
      <label className="catalog-field"><span>Nama varian</span><input defaultValue={fieldValue(state, "name", initial.name ?? "")} maxLength={120} name="name" placeholder="Regular / Large" required /></label>
      <label className="catalog-field"><span>SKU varian</span><input defaultValue={fieldValue(state, "sku", initial.sku ?? "")} maxLength={50} name="sku" placeholder="LATTE-L" required /></label>
      <label className="catalog-field"><span>Harga <small>Rp</small></span><input defaultValue={price} inputMode="decimal" name="price" placeholder="30000" required /></label>
      <label className="catalog-check"><input name="isActive" type="hidden" value="false" /><input defaultChecked={fieldChecked(state, "isActive", initial.isActive ?? true)} name="isActive" type="checkbox" value="true" /><span>Aktif</span></label>
      <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : initial.id ? "Simpan" : "Tambah varian"}</button>
      <CatalogFeedback error={state.error} message={state.message} />
    </form>
  );
}

export function VariantDeleteForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteVariantAction, EMPTY_CATALOG_ACTION_STATE);
  return (
    <div className="catalog-row-action">
      <form action={formAction}><input name="id" type="hidden" value={id} /><button className="catalog-button catalog-button--danger" disabled={pending} type="submit">Hapus</button></form>
      <CatalogFeedback error={state.error} message={state.message} />
    </div>
  );
}
