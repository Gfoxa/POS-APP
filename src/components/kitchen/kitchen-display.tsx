"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OrderCard } from "@/components/kitchen/order-card";
import type { listKitchenOrders } from "@/server/services/order-workflow";

type KitchenOrders = Awaited<ReturnType<typeof listKitchenOrders>>;

export function KitchenDisplay({ orders }: { orders: KitchenOrders }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <div className="catalog-page kitchen-page">
    <header className="catalog-heading"><div><span className="eyebrow">OPERASIONAL / DAPUR</span><h1>Layar dapur</h1><p>Pesanan diperbarui otomatis setiap lima detik.</p></div><span className="catalog-count" aria-live="polite">{orders.length} tiket aktif</span></header>
    {orders.length ? <section className="kitchen-order-grid" aria-label="Antrean pesanan dapur">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</section> : <section className="catalog-panel catalog-empty"><strong>Belum ada pesanan dapur</strong><p>Pesanan yang sudah dibayar akan muncul di sini.</p></section>}
  </div>;
}
