import { requireRouteAccess } from "@/lib/auth/guards";
import { Prisma } from "@/generated/prisma/client";
import { formatDateTimeId, formatIdr } from "@/lib/utils/format";
import { getDashboardOverview } from "@/server/services/dashboard";

const ORDER_STATUS: Record<string, string> = {
  CONFIRMED: "Dikonfirmasi",
  PREPARING: "Disiapkan",
  READY: "Siap",
  COMPLETED: "Selesai",
};

export default async function DashboardPage() {
  await requireRouteAccess("dashboard");
  const summary = await getDashboardOverview();
  const paymentTotal = summary.paymentBreakdown.reduce(
    (total, payment) => total.plus(payment.amount),
    new Prisma.Decimal(0),
  );

  return (
    <div className="dashboard-page">
      <section className="dashboard-heading">
        <div>
          <span className="eyebrow">RINGKASAN / HARI INI</span>
          <h1>Selamat pagi.</h1>
          <p>Semua yang penting untuk memulai hari di Kopi Sore.</p>
        </div>
        <div className="date-chip">
          <span className="date-chip-icon" aria-hidden="true">◷</span>
          {formatDateTimeId(new Date())}
        </div>
      </section>

      <section aria-label="Ringkasan hari ini" className="metric-grid">
        <article className="metric-card metric-card--feature">
          <div className="metric-label-row">
            <span className="metric-label">Pendapatan hari ini</span>
            <span className="metric-icon metric-icon--cream" aria-hidden="true">↗</span>
          </div>
          <strong className="metric-value">{formatIdr(summary.revenue)}</strong>
          <span className="metric-footnote">Dari pesanan yang sudah selesai</span>
        </article>
        <article className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Pesanan hari ini</span>
            <span className="metric-icon" aria-hidden="true">▤</span>
          </div>
          <strong className="metric-value">{summary.orderCount}</strong>
          <span className="metric-footnote">Pesanan aktif dan selesai</span>
        </article>
        <article className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Rata-rata pesanan</span>
            <span className="metric-icon" aria-hidden="true">⌁</span>
          </div>
          <strong className="metric-value">{formatIdr(summary.averageOrderValue)}</strong>
          <span className="metric-footnote">Nilai rata-rata per pesanan selesai</span>
        </article>
        <article className="metric-card">
          <div className="metric-label-row">
            <span className="metric-label">Produk aktif</span>
            <span className="metric-icon" aria-hidden="true">◇</span>
          </div>
          <strong className="metric-value">{summary.activeProductCount}</strong>
          <span className="metric-footnote">Siap ditawarkan ke pelanggan</span>
        </article>
      </section>

      <section className="dashboard-panels">
        <article className="panel panel--recent">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AKTIVITAS</span>
              <h2>Pesanan terbaru</h2>
            </div>
            <span className="panel-count">{summary.recentOrders.length} pesanan</span>
          </div>
          {summary.recentOrders.length ? (
            <div className="recent-orders">
              {summary.recentOrders.map((order) => (
                <div className="recent-order" key={order.id}>
                  <span className="order-mark">{order.orderNumber.slice(-2)}</span>
                  <span className="recent-order-main">
                    <strong>{order.orderNumber}</strong>
                    <small>{order.cashier.name} · {formatDateTimeId(order.createdAt)}</small>
                  </span>
                  <span className={`order-status order-status--${order.status.toLowerCase()}`}>
                    {ORDER_STATUS[order.status] ?? order.status}
                  </span>
                  <strong className="recent-order-total">{formatIdr(order.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <span className="empty-cup" aria-hidden="true">☕</span>
              <strong>Belum ada pesanan hari ini</strong>
              <p>Pesanan selesai akan muncul di sini.</p>
            </div>
          )}
        </article>

        <article className="panel panel--top-products">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">FAVORIT HARI INI</span>
              <h2>Produk terlaris</h2>
            </div>
            <span className="panel-accent" aria-hidden="true">✳</span>
          </div>
          {summary.topProducts.length ? (
            <ol className="top-products">
              {summary.topProducts.map((product, index) => (
                <li className="top-product" key={`${product.productId}:${product.name}`}>
                  <span className={`rank rank--${index + 1}`}>0{index + 1}</span>
                  <span className="top-product-name">{product.name}</span>
                  <strong>{product.unitsSold}<small> terjual</small></strong>
                </li>
              ))}
            </ol>
          ) : (
            <div className="panel-empty panel-empty--small">
              <strong>Belum ada produk terjual</strong>
              <p>Produk yang paling disukai akan muncul di sini.</p>
            </div>
          )}
        </article>

        <article className="panel panel--payments">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PEMBAYARAN</span>
              <h2>Metode pembayaran</h2>
            </div>
            <span className="panel-count">Hari ini</span>
          </div>
          {summary.paymentBreakdown.length && paymentTotal.greaterThan(0) ? (
            <div className="payment-list">
              {summary.paymentBreakdown.map((payment, index) => {
                const percentage = payment.amount
                  .div(paymentTotal)
                  .mul(100)
                  .toDecimalPlaces(0)
                  .toFixed(0);
                return (
                  <div className="payment-row" key={payment.label}>
                    <div className="payment-row-label">
                      <span className={`payment-marker payment-marker--${index + 1}`} />
                      <span>{payment.label}</span>
                      <strong>{formatIdr(payment.amount)}</strong>
                    </div>
                    <div aria-label={`${percentage}%`} className="payment-track">
                      <span className={`payment-fill payment-fill--${index + 1}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="panel-empty panel-empty--small">
              <strong>Belum ada pembayaran</strong>
              <p>Ringkasan metode pembayaran akan tampil setelah transaksi pertama.</p>
            </div>
          )}
        </article>

        <article className="panel panel--stock">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PERLU DIPERHATIKAN</span>
              <h2>Stok menipis</h2>
            </div>
            <span className={`stock-count ${summary.lowStockIngredients.length ? "stock-count--alert" : ""}`}>
              {summary.lowStockIngredients.length}
            </span>
          </div>
          {summary.lowStockIngredients.length ? (
            <ul className="stock-list">
              {summary.lowStockIngredients.slice(0, 4).map((ingredient) => (
                <li className="stock-row" key={ingredient.id}>
                  <span className="stock-warning" aria-hidden="true">!</span>
                  <span>{ingredient.name}</span>
                  <strong>{ingredient.currentStock.toString()} <small>{ingredient.unit.toLowerCase()}</small></strong>
                </li>
              ))}
            </ul>
          ) : (
            <div className="panel-empty panel-empty--small">
              <strong>Semua stok aman</strong>
              <p>Bahan di bawah batas minimum akan tercatat di sini.</p>
            </div>
          )}
        </article>
      </section>

      <footer className="dashboard-footer">
        <span className="footer-mark">K</span>
        <span>Kopi Sore POS</span>
        <span className="footer-separator">·</span>
        <span>Data hari ini · WIB</span>
      </footer>
    </div>
  );
}
