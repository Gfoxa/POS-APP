import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogDeleteForm } from "@/components/catalog/catalog-delete-form";
import { ProductForm } from "@/components/catalog/product-form";
import { ProductStatusForm } from "@/components/catalog/product-status-form";
import { VariantDeleteForm, VariantForm } from "@/components/catalog/variant-form";
import { deleteProductAction } from "@/server/actions/catalog";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatIdr } from "@/lib/utils/format";
import { getProductForEdit, listCategoriesForProduct } from "@/server/services/catalog";
import { productFormDefaults, variantFormDefaults } from "@/server/catalog/form-defaults";
import { categoryInputSchema } from "@/server/catalog/validation";

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireRouteAccess("products");
  const { productId } = await params;
  if (!categoryInputSchema.shape.id.safeParse(productId).success) notFound();
  const product = await getProductForEdit(productId);
  if (!product) notFound();
  const categories = await listCategoriesForProduct(product.categoryId);

  return (
    <div className="catalog-page">
      <header className="catalog-heading">
        <div><span className="eyebrow">KATALOG / DETAIL PRODUK</span><h1>{product.name}</h1><p>SKU {product.sku} · {product.category.name} · {formatIdr(product.basePrice)}</p></div>
        <Link className="catalog-button catalog-button--secondary" href="/products">Kembali ke produk</Link>
      </header>

      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">INFORMASI MENU</span><h2>Edit produk</h2></div><span className={`catalog-status ${product.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{product.isActive ? "Aktif" : "Nonaktif"}</span></div>
        <ProductForm categories={categories} initial={productFormDefaults(product)} />
        <div className="catalog-detail-actions"><ProductStatusForm id={product.id} isActive={product.isActive} />
          {product._count.orderItems ? <p className="catalog-muted">Produk sudah memiliki histori pesanan dan hanya dapat dinonaktifkan.</p> : <CatalogDeleteForm action={deleteProductAction} id={product.id} label="Hapus produk" />}
        </div>
      </section>

      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">PILIHAN UKURAN</span><h2>Varian produk</h2></div><span className="catalog-count">{product.variants.length} varian</span></div>
        <div className="catalog-subpanel"><VariantForm productId={product.id} /></div>
        {product.variants.length ? <div className="catalog-list">
          {product.variants.map((variant) => (
            <article className="catalog-list-card" key={variant.id}>
              <div className="catalog-list-card-heading"><div><strong>{variant.name}</strong><span>SKU {variant.sku} · {formatIdr(variant.price)}</span></div><span className={`catalog-status ${variant.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{variant.isActive ? "Aktif" : "Nonaktif"}</span></div>
              <details className="catalog-edit-details"><summary>Edit varian</summary><VariantForm initial={variantFormDefaults(variant)} productId={product.id} /></details>
              <VariantDeleteForm id={variant.id} />
            </article>
          ))}
        </div> : <div className="catalog-empty"><strong>Belum ada varian</strong><p>Gunakan varian untuk pilihan ukuran dengan harga berbeda.</p></div>}
      </section>

      <section className="catalog-panel">
        <div className="catalog-panel-heading"><div><span className="eyebrow">TAMBAHAN PESANAN</span><h2>Add-on terkait</h2></div><Link className="catalog-text-link" href="/addons">Kelola add-on ↗</Link></div>
        {product.addons.length ? <div className="catalog-chip-list">{product.addons.map((addon) => <span className={`catalog-chip ${addon.isActive ? "" : "catalog-chip--muted"}`} key={addon.id}>{addon.name} · {formatIdr(addon.price)}{addon.isActive ? "" : " · Nonaktif"}</span>)}</div> : <div className="catalog-empty"><strong>Belum ada add-on terkait</strong><p>Atur add-on global dan hubungkan ke produk melalui menu Add-on.</p></div>}
      </section>
    </div>
  );
}
