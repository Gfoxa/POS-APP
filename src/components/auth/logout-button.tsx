"use client";

import { signOut } from "next-auth/react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      className={compact ? "logout-button logout-button--compact" : "logout-button"}
      onClick={() => signOut({ callbackUrl: "/login" })}
      type="button"
    >
      <span aria-hidden="true">↗</span>
      <span>Keluar</span>
    </button>
  );
}
