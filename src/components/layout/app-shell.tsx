"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { navigationForRole } from "@/lib/permissions/navigation";
import type { UserRole } from "@/lib/permissions/roles";

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Pemilik",
  MANAGER: "Manajer",
  CASHIER: "Kasir",
  KITCHEN: "Tim dapur",
};

const ROLE_INITIALS: Record<UserRole, string> = {
  OWNER: "P",
  MANAGER: "M",
  CASHIER: "K",
  KITCHEN: "D",
};

function NavigationGlyph({ route }: { route: string }) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><path d="M3 3h7v7H3z" /><path d="M14 3h7v5h-7z" /><path d="M14 12h7v9h-7z" /><path d="M3 14h7v7H3z" /></>,
    pos: <><path d="M5 7h14l1 13H4L5 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
    orders: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    tables: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 16v4m10-4v4M8 9h8" /></>,
    kitchen: <><path d="M6 14h12a4 4 0 0 1 4 4v2H2v-2a4 4 0 0 1 4-4Z" /><path d="M8 10c0-2 2-2 2-4m3 4c0-2 2-2 2-4m3 4c0-2 2-2 2-4" /></>,
    products: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    categories: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
    inventory: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 12l8 4 8-4M4 17l8 4 8-4M4 7v10m16-10v10" /></>,
    customers: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0m2-13a4 4 0 0 1 0 8m1 1a6 6 0 0 1 3 5" /></>,
    expenses: <><path d="M4 5h16v14H4z" /><path d="M8 9h8m-8 4h5" /><circle cx="17" cy="16" r="1" /></>,
    reports: <><path d="M4 20V10m6 10V4m6 16v-7m6 7H2" /></>,
    users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0m2-13h5m-2.5-2.5v5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.8-.7a8 8 0 0 1-1.6.9l-.3 1.9h-2.8l-.3-1.9a8 8 0 0 1-1.6-.9l-1.8.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.8.7a8 8 0 0 1 1.6-.9l.3-1.9h2.8l.3 1.9a8 8 0 0 1 1.6.9l1.8-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.9Z" transform="translate(-1 -1)" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      {paths[route] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole };
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = navigationForRole(user.role);
  const groups = [...new Set(navigation.map((item) => item.group))];

  return (
    <div className="min-h-screen bg-[#f6f5f0] text-[#1c2822]">
      <aside className={`app-sidebar ${menuOpen ? "app-sidebar--open" : ""}`}>
        <Link className="brand-lockup" href="/workspace" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            <svg fill="none" viewBox="0 0 36 36">
              <path d="M8 14h18l-2 13H10L8 14Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M26 17h2a4 4 0 0 1 0 8h-4M12 10c-1-2 2-2 1-4m5 4c-1-2 2-2 1-4m5 4c-1-2 2-2 1-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>
          </span>
          <span className="brand-copy">
            <strong>Kopi Sore</strong>
            <small>CAFE OPERATIONS</small>
          </span>
        </Link>

        <Link
          className={`workspace-link ${pathname === "/workspace" ? "workspace-link--active" : ""}`}
          href="/workspace"
          onClick={() => setMenuOpen(false)}
        >
          <span aria-hidden="true">⌂</span> Ruang kerja
        </Link>

        <nav aria-label="Navigasi utama" className="sidebar-nav">
          {groups.map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-group-label">{group}</p>
              {navigation
                .filter((item) => item.group === group)
                .map((item) => {
                  const active = pathname === item.href;
                  return item.available ? (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`nav-item ${active ? "nav-item--active" : ""}`}
                      href={item.href}
                      key={item.route}
                      onClick={() => setMenuOpen(false)}
                    >
                      <NavigationGlyph route={item.route} />
                      <span>{item.label}</span>
                    </Link>
                  ) : (
                    <div aria-disabled="true" className="nav-item nav-item--disabled" key={item.route}>
                      <NavigationGlyph route={item.route} />
                      <span>{item.label}</span>
                      <span className="nav-soon">Nanti</span>
                    </div>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className="status-dot" />
            <span>Mode pengembangan</span>
          </div>
          <div className="sidebar-user">
            <span className="avatar avatar--sidebar">{ROLE_INITIALS[user.role]}</span>
            <span className="sidebar-user-copy">
              <strong>{user.name}</strong>
              <small>{ROLE_LABELS[user.role]}</small>
            </span>
            <LogoutButton compact />
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          aria-label="Tutup navigasi"
          className="sidebar-scrim"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      )}

      <div className="app-main">
        <header className="topbar">
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Tutup navigasi" : "Buka navigasi"}
            className="mobile-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span />
            <span />
          </button>
          <div className="topbar-kicker">
            <span className="topbar-dot" /> OPERASIONAL <span className="topbar-divider">/</span> KOPI SORE POS
          </div>
          <div className="topbar-user">
            <span className="topbar-user-copy">
              <strong>{user.name}</strong>
              <small>{ROLE_LABELS[user.role]}</small>
            </span>
            <span className="avatar">{ROLE_INITIALS[user.role]}</span>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
