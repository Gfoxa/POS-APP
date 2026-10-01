"use client";

import { useActionState } from "react";
import { saveCategoryAction } from "@/server/actions/catalog";
import { EMPTY_CATALOG_ACTION_STATE, fieldChecked, fieldValue } from "@/server/catalog/action-state";
import { CatalogFeedback } from "./catalog-feedback";

type CategoryDefaults = { id?: string; name?: string; description?: string | null; isActive?: boolean };

export function CategoryForm({ initial = {}, compact = false }: { initial?: CategoryDefaults; compact?: boolean }) {
  const [state, formAction, pending] = useActionState(saveCategoryAction, EMPTY_CATALOG_ACTION_STATE);
  return (
    <form action={formAction} className="catalog-form">
      {initial.id && <input name="id" type="hidden" value={initial.id} />}
      <label className="catalog-field">
        <span>Nama kategori</span>
        <input autoComplete="off" defaultValue={fieldValue(state, "name", initial.name ?? "")} maxLength={120} name="name" placeholder="Contoh: Kopi" required />
      </label>
      <label className="catalog-field">
        <span>Deskripsi <small>Opsional</small></span>
        <textarea defaultValue={fieldValue(state, "description", initial.description ?? "")} maxLength={500} name="description" rows={compact ? 2 : 3} />
      </label>
      <label className="catalog-check">
        <input name="isActive" type="hidden" value="false" />
        <input defaultChecked={fieldChecked(state, "isActive", initial.isActive ?? true)} name="isActive" type="checkbox" value="true" />
        <span>Aktif dan dapat dipilih untuk produk</span>
      </label>
      <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">
        {pending ? "Menyimpan…" : initial.id ? "Simpan perubahan" : "Tambah kategori"}
      </button>
      <CatalogFeedback error={state.error} message={state.message} />
    </form>
  );
}
