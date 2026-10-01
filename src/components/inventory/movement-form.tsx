"use client";

import { useActionState, useEffect, useState } from "react";
import { recordInventoryMovementAction } from "@/server/actions/inventory";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";

type IngredientOption = { id: string; name: string; unit: string };

export function MovementForm({ ingredients }: { ingredients: IngredientOption[] }) {
  const [state, action, pending] = useActionState(recordInventoryMovementAction, EMPTY_CATALOG_ACTION_STATE);
  const [type, setType] = useState("PURCHASE");
  const [key, setKey] = useState("");
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => { if (!pending && state.message && !state.error) setKey(crypto.randomUUID()); }, [pending, state.message, state.error]);
  return <form action={action} className="catalog-form">
    <label className="catalog-field"><span>Bahan</span><select name="ingredientId" required>{ingredients.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.unit}</option>)}</select></label>
    <label className="catalog-field"><span>Jenis pergerakan</span><select name="type" onChange={(event) => setType(event.target.value)} value={type}><option value="PURCHASE">Pembelian</option><option value="ADJUSTMENT">Penyesuaian</option><option value="WASTE">Bahan terbuang</option><option value="STOCK_OPNAME">Stok opname</option><option value="RETURN">Retur masuk</option></select></label>
    {type === "PURCHASE" && <><label className="catalog-field"><span>Jumlah masuk</span><input inputMode="decimal" name="quantity" required /></label><label className="catalog-field"><span>Biaya per satuan (Rp)</span><input inputMode="decimal" name="unitCost" required /></label></>}
    {type === "ADJUSTMENT" && <label className="catalog-field"><span>Perubahan stok (+/-)</span><input inputMode="decimal" name="quantityDelta" required /></label>}
    {type === "STOCK_OPNAME" && <label className="catalog-field"><span>Jumlah terhitung</span><input inputMode="decimal" name="countedStock" required /></label>}
    {(type === "WASTE" || type === "RETURN") && <label className="catalog-field"><span>Jumlah</span><input inputMode="decimal" name="quantity" required /></label>}
    <label className="catalog-field"><span>Catatan <small>Opsional</small></span><input maxLength={500} name="note" /></label>
    <input name="idempotencyKey" type="hidden" value={key} />
    <button className="catalog-button catalog-button--primary" disabled={pending || !key || !ingredients.length} type="submit">{pending ? "Mencatat…" : "Catat pergerakan"}</button>
    <CatalogFeedback error={state.error} message={state.message} />
  </form>;
}
