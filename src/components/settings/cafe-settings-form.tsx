"use client";

import { useActionState } from "react";
import { saveCafeSettingsAction } from "@/server/actions/settings";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";

type Settings = { name: string; address: string | null; phone: string | null; taxRateBasisPoints: number; serviceChargeRateBasisPoints: number };
const percent = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

export function CafeSettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveCafeSettingsAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="catalog-form">
    <label className="catalog-field"><span>Nama kafe</span><input defaultValue={settings.name} maxLength={100} name="name" required /></label>
    <label className="catalog-field"><span>Alamat</span><textarea defaultValue={settings.address ?? ""} maxLength={250} name="address" rows={3} /></label>
    <label className="catalog-field"><span>Telepon</span><input defaultValue={settings.phone ?? ""} maxLength={32} name="phone" /></label>
    <div className="settings-rate-grid"><label className="catalog-field"><span>Pajak (%)</span><input defaultValue={percent(settings.taxRateBasisPoints)} inputMode="decimal" name="taxRate" required /></label><label className="catalog-field"><span>Biaya layanan (%)</span><input defaultValue={percent(settings.serviceChargeRateBasisPoints)} inputMode="decimal" name="serviceChargeRate" required /></label></div>
    <p className="catalog-muted">Tarif yang disimpan berlaku untuk checkout berikutnya. Struk historis tetap memakai tarif saat transaksi.</p>
    <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Menyimpan…" : "Simpan pengaturan"}</button>
    <CatalogFeedback error={state.error} message={state.message} />
  </form>;
}
