"use client";

import { useActionState } from "react";
import { cancelDraftAction } from "@/server/actions/orders";
import { EMPTY_ORDER_ACTION_STATE } from "@/server/orders/action-state";

export function OrderCancelDraftButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [state, action, pending] = useActionState(cancelDraftAction, EMPTY_ORDER_ACTION_STATE);
  return <form action={action} className="order-transition-form">
    <input name="orderId" type="hidden" value={orderId} />
    <button aria-label={`Hapus draft ${orderNumber}`} className="catalog-button catalog-button--small" disabled={pending} title="Hapus draft (batalkan pesanan)" type="submit">
      {pending ? "Menghapus…" : "Hapus draft"}
    </button>
    {state.message && <span role={state.error ? "alert" : "status"}>{state.message}</span>}
  </form>;
}
