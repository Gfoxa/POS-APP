import { canAccessRoute, type AppRoute, type UserRole } from "./roles";

const NAVIGATION_ITEMS: {
  route: AppRoute;
  label: string;
  group: string;
}[] = [
  { route: "dashboard", label: "Ringkasan", group: "Utama" },
  { route: "pos", label: "Kasir / POS", group: "Operasional" },
  { route: "orders", label: "Pesanan", group: "Operasional" },
  { route: "discounts", label: "Diskon", group: "Operasional" },
  { route: "tables", label: "Meja", group: "Operasional" },
  { route: "kitchen", label: "Layar Dapur", group: "Operasional" },
  { route: "products", label: "Produk", group: "Katalog" },
  { route: "addons", label: "Add-on", group: "Katalog" },
  { route: "categories", label: "Kategori", group: "Katalog" },
  { route: "inventory", label: "Inventaris", group: "Manajemen" },
  { route: "customers", label: "Pelanggan", group: "Manajemen" },
  { route: "expenses", label: "Pengeluaran", group: "Manajemen" },
  { route: "cash-session", label: "Sesi kasir", group: "Operasional" },
  { route: "reports", label: "Laporan", group: "Manajemen" },
  { route: "audit-logs", label: "Log aktivitas", group: "Manajemen" },
  { route: "users", label: "Pengguna", group: "Pengaturan" },
  { route: "settings", label: "Pengaturan", group: "Pengaturan" },
];

const IMPLEMENTED_ROUTES: readonly AppRoute[] = ["dashboard", "products", "categories", "addons", "pos", "orders", "discounts", "tables", "kitchen", "inventory", "customers", "expenses", "cash-session", "reports", "users", "settings", "audit-logs"];

export function navigationForRole(role: UserRole) {
  return NAVIGATION_ITEMS.filter((item) => canAccessRoute(role, item.route)).map(
    (item) => ({
      ...item,
      href: `/${item.route}`,
      available: IMPLEMENTED_ROUTES.includes(item.route),
    }),
  );
}
