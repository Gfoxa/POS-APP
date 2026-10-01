"use client";

import { useActionState } from "react";
import { deactivateIngredientAction } from "@/server/actions/inventory";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";

export function DeactivateIngredientForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deactivateIngredientAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="inventory-deactivate-form"><input name="id" type="hidden" value={id} /><button className="catalog-button catalog-button--secondary" disabled={pending} type="submit">{pending ? "Menonaktifkan…" : "Nonaktifkan bahan"}</button><CatalogFeedback error={state.error} message={state.message} /></form>;
}
