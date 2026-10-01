import { CloseCashSessionForm, OpenCashSessionForm } from "@/components/finance/cash-session-forms";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatDateTimeId, formatIdr } from "@/lib/utils/format";
import { getCashSessionLiveTotals, getOpenCashSession, listCashSessions } from "@/server/services/finance";
import { isLocalPreviewMode } from "@/lib/auth/local-preview";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function CashSessionPage() {
  const user = await requireRouteAccess("cash-session");
  const previewOwner = isLocalPreviewMode() ? await getPrismaClient().user.findFirst({ where: { email: "owner@cafe.local", isActive: true }, select: { id: true } }) : null;
  const cashierId = previewOwner?.id ?? user.id;
  const [current, history] = await Promise.all([getOpenCashSession(cashierId), listCashSessions(cashierId)]);
  const totals = current ? await getCashSessionLiveTotals(current.id) : null;
  return <div className="catalog-page"><header className="catalog-heading"><div><span className="eyebrow">OPERASIONAL / KASIR</span><h1>Sesi kasir</h1><p>Catat uang awal, transaksi tunai, pengeluaran laci, dan rekonsiliasi penutupan.</p></div></header>
    {current && totals ? <><section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">SESI AKTIF</span><h2>Dibuka {formatDateTimeId(current.openedAt)}</h2></div><span className="catalog-status catalog-status--active">Terbuka</span></div>
      <div className="cash-session-summary"><div><span>Uang awal</span><strong>{formatIdr(current.openingCash)}</strong></div><div><span>Penjualan tunai</span><strong>{formatIdr(totals.cashSales)}</strong></div><div><span>Pengembalian tunai</span><strong>− {formatIdr(totals.cashRefunds)}</strong></div><div><span>Pengeluaran tunai</span><strong>− {formatIdr(totals.cashExpenses)}</strong></div><div className="cash-session-summary-total"><span>Kas yang diharapkan</span><strong>{formatIdr(totals.expectedClosingCash)}</strong></div></div>
      <CloseCashSessionForm sessionId={current.id} />
    </section></> : <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">MULAI SHIFT</span><h2>Tidak ada sesi terbuka</h2></div></div><OpenCashSessionForm /></section>}
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">RIWAYAT SHIFT</span><h2>Sesi terakhir</h2></div></div>{history.length ? <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Dibuka</th><th>Ditutup</th><th>Uang awal</th><th>Uang diharapkan</th><th>Uang aktual</th><th>Selisih</th></tr></thead><tbody>{history.map((session) => <tr key={session.id}><td>{formatDateTimeId(session.openedAt)}</td><td>{session.closedAt ? formatDateTimeId(session.closedAt) : "Masih terbuka"}</td><td>{formatIdr(session.openingCash)}</td><td>{session.expectedClosingCash ? formatIdr(session.expectedClosingCash) : "—"}</td><td>{session.actualClosingCash ? formatIdr(session.actualClosingCash) : "—"}</td><td>{session.difference ? formatIdr(session.difference) : "—"}</td></tr>)}</tbody></table></div> : <div className="catalog-empty"><strong>Belum ada riwayat sesi</strong></div>}</section>
  </div>;
}
