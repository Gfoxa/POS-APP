import { ExpenseForm } from "@/components/finance/expense-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatDateTimeId, formatIdr } from "@/lib/utils/format";
import { listOpenCashSessions, listExpenses } from "@/server/services/finance";

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function ExpensesPage() {
  await requireRouteAccess("expenses");
  const [expenses, sessions] = await Promise.all([listExpenses(), listOpenCashSessions()]);
  return <div className="catalog-page"><header className="catalog-heading"><div><span className="eyebrow">OPERASIONAL / KEUANGAN</span><h1>Pengeluaran</h1><p>Catat biaya operasional dan hubungkan uang tunai ke sesi kasir.</p></div></header>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">PENGELUARAN BARU</span><h2>Catat biaya</h2></div></div><ExpenseForm sessions={sessions} today={jakartaToday()} /></section>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">RIWAYAT</span><h2>Pengeluaran terbaru</h2></div><span className="catalog-count">{expenses.length} catatan</span></div>
      {expenses.length ? <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Tanggal</th><th>Kategori / deskripsi</th><th>Metode</th><th>Sesi kasir</th><th>Dicatat oleh</th><th>Jumlah</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td>{formatDateTimeId(expense.incurredAt)}</td><td><strong>{expense.category}</strong><br />{expense.description}</td><td>{expense.paymentMethod}</td><td>{expense.cashSession?.cashier.name ?? "—"}</td><td>{expense.user.name}</td><td>{formatIdr(expense.amount)}</td></tr>)}</tbody></table></div> : <div className="catalog-empty"><strong>Belum ada pengeluaran</strong><p>Catatan pengeluaran akan muncul di sini.</p></div>}
    </section>
  </div>;
}
