import { requireRouteAccess } from "@/lib/auth/guards";
import { formatIdrUnitCost } from "@/lib/utils/format";
import { listIngredients, listInventoryMovements } from "@/server/services/inventory";
import { IngredientForm } from "@/components/inventory/ingredient-form";
import { MovementForm } from "@/components/inventory/movement-form";
import { DeactivateIngredientForm } from "@/components/inventory/deactivate-ingredient-form";

export default async function IngredientsPage() {
  await requireRouteAccess("inventory");
  const [ingredients, movements] = await Promise.all([listIngredients(), listInventoryMovements(30)]);
  const activeIngredientOptions = ingredients.filter((item) => item.isActive).map(({ id, name, unit }) => ({ id, name, unit }));
  return <div className="catalog-page">
    <header className="catalog-heading"><div><span className="eyebrow">INVENTARIS / STOK</span><h1>Bahan & stok</h1><p>Kelola bahan, biaya rata-rata, dan catat setiap perubahan stok.</p></div></header>
    <div className="inventory-columns"><section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">BAHAN BARU</span><h2>Tambah bahan</h2></div></div><IngredientForm /><hr className="inventory-divider" /><div className="catalog-panel-heading"><div><span className="eyebrow">BUKU STOK</span><h2>Catat pergerakan</h2></div></div><MovementForm ingredients={activeIngredientOptions} /></section>
      <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">DAFTAR BAHAN</span><h2>{ingredients.length} bahan</h2></div></div><div className="inventory-ingredient-list">{ingredients.map((ingredient) => <details className="inventory-ingredient-card" key={ingredient.id}><summary><span><strong>{ingredient.name}</strong><small>{ingredient.currentStock.toFixed(3)} {ingredient.unit} · minimum {ingredient.minimumStock.toFixed(3)} {ingredient.unit}</small></span><span><b>{formatIdrUnitCost(ingredient.costPerUnit)}</b><small>{ingredient.isActive ? "Aktif" : "Nonaktif"}</small></span></summary><div className="inventory-ingredient-edit"><IngredientForm initial={{ id: ingredient.id, name: ingredient.name, unit: ingredient.unit, minimumStock: ingredient.minimumStock.toFixed(3), isActive: ingredient.isActive }} />{ingredient.isActive && <DeactivateIngredientForm id={ingredient.id} />}</div></details>)}</div></section></div>
    <section className="catalog-panel inventory-history-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">AUDIT STOK</span><h2>Riwayat pergerakan</h2></div></div><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Waktu</th><th>Bahan</th><th>Jenis</th><th>Perubahan</th><th>Biaya satuan</th><th>Oleh</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{movement.createdAt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}</td><td>{movement.ingredient.name}</td><td>{movement.type}</td><td>{movement.quantityDelta.toFixed(3)} {movement.ingredient.unit}</td><td>{movement.unitCostSnapshot ? formatIdrUnitCost(movement.unitCostSnapshot) : "—"}</td><td>{movement.performedBy?.name ?? "Sistem"}</td></tr>)}</tbody></table></div></section>
  </div>;
}
