import Link from "next/link";
import { CatalogDeleteForm } from "@/components/catalog/catalog-delete-form";
import { CategoryForm } from "@/components/catalog/category-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { listCategories } from "@/server/services/catalog";
import { deleteCategoryAction } from "@/server/actions/catalog";
import { categoryFormDefaults } from "@/server/catalog/form-defaults";

export default async function CategoriesPage() {
  await requireRouteAccess("categories");
  const categories = await listCategories();
  const activeCount = categories.filter((category) => category.isActive).length;

  return (
    <div className="catalog-page">
      <header className="catalog-heading">
        <div><span className="eyebrow">KATALOG / PENGELOMPOKAN</span><h1>Kategori</h1><p>Atur kelompok yang membantu tim menemukan produk lebih cepat.</p></div>
        <Link className="catalog-button catalog-button--secondary" href="/products">Lihat produk <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="catalog-metrics" aria-label="Ringkasan kategori">
        <article><span>Total kategori</span><strong>{categories.length}</strong></article>
        <article><span>Kategori aktif</span><strong>{activeCount}</strong></article>
        <article><span>Produk terhubung</span><strong>{categories.reduce((total, category) => total + category._count.products, 0)}</strong></article>
      </section>

      <div className="catalog-columns">
        <section className="catalog-panel">
          <div className="catalog-panel-heading"><div><span className="eyebrow">KATEGORI BARU</span><h2>Tambah kategori</h2></div></div>
          <CategoryForm />
        </section>
        <section className="catalog-panel">
          <div className="catalog-panel-heading"><div><span className="eyebrow">DAFTAR KATEGORI</span><h2>Semua kategori</h2></div><span className="catalog-count">{categories.length} kategori</span></div>
          {categories.length ? (
            <div className="catalog-list">
              {categories.map((category) => (
                <article className="catalog-list-card" key={category.id}>
                  <div className="catalog-list-card-heading">
                    <div><strong>{category.name}</strong><span>{category._count.products} produk · {category.isActive ? "Aktif" : "Nonaktif"}</span></div>
                    <span className={`catalog-status ${category.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{category.isActive ? "Aktif" : "Nonaktif"}</span>
                  </div>
                  <details className="catalog-edit-details"><summary>Edit kategori</summary><CategoryForm compact initial={categoryFormDefaults(category)} /></details>
                  <CatalogDeleteForm action={deleteCategoryAction} id={category.id} label="Hapus kategori" />
                </article>
              ))}
            </div>
          ) : <div className="catalog-empty"><strong>Belum ada kategori</strong><p>Tambahkan kategori pertama untuk mulai menyusun menu.</p></div>}
        </section>
      </div>
    </div>
  );
}
