"use client";

import { useActionState } from "react";
import { saveProductAction } from "@/server/actions/catalog";
import { EMPTY_CATALOG_ACTION_STATE, fieldChecked, fieldValue } from "@/server/catalog/action-state";
import { formatIdr } from "@/lib/utils/format";
import type { ProductFormDefaults } from "@/server/catalog/form-defaults";
import { CatalogFeedback } from "./catalog-feedback";

export function ProductForm({ categories, initial = {} }: { categories: { id: string; name: string; isActive?: boolean }[]; initial?: Partial<ProductFormDefaults> }) {
  const [state, formAction, pending] = useActionState(saveProductAction, EMPTY_CATALOG_ACTION_STATE);
  const price = fieldValue(state, "basePrice", initial.basePrice ?? "");
  return (
    <form action={formAction} className="catalog-form catalog-form--grid">
      {initial.id && <input name="id" type="hidden" value={initial.id} />}
      <label className="catalog-field">
        <span>Nama produk</span>
        <input defaultValue={fieldValue(state, "name", initial.name ?? "")} maxLength={120} name="name" placeholder="Contoh: Iced Latte" required />
      </label>
      <label className="catalog-field">
        <span>SKU</span>
        <input autoCapitalize="characters" defaultValue={fieldValue(state, "sku", initial.sku ?? "")} maxLength={50} name="sku" placeholder="LATTE-01" required />
      </label>
      <label className="catalog-field">
        <span>Kategori</span>
        <select defaultValue={fieldValue(state, "categoryId", initial.categoryId ?? "")} name="categoryId" required>
          <option disabled value="">Pilih kategori</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive === false ? " · Nonaktif" : ""}</option>)}
        </select>
      </label>
      <label className="catalog-field">
        <span>Harga dasar <small>Rp</small></span>
        <input defaultValue={price} inputMode="decimal" name="basePrice" placeholder="25000" required />
        <small className="catalog-field-hint">Contoh tampilan: {formatIdr(price || "0")}</small>
      </label>
      <label className="catalog-field catalog-field--wide">
        <span>Deskripsi <small>Opsional</small></span>
        <textarea defaultValue={fieldValue(state, "description", initial.description ?? "")} maxLength={2000} name="description" rows={3} />
      </label>
      <label className="catalog-field catalog-field--wide">
        <span>URL gambar <small>Opsional</small></span>
        <input defaultValue={fieldValue(state, "imageUrl", initial.imageUrl ?? "")} inputMode="url" name="imageUrl" placeholder="https://…" type="url" />
      </label>
      <div className="catalog-checks catalog-field--wide">
        <label className="catalog-check">
          <input name="isActive" type="hidden" value="false" />
          <input defaultChecked={fieldChecked(state, "isActive", initial.isActive ?? true)} name="isActive" type="checkbox" value="true" />
          <span>Produk aktif</span>
        </label>
        <label className="catalog-check">
          <input name="trackInventory" type="hidden" value="false" />
          <input defaultChecked={fieldChecked(state, "trackInventory", initial.trackInventory ?? true)} name="trackInventory" type="checkbox" value="true" />
          <span>Lacak stok produk</span>
        </label>
      </div>
      <div className="catalog-field--wide catalog-form-footer">
        <button className="catalog-button catalog-button--primary" disabled={pending || !categories.length} type="submit">
          {pending ? "Menyimpan…" : initial.id ? "Simpan perubahan" : "Tambah produk"}
        </button>
        <CatalogFeedback error={state.error} message={state.message} />
      </div>
    </form>
  );
}
