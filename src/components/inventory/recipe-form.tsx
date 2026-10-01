"use client";

import { useActionState } from "react";
import { saveRecipeAction } from "@/server/actions/inventory";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";

type IngredientOption = { id: string; name: string; unit: string; isActive: boolean };
type RecipeItem = { ingredientId: string; quantity: string };

export function RecipeForm({ targetId, targetType, targetName, ingredients, initialItems = [] }: { targetId: string; targetType: "product" | "addon"; targetName: string; ingredients: IngredientOption[]; initialItems?: RecipeItem[] }) {
  const [state, action, pending] = useActionState(saveRecipeAction, EMPTY_CATALOG_ACTION_STATE);
  const selected = new Map(initialItems.map((item) => [item.ingredientId, item.quantity]));
  return <form action={action} className="catalog-form">
    <input name={targetType === "product" ? "productId" : "addonId"} type="hidden" value={targetId} />
    <p className="inventory-form-hint">Satu resep menggambarkan {targetType === "product" ? "satu porsi produk" : "satu unit tambahan"}: <strong>{targetName}</strong>. Jumlah memakai satuan bahan.</p>
    <div className="inventory-recipe-ingredients">{ingredients.map((ingredient) => {
      const existing = selected.has(ingredient.id);
      return <label className="inventory-recipe-line" key={ingredient.id}>
        <input defaultChecked={existing} disabled={!ingredient.isActive && !existing} name="ingredientId" type="checkbox" value={ingredient.id} />
        <span>{ingredient.name}<small>{ingredient.unit}{ingredient.isActive ? "" : " · nonaktif, hapus dari resep"}</small></span>
        <input aria-label={`Jumlah ${ingredient.name}`} defaultValue={selected.get(ingredient.id) ?? ""} inputMode="decimal" min="0.001" name={`quantity_${ingredient.id}`} placeholder="0" step="0.001" />
      </label>;
    })}</div>
    <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : "Simpan resep"}</button>
    <CatalogFeedback error={state.error} message={state.message} />
  </form>;
}
