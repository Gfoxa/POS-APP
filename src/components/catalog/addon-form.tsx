"use client";

import { useActionState } from "react";
import { saveAddonAction } from "@/server/actions/catalog";
import { EMPTY_CATALOG_ACTION_STATE, fieldChecked, fieldValue, fieldValues } from "@/server/catalog/action-state";
import type { AddonFormDefaults } from "@/server/catalog/form-defaults";
import { CatalogFeedback } from "./catalog-feedback";

type ProductOption = { id: string; name: string; isActive: boolean };

export function AddonForm({ products, initial = {} }: { products: ProductOption[]; initial?: Partial<AddonFormDefaults> }) {
  const [state, formAction, pending] = useActionState(saveAddonAction, EMPTY_CATALOG_ACTION_STATE);
  const price = fieldValue(state, "price", initial.price ?? "");
  const selected = new Set(fieldValues(state, "productIds", initial.productIds ?? []));
  return (
    <form action={formAction} className="catalog-form">
      {initial.id && <input name="id" type="hidden" value={initial.id} />}
      <div className="catalog-form--grid">
        <label className="catalog-field"><span>Nama add-on</span><input defaultValue={fieldValue(state, "name", initial.name ?? "")} maxLength={120} name="name" placeholder="Extra shot" required /></label>
        <label className="catalog-field"><span>Harga tambahan <small>Rp</small></span><input defaultValue={price} inputMode="decimal" name="price" placeholder="7000" required /></label>
      </div>
      <label className="catalog-check"><input name="isActive" type="hidden" value="false" /><input defaultChecked={fieldChecked(state, "isActive", initial.isActive ?? true)} name="isActive" type="checkbox" value="true" /><span>Add-on aktif</span></label>
      <fieldset className="catalog-product-options">
        <legend>Tersedia pada produk</legend>
        {products.length ? products.map((product) => (
          <label className="catalog-check" key={product.id}>
            {product.isActive ? <input defaultChecked={selected.has(product.id)} name="productIds" type="checkbox" value={product.id} /> : selected.has(product.id) ? <><input checked disabled name="productIds" type="checkbox" value={product.id} /><input name="productIds" type="hidden" value={product.id} /></> : <input disabled name="productIds" type="checkbox" value={product.id} />}
            <span>{product.name}{product.isActive ? "" : " · Nonaktif"}</span>
          </label>
        )) : <p className="catalog-muted">Tambahkan produk terlebih dahulu.</p>}
      </fieldset>
      <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : initial.id ? "Simpan add-on" : "Tambah add-on"}</button>
      <CatalogFeedback error={state.error} message={state.message} />
    </form>
  );
}
