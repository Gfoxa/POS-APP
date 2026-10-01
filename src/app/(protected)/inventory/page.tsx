import { requireRouteAccess } from "@/lib/auth/guards";
import { getInventoryOverview } from "@/server/services/inventory";
import { InventoryOverview } from "@/components/inventory/inventory-overview";

export default async function InventoryPage() {
  await requireRouteAccess("inventory");
  const data = await getInventoryOverview();
  return <InventoryOverview data={data} />;
}
