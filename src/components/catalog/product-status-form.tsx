"use client";

import { useActionState } from "react";
import { setProductActiveAction } from "@/server/actions/catalog";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";
import { CatalogFeedback } from "./catalog-feedback";

export function ProductStatusForm({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(setProductActiveAction, EMPTY_CATALOG_ACTION_STATE);
  return (
    <div>
      <form action={formAction}>
        <input name="id" type="hidden" value={id} />
        <input name="isActive" type="hidden" value={String(!isActive)} />
        <button className="catalog-button catalog-button--secondary" disabled={pending} type="submit">
          {pending ? "Menyimpan…" : isActive ? "Nonaktifkan produk" : "Aktifkan produk"}
        </button>
      </form>
      <CatalogFeedback error={state.error} message={state.message} />
    </div>
  );
}
