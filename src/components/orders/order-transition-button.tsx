"use client";

import { useActionState } from "react";
import { transitionOrderAction } from "@/server/actions/order-workflow";

export function OrderTransitionButton({ orderId, expectedStatus, nextStatus, label }: { orderId: string; expectedStatus: "CONFIRMED" | "PREPARING" | "READY"; nextStatus: "PREPARING" | "READY" | "COMPLETED"; label: string }) {
  const [state, action, pending] = useActionState(transitionOrderAction, { message: "" });
  return <form action={action} className="order-transition-form">
    <input name="orderId" type="hidden" value={orderId} />
    <input name="expectedStatus" type="hidden" value={expectedStatus} />
    <input name="nextStatus" type="hidden" value={nextStatus} />
    <button className="catalog-button catalog-button--small" disabled={pending} type="submit">{pending ? "Memperbarui…" : label}</button>
    {state.message && <span role={state.error ? "alert" : "status"}>{state.message}</span>}
  </form>;
}
