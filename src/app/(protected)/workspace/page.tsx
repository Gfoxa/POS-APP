import Link from "next/link";
import { navigationForRole } from "@/lib/permissions/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { ROLE_COPY } from "@/lib/permissions/role-copy";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";

export default async function WorkspacePage() {
  const user = await requireAuthenticatedUser();
  const navigation = navigationForRole(user.role);
  const readyCount = navigation.filter((item) => item.available).length;

  return (
    <div className="workspace-page">
      {isLocalPreviewMode() && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          <strong>Pratinjau lokal tanpa login.</strong> Data dashboard membutuhkan PostgreSQL dan belum tersedia sampai database disiapkan.
        </div>
      )}
      <section className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow">RUANG KERJA / KOPI SORE POS</span>
          <h1>Selamat datang, {user.name.split(" ")[0]}.</h1>
          <p>{ROLE_COPY[user.role]}</p>
          {user.role === "OWNER" || user.role === "MANAGER" ? (
            <Link className="button button--primary" href="/dashboard">
              Lihat ringkasan <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <div className="work-in-progress-note">
              <span className="note-icon" aria-hidden="true">✳</span>
              <span>Gunakan menu di samping untuk membuka alur kerja {user.role === "CASHIER" ? "kasir" : "dapur"} yang tersedia.</span>
            </div>
          )}
        </div>
        <div className="welcome-illustration" aria-hidden="true">
          <div className="sun-orb" />
          <div className="cup-shadow" />
          <div className="coffee-cup">
            <span />
          </div>
          <div className="cup-handle" />
          <div className="coffee-steam coffee-steam--one" />
          <div className="coffee-steam coffee-steam--two" />
          <span className="sparkle sparkle--one">✳</span>
          <span className="sparkle sparkle--two">✳</span>
        </div>
      </section>

      <section className="workspace-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">AKSES ANDA</span>
            <h2>Menu kerja</h2>
          </div>
          <span className="section-meta">{readyCount} menu siap</span>
        </div>
        <div className="module-grid">
          {navigation.map((item) => (
            item.available ? (
              <Link className="module-card module-card--ready" href={item.href} key={item.route}>
                <span className="module-icon">{item.label.slice(0, 1)}</span>
                <span className="module-title">{item.label}</span>
                <span className="module-description">Buka menu kerja</span>
                <span className="module-arrow" aria-hidden="true">↗</span>
              </Link>
            ) : (
              <div aria-disabled="true" className="module-card module-card--soon" key={item.route}>
                <span className="module-icon">{item.label.slice(0, 1)}</span>
                <span className="module-title">{item.label}</span>
                <span className="module-description">Tersedia pada fase berikutnya</span>
                <span className="module-badge">SEGERA</span>
              </div>
            )
          ))}
        </div>
      </section>

      <div className="workspace-footer">
        <span className="footer-mark">K</span>
        <p>Fondasi yang tertata membuat layanan terasa ringan.</p>
        <span>CAFE POS / OPERASIONAL</span>
      </div>
    </div>
  );
}
