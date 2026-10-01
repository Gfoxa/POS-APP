import Link from "next/link";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatIdr } from "@/lib/utils/format";
import { listCategories, listProducts } from "@/server/services/catalog";

type Search = { q?: string | string[]; category?: string | string[]; status?: string | string[] };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRouteAccess("products");
  const [params, categories] = await Promise.all([searchParams, listCategories()]);
  const requestedCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const requestedStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const requestedQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const selectedCategory = categories.some((category) => category.id === requestedCategory) ? requestedCategory : undefined;
  const status = requestedStatus === "active" || requestedStatus === "inactive" ? requestedStatus : "all";
  const query = requestedQuery?.trim().slice(0, 100) ?? "";
  const products = await listProducts({ query, categoryId: selectedCategory, status });

  return (
    <div className="catalog-page">
      <header className="catalog-heading">
        <div><span className="eyebrow">KATALOG / DAFTAR MENU</span><h1>Produk</h1><p>Kelola harga, kategori, dan ketersediaan menu kafe.</p></div>
        <Link className="catalog-button catalog-button--primary" href="/products/new">Tambah produk <span aria-hidden="true">＋</span></Link>
      </header>

      <section className="catalog-metrics" aria-label="Ringkasan produk">
        <article><span>Produk ditemukan</span><strong>{products.length}</strong></article>
        <article><span>Produk aktif</span><strong>{products.filter((product) => product.isActive).length}</strong></article>
        <article><span>Varian terdaftar</span><strong>{products.reduce((total, product) => total + product._count.variants, 0)}</strong></article>
      </section>

      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">MENU KAFE</span><h2>Semua produk</h2></div><Link className="catalog-text-link" href="/addons">Kelola add-on ↗</Link></div>
        <form action="/products" className="catalog-filters" method="get">
          <label className="catalog-field catalog-search"><span>Cari produk</span><input defaultValue={query} maxLength={100} name="q" placeholder="Nama atau SKU" /></label>
          <label className="catalog-field"><span>Kategori</span><select defaultValue={selectedCategory ?? ""} name="category"><option value="">Semua kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : " · Nonaktif"}</option>)}</select></label>
          <label className="catalog-field"><span>Status</span><select defaultValue={status} name="status"><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
          <button className="catalog-button catalog-button--secondary" type="submit">Terapkan</button>
          {(query || selectedCategory || status !== "all") && <Link className="catalog-text-link" href="/products">Hapus filter</Link>}
        </form>
        {products.length ? (
          <div className="catalog-table-wrap">
            <table className="catalog-table">
              <thead><tr><th>Produk</th><th>Kategori</th><th>Harga dasar</th><th>Opsi</th><th>Status</th><th><span className="sr-only">Aksi</span></th></tr></thead>
              <tbody>{products.map((product) => (
                <tr key={product.id}>
                  <td><Link className="catalog-product-link" href={`/products/${product.id}`}>{product.name}</Link><small>SKU {product.sku}</small></td>
                  <td>{product.category.name}</td>
                  <td className="catalog-price">{formatIdr(product.basePrice)}</td>
                  <td>{product._count.variants} varian · {product._count.addons} add-on</td>
                  <td><span className={`catalog-status ${product.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{product.isActive ? "Aktif" : "Nonaktif"}</span></td>
                  <td><Link className="catalog-button catalog-button--small" href={`/products/${product.id}`}>Kelola</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="catalog-empty"><strong>{query ? "Produk tidak ditemukan" : "Belum ada produk"}</strong><p>{query ? "Coba kata kunci atau filter lain." : "Tambahkan produk pertama ke katalog kafe."}</p>{!query && <Link className="catalog-button catalog-button--primary" href="/products/new">Tambah produk</Link>}</div>}
      </section>
    </div>
  );
}
