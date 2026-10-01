"use client";

import { formatDateTimeId, formatIdr } from "@/lib/utils/format";

type ReceiptData = {
  cafeName: string;
  cafeAddress: string | null;
  cafePhone: string | null;
  orderNumber: string;
  status: string;
  type: "DINE_IN" | "TAKEAWAY";
  createdAt: string;
  cashierName: string;
  customer: { name: string; phone: string | null } | null;
  subtotal: string;
  discountName: string | null;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  serviceChargeRate: string;
  serviceChargeAmount: string;
  total: string;
  note: string | null;
  items: { id: string; productName: string; variantName: string | null; quantity: number; unitPrice: string; note: string | null; lineTotal: string; addons: { name: string; unitPrice: string; quantity: number; total: string }[] }[];
  payment: { method: string; amount: string; tenderedAmount: string; changeAmount: string; referenceNumber: string | null; paidAt: string };
  refund: { amount: string; paidAt: string } | null;
};

const METHOD_LABELS: Record<string, string> = { CASH: "Tunai", QRIS: "QRIS", DEBIT: "Debit", CREDIT_CARD: "Kartu kredit", OTHER: "Lainnya" };

function ratePercent(rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  const scaledRate = BigInt(whole) * 100000n + BigInt(fraction.padEnd(5, "0").slice(0, 5));
  const hundredthsOfPercent = scaledRate / 10n;
  const percentageWhole = hundredthsOfPercent / 100n;
  const percentageFraction = hundredthsOfPercent % 100n;
  return percentageFraction === 0n ? percentageWhole.toString() : `${percentageWhole}.${percentageFraction.toString().padStart(2, "0")}`;
}

export function Receipt({ order }: { order: ReceiptData }) {
  return (
    <div className="receipt-page">
      <div className="receipt-toolbar"><a className="catalog-button catalog-button--secondary" href="/orders">← Kembali ke pesanan</a><button className="catalog-button catalog-button--primary" onClick={() => window.print()} type="button">Cetak struk</button></div>
      <article className="receipt-card">
        <header className="receipt-header"><span className="receipt-brand-mark">{order.cafeName.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">{order.cafeName}</span><h1>Terima kasih</h1><p>Struk transaksi</p>{order.cafeAddress && <small>{order.cafeAddress}</small>}{order.cafePhone && <small>{order.cafePhone}</small>}</div></header>
        {order.status === "REFUNDED" && order.refund && <div className="receipt-refund-notice"><strong>TRANSAKSI DIKEMBALIKAN</strong><span>{formatIdr(order.refund.amount)} · {formatDateTimeId(new Date(order.refund.paidAt))}</span></div>}
        <div className="receipt-order-meta"><div><span>Nomor pesanan</span><strong>{order.orderNumber}</strong></div><div><span>Waktu</span><strong>{formatDateTimeId(new Date(order.createdAt))}</strong></div><div><span>Kasir</span><strong>{order.cashierName}</strong></div><div><span>Tipe pesanan</span><strong>{order.type === "DINE_IN" ? "Makan di tempat" : "Bawa pulang"}</strong></div>{order.customer && <div><span>Pelanggan</span><strong>{order.customer.name}{order.customer.phone ? ` · ${order.customer.phone}` : ""}</strong></div>}</div>
        <div className="receipt-items"><div className="receipt-section-label"><span>Rincian pesanan</span><span>Jumlah</span></div>
          {order.items.map((item) => <div className="receipt-item" key={item.id}>
            <div className="receipt-item-main"><strong>{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</strong><span>{item.quantity} × {formatIdr(item.unitPrice)}</span><b>{formatIdr(item.lineTotal)}</b></div>
            {item.addons.map((addon) => <div className="receipt-addon" key={`${item.id}-${addon.name}`}><span>+ {addon.name} ({item.quantity * addon.quantity} × {formatIdr(addon.unitPrice)})</span><strong>{formatIdr(addon.total)}</strong></div>)}
            {item.note && <small className="receipt-note">Catatan: {item.note}</small>}
          </div>)}
        </div>
        {order.note && <p className="receipt-order-note">Catatan pesanan: {order.note}</p>}
        <div className="receipt-totals"><div><span>Subtotal</span><strong>{formatIdr(order.subtotal)}</strong></div>{order.discountAmount !== "0.00" && <div><span>Diskon{order.discountName ? ` · ${order.discountName}` : ""}</span><strong>− {formatIdr(order.discountAmount)}</strong></div>}<div><span>Pajak ({ratePercent(order.taxRate)}%)</span><strong>{formatIdr(order.taxAmount)}</strong></div><div><span>Biaya layanan ({ratePercent(order.serviceChargeRate)}%)</span><strong>{formatIdr(order.serviceChargeAmount)}</strong></div><div className="receipt-grand-total"><span>Total dibayar</span><strong>{formatIdr(order.total)}</strong></div></div>
        <div className="receipt-payment"><div><span>Metode</span><strong>{METHOD_LABELS[order.payment.method] ?? order.payment.method}</strong></div><div><span>Dibayar</span><strong>{formatIdr(order.payment.amount)}</strong></div>{order.payment.method === "CASH" && <><div><span>Uang diterima</span><strong>{formatIdr(order.payment.tenderedAmount)}</strong></div><div><span>Kembalian</span><strong>{formatIdr(order.payment.changeAmount)}</strong></div></>}{order.payment.referenceNumber && <div><span>Referensi</span><strong>{order.payment.referenceNumber}</strong></div>}</div>
        <footer className="receipt-footer"><strong>Sampai jumpa kembali</strong><span>Semoga harimu menyenangkan.</span></footer>
      </article>
    </div>
  );
}
