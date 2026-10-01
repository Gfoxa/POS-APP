import { TableWorkspace } from "@/components/tables/table-workspace";
import { requireRouteAccess } from "@/lib/auth/guards";
import { listTables } from "@/server/services/tables";

export default async function TablesPage() {
  const user = await requireRouteAccess("tables");
  const tables = await listTables();
  return <TableWorkspace tables={tables} canComplete={user.role === "OWNER" || user.role === "CASHIER"} />;
}
