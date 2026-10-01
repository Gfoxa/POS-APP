"use client";

export default function ProtectedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="empty-state-card" role="alert">
      <span className="eyebrow">KONEKSI TERGANGGU</span>
      <h1>Halaman belum dapat dimuat</h1>
      <p>Periksa koneksi database, lalu coba muat kembali halaman ini.</p>
      <button className="button button--primary" onClick={() => reset()} type="button">
        Coba lagi
      </button>
    </section>
  );
}
