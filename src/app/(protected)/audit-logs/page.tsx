import Link from "next/link";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatDateTimeId } from "@/lib/utils/format";
import { listAuditLogs } from "@/server/services/audit";

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireRouteAccess("audit-logs");
  const rawPage = Number((await searchParams).page ?? "1");
  const result = await listAuditLogs(rawPage, user.role);
  return <div className="catalog-page"><header className="catalog-heading"><div><span className="eyebrow">KEAMANAN / JEJAK AKTIVITAS</span><h1>Log aktivitas</h1><p>Riwayat perubahan penting dan aktivitas autentikasi.</p></div></header>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">SEMUA AKTIVITAS</span><h2>{result.total} catatan</h2></div><span className="catalog-count">Halaman {result.page} dari {result.pageCount}</span></div>{result.rows.length ? <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Tindakan</th><th>Entitas</th><th>Detail</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id}><td>{formatDateTimeId(row.createdAt)}</td><td>{row.user?.name ?? "Pengguna dihapus"}<br /><small>{row.user?.email ?? ""}</small></td><td>{row.action}</td><td>{row.entity}{row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}</td><td><code>{row.metadata ? JSON.stringify(row.metadata) : "—"}</code></td></tr>)}</tbody></table></div> : <div className="catalog-empty">Belum ada aktivitas yang tercatat.</div>}
      <nav className="report-pagination" aria-label="Halaman log aktivitas">{result.page > 1 && <Link className="catalog-button" href={`/audit-logs?page=${result.page - 1}`}>Sebelumnya</Link>}{result.page < result.pageCount && <Link className="catalog-button" href={`/audit-logs?page=${result.page + 1}`}>Berikutnya</Link>}</nav>
    </section>
  </div>;
}
