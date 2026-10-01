import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { authOptions } from "@/lib/auth/config";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";

export default async function LoginPage() {
  if (isLocalPreviewMode()) redirect("/workspace");

  const session = await getServerSession(authOptions);
  if (session?.user) {
    let activeUser = false;
    try {
      activeUser = Boolean(await getAuthenticatedUser());
    } catch {
      // Keep the login form available when the database cannot validate a session.
    }
    if (activeUser) redirect("/workspace");
  }

  return (
    <main className="login-layout">
      <section className="login-story">
        <a className="brand-lockup brand-lockup--login" href="/login">
          <span className="brand-mark" aria-hidden="true">
            <svg fill="none" viewBox="0 0 36 36">
              <path d="M8 14h18l-2 13H10L8 14Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M26 17h2a4 4 0 0 1 0 8h-4M12 10c-1-2 2-2 1-4m5 4c-1-2 2-2 1-4m5 4c-1-2 2-2 1-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>
          </span>
          <span className="brand-copy"><strong>Kopi Sore</strong><small>CAFE OPERATIONS</small></span>
        </a>

        <div className="login-story-copy">
          <span className="eyebrow eyebrow--light">RUANG KERJA TIM</span>
          <h1>Hari yang baik dimulai dari hal-hal kecil.</h1>
          <p>Semua operasional kafe, dirangkum dalam satu tempat yang terasa sederhana.</p>
        </div>

        <div className="login-still-life" aria-hidden="true">
          <span className="still-life-sun" />
          <span className="still-life-bean still-life-bean--one" />
          <span className="still-life-bean still-life-bean--two" />
          <span className="still-life-cup">
            <span className="still-life-cup-top" />
          </span>
          <span className="still-life-handle" />
          <span className="still-life-shadow" />
          <span className="still-life-steam still-life-steam--one" />
          <span className="still-life-steam still-life-steam--two" />
          <span className="still-life-leaf still-life-leaf--one" />
          <span className="still-life-leaf still-life-leaf--two" />
        </div>

        <div className="login-story-foot">
          <span>01 — OPERASIONAL YANG LEBIH TENANG</span>
          <span>EST. 2026</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-mobile-brand">
            <span className="brand-mark" aria-hidden="true">K</span>
            <span className="brand-copy"><strong>Kopi Sore</strong><small>CAFE OPERATIONS</small></span>
          </div>
          <span className="eyebrow">SELAMAT DATANG KEMBALI</span>
          <h2>Masuk ke ruang kerja.</h2>
          <p className="login-intro">Gunakan akun tim Anda untuk melanjutkan.</p>
          <LoginForm />
          <p className="login-panel-foot">Dengan masuk, Anda mengakses data operasional Kopi Sore.</p>
        </div>
      </section>
    </main>
  );
}
