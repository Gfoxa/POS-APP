import Link from "next/link";
import { AddonForm } from "@/components/catalog/addon-form";
import { CatalogDeleteForm } from "@/components/catalog/catalog-delete-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatIdr } from "@/lib/utils/format";
import { deleteAddonAction } from "@/server/actions/catalog";
import { listAddons, listProductsForAddon } from "@/server/services/catalog";
import { addonFormDefaults } from "@/server/catalog/form-defaults";

export default async function AddonsPage() {
  await requireRouteAccess("addons");
  const [addons, products] = await Promise.all([listAddons(), listProductsForAddon()]);
  return (
    <div className="catalog-page">
      <header className="catalog-heading"><div><span className="eyebrow">KATALOG / OPSI TAMBAHAN</span><h1>Add-on</h1><p>Atur tambahan menu, harga, dan produk yang menawarkannya.</p></div><Link className="catalog-button catalog-button--secondary" href="/products">Lihat produk</Link></header>
      <section className="catalog-metrics" aria-label="Ringkasan add-on">
        <article><span>Total add-on</span><strong>{addons.length}</strong></article>
        <article><span>Add-on aktif</span><strong>{addons.filter((addon) => addon.isActive).length}</strong></article>
        <article><span>Produk tersedia</span><strong>{products.filter((product) => product.isActive).length}</strong></article>
      </section>
      <div className="catalog-columns">
        <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">OPSI TAMBAHAN BARU</span><h2>Tambah add-on</h2></div></div><AddonForm products={products} /></section>
        <section className="catalog-panel">
          <div className="catalog-panel-heading"><div><span className="eyebrow">DAFTAR ADD-ON</span><h2>Semua add-on</h2></div><span className="catalog-count">{addons.length} opsi</span></div>
          {addons.length ? <div className="catalog-list">
            {addons.map((addon) => (
              <article className="catalog-list-card" key={addon.id}>
                <div className="catalog-list-card-heading"><div><strong>{addon.name}</strong><span>{formatIdr(addon.price)} · {addon.products.length} produk · {addon._count.orderItems} penggunaan</span></div><span className={`catalog-status ${addon.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{addon.isActive ? "Aktif" : "Nonaktif"}</span></div>
                {addon.products.length > 0 && <div className="catalog-chip-list">{addon.products.map((product) => <Link className="catalog-chip" href={`/products/${product.id}`} key={product.id}>{product.name} ↗</Link>)}</div>}
                <details className="catalog-edit-details"><summary>Edit add-on dan produk</summary><AddonForm initial={addonFormDefaults({ id: addon.id, name: addon.name, price: addon.price, isActive: addon.isActive, productIds: addon.products.map((product) => product.id) })} products={products} /></details>
                {addon._count.orderItems ? <p className="catalog-muted">Tercatat di {addon._count.orderItems} item pesanan; nonaktifkan agar histori tetap terjaga.</p> : <CatalogDeleteForm action={deleteAddonAction} id={addon.id} label="Hapus add-on" />}
              </article>
            ))}
          </div> : <div className="catalog-empty"><strong>Belum ada add-on</strong><p>Tambahkan opsi seperti extra shot, oat milk, atau sirup vanila.</p></div>}
        </section>
      </div>
    </div>
  );
}
