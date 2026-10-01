import { KitchenDisplay } from "@/components/kitchen/kitchen-display";
import { requireRouteAccess } from "@/lib/auth/guards";
import { listKitchenOrders } from "@/server/services/order-workflow";

export default async function KitchenPage() {
  await requireRouteAccess("kitchen");
  const orders = await listKitchenOrders();
  return <KitchenDisplay orders={orders} />;
}
