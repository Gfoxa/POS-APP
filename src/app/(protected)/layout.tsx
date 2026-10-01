import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth/guards";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  let user: AuthenticatedUser | null;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return (
      <main className="min-h-screen bg-[#f7f5ef] p-8 text-[#26372f]">
        <section className="mx-auto mt-16 max-w-xl rounded-2xl border border-[#e5e0d3] bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#758477]">KOPI SORE</p>
          <h1 className="mt-4 text-2xl font-semibold">Sistem sedang tidak tersedia</h1>
          <p className="mt-3 leading-7 text-[#657168]">
            Kami tidak dapat memuat sesi Anda saat ini. Periksa koneksi database, lalu coba lagi.
          </p>
        </section>
      </main>
    );
  }
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
