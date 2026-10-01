"use client";

import { useActionState } from "react";
import { saveCustomerAction, setCustomerActiveAction } from "@/server/actions/customers";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";

type Customer = { id: string; name: string; phone: string | null; email: string | null; notes: string | null; isActive: boolean };

export function CustomerForm({ initial }: { initial?: Customer }) {
  const [state, action, pending] = useActionState(saveCustomerAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="catalog-form">
    {initial && <input name="id" type="hidden" value={initial.id} />}
    <label className="catalog-field"><span>Nama</span><input autoComplete="name" defaultValue={initial?.name ?? ""} maxLength={120} name="name" required /></label>
    <label className="catalog-field"><span>Nomor telepon <small>Opsional</small></span><input autoComplete="tel" defaultValue={initial?.phone ?? ""} maxLength={32} name="phone" /></label>
    <label className="catalog-field"><span>Email <small>Opsional</small></span><input autoComplete="email" defaultValue={initial?.email ?? ""} maxLength={254} name="email" type="email" /></label>
    <label className="catalog-field"><span>Catatan <small>Opsional</small></span><textarea defaultValue={initial?.notes ?? ""} maxLength={1000} name="notes" rows={2} /></label>
    <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : initial ? "Simpan perubahan" : "Tambah pelanggan"}</button>
    <CatalogFeedback error={state.error} message={state.message} />
  </form>;
}

export function CustomerStatusForm({ customer }: { customer: Pick<Customer, "id" | "isActive"> }) {
  const [state, action, pending] = useActionState(setCustomerActiveAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action}><input name="id" type="hidden" value={customer.id} /><input name="active" type="hidden" value={String(!customer.isActive)} /><button className="catalog-button" disabled={pending} type="submit">{pending ? "Menyimpan…" : customer.isActive ? "Nonaktifkan" : "Aktifkan"}</button><CatalogFeedback error={state.error} message={state.message} /></form>;
}
