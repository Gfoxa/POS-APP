"use client";

import { useActionState, useState } from "react";
import { createExpenseAction } from "@/server/actions/expenses";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";

type SessionOption = { id: string; openedAt: Date; cashier: { name: string } };

export function ExpenseForm({ sessions, today }: { sessions: SessionOption[]; today: string }) {
  const [state, action, pending] = useActionState(createExpenseAction, EMPTY_CATALOG_ACTION_STATE);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  return <form action={action} className="catalog-form">
    <label className="catalog-field"><span>Kategori</span><input maxLength={80} name="category" placeholder="Contoh: Bahan baku" required /></label>
    <label className="catalog-field"><span>Deskripsi</span><input maxLength={240} name="description" required /></label>
    <label className="catalog-field"><span>Jumlah (Rp)</span><input inputMode="decimal" name="amount" required /></label>
    <label className="catalog-field"><span>Metode pembayaran</span><select onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod} name="paymentMethod"><option value="CASH">Tunai</option><option value="QRIS">QRIS</option><option value="DEBIT">Debit</option><option value="CREDIT_CARD">Kartu kredit</option><option value="OTHER">Lainnya</option></select></label>
    {paymentMethod === "CASH" && <label className="catalog-field"><span>Sesi kasir <small>Wajib untuk tunai</small></span><select name="cashSessionId" defaultValue=""><option value="">Pilih sesi</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.cashier.name} · {session.openedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</option>)}</select></label>}
    <label className="catalog-field"><span>Tanggal</span><input defaultValue={today} name="incurredAt" type="date" required /></label>
    <button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Mencatat…" : "Catat pengeluaran"}</button>
    <CatalogFeedback error={state.error} message={state.message} />
  </form>;
}
