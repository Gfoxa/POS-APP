"use client";

import { useActionState } from "react";
import { closeCashSessionAction, openCashSessionAction } from "@/server/actions/cash-session";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";

export function OpenCashSessionForm() {
  const [state, action, pending] = useActionState(openCashSessionAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="catalog-form"><label className="catalog-field"><span>Uang awal di laci kas (Rp)</span><input inputMode="decimal" name="openingCash" required /></label><button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Membuka…" : "Buka sesi kasir"}</button><CatalogFeedback error={state.error} message={state.message} /></form>;
}

export function CloseCashSessionForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(closeCashSessionAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="catalog-form"><input name="sessionId" type="hidden" value={sessionId} /><label className="catalog-field"><span>Uang aktual di laci (Rp)</span><input inputMode="decimal" name="actualClosingCash" required /></label><button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menutup…" : "Tutup sesi dan hitung selisih"}</button><CatalogFeedback error={state.error} message={state.message} /></form>;
}
