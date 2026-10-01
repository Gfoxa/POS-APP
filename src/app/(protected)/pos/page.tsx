import { PosWorkspace } from "@/components/pos/pos-workspace";
import { requireRouteAccess } from "@/lib/auth/guards";
import { getPosData } from "@/server/services/orders";

export default async function PosPage() {
  const user = await requireRouteAccess("pos");
  const data = await getPosData(user.id);
  return <PosWorkspace data={data} />;
}
