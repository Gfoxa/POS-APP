"use client";

import { useActionState } from "react";
import { EMPTY_CATALOG_ACTION_STATE, fieldChecked, fieldValue } from "@/server/catalog/action-state";
import { saveDiscountAction } from "@/server/actions/discounts";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";

type ProductOption = { id: string; name: string; isActive: boolean };
type DiscountDefaults = {
  id?: string;
  name?: string;
  type?: "PERCENTAGE" | "FIXED_AMOUNT";
  scope?: "PRODUCT" | "ORDER";
  value?: string;
  maxAmount?: string | null;
  productId?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export function DiscountForm({ products, initial = {} }: { products: ProductOption[]; initial?: DiscountDefaults }) {
  const [state, action, pending] = useActionState(saveDiscountAction, EMPTY_CATALOG_ACTION_STATE);
  const selectedProduct = initial.productId ?? "";
  return (
    <form action={action} className="catalog-form">
      {initial.id && <input name="id" type="hidden" value={initial.id} />}
      <label className="catalog-field"><span>Nama diskon</span><input defaultValue={fieldValue(state, "name", initial.name ?? "")} maxLength={120} name="name" placeholder="Promo sore" required /></label>
      <div className="catalog-form--grid">
        <label className="catalog-field"><span>Jenis diskon</span><select defaultValue={fieldValue(state, "type", initial.type ?? "PERCENTAGE")} name="type"><option value="PERCENTAGE">Persentase</option><option value="FIXED_AMOUNT">Nominal tetap</option></select></label>
        <label className="catalog-field"><span>Nilai {fieldValue(state, "type", initial.type ?? "PERCENTAGE") === "PERCENTAGE" ? "(%)" : "(Rp)"}</span><input defaultValue={fieldValue(state, "value", initial.value ?? "")} inputMode="decimal" name="value" placeholder="10" required /></label>
      </div>
      <div className="catalog-form--grid">
        <label className="catalog-field"><span>Cakupan</span><select defaultValue={fieldValue(state, "scope", initial.scope ?? "ORDER")} name="scope"><option value="ORDER">Seluruh pesanan</option><option value="PRODUCT">Produk tertentu</option></select></label>
        <label className="catalog-field"><span>Produk <small>untuk diskon produk</small></span><select defaultValue={fieldValue(state, "productId", selectedProduct)} name="productId"><option value="">Pilih produk</option>{products.map((product) => <option disabled={!product.isActive && product.id !== selectedProduct} key={product.id} value={product.id}>{product.name}{product.isActive ? "" : " · Nonaktif"}</option>)}</select></label>
      </div>
      <div className="catalog-form--grid">
        <label className="catalog-field"><span>Batas maksimum <small>Opsional · Rp</small></span><input defaultValue={fieldValue(state, "maxAmount", initial.maxAmount ?? "")} inputMode="decimal" name="maxAmount" placeholder="Kosongkan tanpa batas" /></label>
        <label className="catalog-check catalog-field--center"><input name="isActive" type="hidden" value="false" /><input defaultChecked={fieldChecked(state, "isActive", initial.isActive ?? true)} name="isActive" type="checkbox" value="true" /><span>Diskon aktif</span></label>
      </div>
      <div className="catalog-form--grid">
        <label className="catalog-field"><span>Mulai <small>Opsional</small></span><input defaultValue={fieldValue(state, "startsAt", initial.startsAt ?? "")} name="startsAt" type="date" /></label>
        <label className="catalog-field"><span>Berakhir <small>Opsional</small></span><input defaultValue={fieldValue(state, "endsAt", initial.endsAt ?? "")} name="endsAt" type="date" /></label>
      </div>
      <div className="catalog-form-footer"><button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : initial.id ? "Simpan diskon" : "Buat diskon"}</button><CatalogFeedback error={state.error} message={state.message} /></div>
    </form>
  );
}
