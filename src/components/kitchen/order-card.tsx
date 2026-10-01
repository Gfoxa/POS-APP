"use client";

import { OrderTransitionButton } from "@/components/orders/order-transition-button";
import { formatDateTimeId } from "@/lib/utils/format";

type KitchenOrder = {
  id: string; orderNumber: string; status: "CONFIRMED" | "PREPARING" | "READY"; type: "DINE_IN" | "TAKEAWAY"; note: string | null; createdAt: Date; tableLabel: string | null;
  items: { id: string; productName: string; variantName: string | null; quantity: number; note: string | null; addons: { addonName: string; quantity: number }[] }[];
};

const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
function age(date: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
  if (minutes < 60) return relative.format(-minutes, "minute");
  return relative.format(-Math.floor(minutes / 60), "hour");
}

export function OrderCard({ order }: { order: KitchenOrder }) {
  const next = order.status === "CONFIRMED" ? "PREPARING" : order.status === "PREPARING" ? "READY" : null;
  const label = order.status === "CONFIRMED" ? "Terima & mulai" : "Tandai siap";
  return <article className={`kitchen-order-card kitchen-order-card--${order.status.toLowerCase()}`}>
    <header><div><span className="eyebrow">{order.tableLabel ?? (order.type === "TAKEAWAY" ? "BAWA PULANG" : "MEJA")}</span><h2>{order.orderNumber}</h2></div><div className="kitchen-order-time"><strong>{age(order.createdAt)}</strong><small>{formatDateTimeId(new Date(order.createdAt))}</small></div></header>
    <ul>{order.items.map((item) => <li key={item.id}><div><strong>{item.quantity}× {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</strong>{item.addons.length > 0 && <span>{item.addons.map((addon) => `${addon.quantity > 1 ? `${addon.quantity}× ` : ""}${addon.addonName}`).join(", ")}</span>}{item.note && <em>Catatan: {item.note}</em>}</div></li>)}</ul>
    {order.note && <p className="kitchen-order-note"><strong>Catatan pesanan</strong>{order.note}</p>}
    <footer>{next ? <OrderTransitionButton orderId={order.id} expectedStatus={order.status} nextStatus={next} label={label} /> : <span className="catalog-status catalog-status--active">Siap disajikan</span>}</footer>
  </article>;
}
