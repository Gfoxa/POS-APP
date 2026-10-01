import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="notice-page">
      <span className="eyebrow">AKSES TERBATAS</span>
      <h1>Menu ini belum tersedia untuk akun Anda.</h1>
      <p>Jika Anda merasa seharusnya memiliki akses, hubungi pemilik sistem.</p>
      <Link className="button button--primary" href="/workspace">Kembali ke ruang kerja</Link>
    </main>
  );
}
