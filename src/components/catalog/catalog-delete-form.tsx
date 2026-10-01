"use client";

import { useActionState } from "react";
import { CatalogFeedback } from "./catalog-feedback";
import { EMPTY_CATALOG_ACTION_STATE, type CatalogActionState } from "@/server/catalog/action-state";

type CatalogDeleteAction = (state: CatalogActionState, formData: FormData) => Promise<CatalogActionState>;

export function CatalogDeleteForm({ id, label, action }: { id: string; label: string; action: CatalogDeleteAction }) {
  const [state, formAction, pending] = useActionState(action, EMPTY_CATALOG_ACTION_STATE);
  return (
    <div>
      <form action={formAction} onSubmit={(event) => {
        if (!window.confirm(`${label}? Aksi ini tidak dapat dibatalkan.`)) event.preventDefault();
      }}>
        <input name="id" type="hidden" value={id} />
        <button className="catalog-button catalog-button--danger" disabled={pending} type="submit">
          {pending ? "Menghapus…" : label}
        </button>
      </form>
      <CatalogFeedback error={state.error} message={state.message} />
    </div>
  );
}
