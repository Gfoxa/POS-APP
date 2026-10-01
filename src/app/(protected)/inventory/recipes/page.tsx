import { requireRouteAccess } from "@/lib/auth/guards";
import { RecipeForm } from "@/components/inventory/recipe-form";
import { listIngredients, listRecipeTargets } from "@/server/services/inventory";

export default async function RecipesPage() {
  await requireRouteAccess("inventory");
  const [{ products, addons }, ingredientRows] = await Promise.all([listRecipeTargets(), listIngredients()]);
  const ingredients = ingredientRows.map(({ id, name, unit, isActive }) => ({ id, name, unit, isActive }));
  return <div className="catalog-page">
    <header className="catalog-heading"><div><span className="eyebrow">INVENTARIS / KOMPONEN MENU</span><h1>Resep produk</h1><p>Atur bahan per porsi. Kebutuhan disimpan saat pembayaran dan stok dipotong saat pesanan selesai.</p></div></header>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">PRODUK</span><h2>Resep produk</h2></div><span className="panel-count">{products.length} produk aktif</span></div><div className="inventory-ingredient-list">{products.map((product) => <details className="inventory-ingredient-card" key={product.id}><summary><span><strong>{product.name}</strong><small>{product.trackInventory ? "Pelacakan stok aktif" : "Pelacakan stok nonaktif"}</small></span><span><b>{product.recipe ? `${product.recipe.items.length} bahan` : "Belum ada resep"}</b></span></summary><RecipeForm targetId={product.id} targetType="product" targetName={product.name} ingredients={ingredients} initialItems={product.recipe?.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity.toFixed(3) }))} /></details>)}</div></section>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">TAMBAHAN</span><h2>Resep add-on</h2></div><span className="panel-count">{addons.length} add-on aktif</span></div><div className="inventory-ingredient-list">{addons.length ? addons.map((addon) => <details className="inventory-ingredient-card" key={addon.id}><summary><span><strong>{addon.name}</strong><small>Kalikan kebutuhan dengan jumlah add-on dan jumlah produk</small></span><span><b>{addon.recipe ? `${addon.recipe.items.length} bahan` : "Tanpa pemakaian stok"}</b></span></summary><RecipeForm targetId={addon.id} targetType="addon" targetName={addon.name} ingredients={ingredients} initialItems={addon.recipe?.items.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity.toFixed(3) }))} /></details>) : <p className="inventory-empty">Belum ada add-on aktif.</p>}</div></section>
  </div>;
}
