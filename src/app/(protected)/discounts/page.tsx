import { DiscountForm } from "@/components/pos/discount-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatIdr } from "@/lib/utils/format";
import { listDiscounts, listProductsForDiscount } from "@/server/services/discounts";

function dateInput(date: Date | null) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function DiscountsPage() {
  await requireRouteAccess("discounts");
  const [discounts, products] = await Promise.all([listDiscounts(), listProductsForDiscount()]);
  return (
    <div className="catalog-page">
      <header className="catalog-heading"><div><span className="eyebrow">PROMOSI / ATURAN HARGA</span><h1>Diskon</h1><p>Atur diskon produk atau potongan seluruh pesanan untuk kasir.</p></div></header>
      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">ATURAN BARU</span><h2>Buat diskon</h2></div></div>
        <DiscountForm products={products} />
      </section>
      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">PROMOSI TERSIMPAN</span><h2>Semua diskon</h2></div><span className="catalog-count">{discounts.length} aturan</span></div>
        {discounts.length ? <div className="catalog-list">{discounts.map((discount) => (
          <article className="catalog-list-card" key={discount.id}>
            <div className="catalog-list-card-heading"><div><strong>{discount.name}</strong><span>{discount.scope === "PRODUCT" ? `Produk · ${discount.product?.name ?? "Produk dihapus"}` : "Seluruh pesanan"} · {discount.type === "PERCENTAGE" ? `${discount.value.toFixed(2)}%` : formatIdr(discount.value)}{discount.maxAmount ? ` · maks ${formatIdr(discount.maxAmount)}` : ""}</span></div><span className={`catalog-status ${discount.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{discount.isActive ? "Aktif" : "Nonaktif"}</span></div>
            <details className="catalog-edit-details"><summary>Edit diskon</summary><DiscountForm initial={{ id: discount.id, name: discount.name, type: discount.type, scope: discount.scope, value: discount.value.toFixed(2), maxAmount: discount.maxAmount?.toFixed(2) ?? "", productId: discount.productId, isActive: discount.isActive, startsAt: dateInput(discount.startsAt), endsAt: dateInput(discount.endsAt) }} products={products} /></details>
            {discount._count.orders > 0 && <p className="catalog-muted">Dipakai pada {discount._count.orders} pesanan historis. Perubahan hanya berlaku untuk penggunaan berikutnya.</p>}
          </article>
        ))}</div> : <div className="catalog-empty"><strong>Belum ada diskon</strong><p>Buat aturan diskon agar dapat dipilih di layar kasir.</p></div>}
      </section>
    </div>
  );
}
