export const USER_ROLES = ["OWNER", "MANAGER", "CASHIER", "KITCHEN"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const APP_ROUTES = [
  "dashboard",
  "pos",
  "orders",
  "discounts",
  "tables",
  "kitchen",
  "products",
  "addons",
  "categories",
  "inventory",
  "customers",
  "reports",
  "expenses",
  "cash-session",
  "users",
  "settings",
  "audit-logs",
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

const ROUTE_ROLES: Record<AppRoute, readonly UserRole[]> = {
  dashboard: ["OWNER", "MANAGER"],
  pos: ["OWNER", "MANAGER", "CASHIER"],
  orders: ["OWNER", "MANAGER", "CASHIER"],
  discounts: ["OWNER", "MANAGER"],
  tables: ["OWNER", "CASHIER"],
  kitchen: ["OWNER", "KITCHEN"],
  products: ["OWNER", "MANAGER"],
  addons: ["OWNER", "MANAGER"],
  categories: ["OWNER", "MANAGER"],
  inventory: ["OWNER", "MANAGER"],
  customers: ["OWNER", "MANAGER", "CASHIER"],
  reports: ["OWNER", "MANAGER"],
  expenses: ["OWNER", "MANAGER"],
  "cash-session": ["OWNER", "MANAGER", "CASHIER"],
  users: ["OWNER"],
  settings: ["OWNER"],
  "audit-logs": ["OWNER", "MANAGER"],
};

export function canAccessRoute(role: string, route: string): boolean {
  if (!APP_ROUTES.includes(route as AppRoute)) return false;
  if (!USER_ROLES.includes(role as UserRole)) return false;

  return ROUTE_ROLES[route as AppRoute].includes(role as UserRole);
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}
