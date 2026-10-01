import Link from "next/link";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatDateTimeId, formatIdr } from "@/lib/utils/format";
import { listOrders } from "@/server/services/orders";
import { OrderTransitionButton } from "@/components/orders/order-transition-button";
import { OrderRefundForm } from "@/components/orders/order-refund-form";
import { OrderCancelDraftButton } from "@/components/orders/order-cancel-draft-button";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { getPrismaClient } from "@/lib/db/prisma";

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Ditahan", CONFIRMED: "Dikonfirmasi", PREPARING: "Disiapkan", READY: "Siap", COMPLETED: "Selesai", CANCELLED: "Dibatalkan", REFUNDED: "Dikembalikan",
};

const METHOD_LABELS: Record<string, string> = { CASH: "Tunai", QRIS: "QRIS", DEBIT: "Debit", CREDIT_CARD: "Kartu kredit", OTHER: "Lainnya" };

export default async function OrdersPage() {
  const user = await requireRouteAccess("orders");
  const previewOwner = isLocalPreviewMode() ? await getPrismaClient().user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true, isActive: true } }) : null;
  const draftActorId = previewOwner?.isActive ? previewOwner.id : user.id;
  const orders = await listOrders(user.id, user.role);
  return (
    <div className="catalog-page">
      <header className="catalog-heading"><div><span className="eyebrow">KASIR / RIWAYAT</span><h1>Pesanan</h1><p>Riwayat transaksi dan pesanan tersimpan.</p></div><Link className="catalog-button catalog-button--primary" href="/pos">Buat pesanan baru ↗</Link></header>
      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">TRANSAKSI</span><h2>Pesanan terbaru</h2></div><span className="catalog-count">{orders.length} pesanan</span></div>
        {orders.length ? <div className="catalog-table-wrap"><table className="catalog-table orders-table">
          <thead><tr><th>Nomor</th><th>Waktu</th><th>Kasir</th><th>Pelanggan</th><th>Item</th><th>Pembayaran</th><th>Total</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>{orders.map((order) => {
            const method = order.payments[0]?.method;
            return <tr key={order.id}>
              <td className="orders-number">{order.orderNumber}<small>{order.type === "DINE_IN" ? `Makan di tempat · ${order.table?.mergedInto?.name ?? order.table?.name ?? "Meja belum ditentukan"}` : "Bawa pulang"}</small></td>
              <td>{formatDateTimeId(order.createdAt)}</td><td>{order.cashier.name}</td><td>{order.customer?.name ?? "—"}</td><td>{order._count.items}</td><td>{method ? METHOD_LABELS[method] ?? method : "—"}</td><td className="catalog-price">{formatIdr(order.total)}</td>
              <td><span className={`catalog-status ${order.status === "COMPLETED" || order.status === "CONFIRMED" ? "catalog-status--active" : "catalog-status--inactive"}`}>{STATUS_LABELS[order.status] ?? order.status}</span></td>
              <td>{order.payments.length > 0 && <Link className="catalog-button catalog-button--small" href={`/orders/${order.id}/receipt`}>Struk</Link>}{order.status === "DRAFT" && order.cashierId === draftActorId && <OrderCancelDraftButton orderId={order.id} orderNumber={order.orderNumber} />}{order.status === "READY" && ["OWNER", "CASHIER"].includes(user.role) && <OrderTransitionButton orderId={order.id} expectedStatus="READY" nextStatus="COMPLETED" label="Selesaikan" />}{["CONFIRMED", "PREPARING", "READY", "COMPLETED"].includes(order.status) && ["OWNER", "MANAGER"].includes(user.role) && <OrderRefundForm orderId={order.id} />}{order.payments.length === 0 && order.status !== "READY" && order.status !== "DRAFT" && <span className="catalog-muted">Belum dibayar</span>}</td>
            </tr>;
          })}</tbody>
        </table></div> : <div className="catalog-empty"><strong>Belum ada pesanan</strong><p>Transaksi dari layar kasir akan muncul di sini.</p><Link className="catalog-button catalog-button--primary" href="/pos">Buka kasir</Link></div>}
      </section>
    </div>
  );
}
