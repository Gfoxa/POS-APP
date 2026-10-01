import Link from "next/link";
import { ProductForm } from "@/components/catalog/product-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { listProductCategories } from "@/server/services/catalog";

export default async function NewProductPage() {
  await requireRouteAccess("products");
  const categories = await listProductCategories();
  return (
    <div className="catalog-page catalog-page--narrow">
      <header className="catalog-heading"><div><span className="eyebrow">KATALOG / PRODUK BARU</span><h1>Tambah produk</h1><p>Isi informasi menu. Varian dan add-on dapat diatur setelah produk dibuat.</p></div><Link className="catalog-button catalog-button--secondary" href="/products">Kembali</Link></header>
      <section className="catalog-panel"><ProductForm categories={categories} /></section>
      {!categories.length && <p className="catalog-inline-note">Buat kategori aktif terlebih dahulu di <Link href="/categories">menu Kategori</Link>.</p>}
    </div>
  );
}
