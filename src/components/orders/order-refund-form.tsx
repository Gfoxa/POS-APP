"use client";

import { useActionState } from "react";
import { refundOrderAction } from "@/server/actions/order-workflow";

export function OrderRefundForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(refundOrderAction, { message: "" });
  return <form action={action} className="order-refund-form">
    <input name="orderId" type="hidden" value={orderId} />
    <input aria-label="Alasan pengembalian dana" maxLength={500} minLength={3} name="reason" placeholder="Alasan pengembalian" required />
    <button className="catalog-button catalog-button--small" disabled={pending} type="submit">{pending ? "Memproses…" : "Kembalikan dana"}</button>
    {state.message && <span role={state.error ? "alert" : "status"}>{state.message}</span>}
  </form>;
}
