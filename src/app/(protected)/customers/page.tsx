import Link from "next/link";
import { CustomerForm, CustomerStatusForm } from "@/components/customers/customer-form";
import { requireRouteAccess } from "@/lib/auth/guards";
import { formatIdr, formatDateTimeId } from "@/lib/utils/format";
import { listCustomers } from "@/server/services/customers";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRouteAccess("customers");
  const query = (await searchParams).q?.slice(0, 80) ?? "";
  const customers = await listCustomers(query);
  return <div className="catalog-page">
    <header className="catalog-heading"><div><span className="eyebrow">HUBUNGAN PELANGGAN</span><h1>Pelanggan</h1><p>Kelola kontak dan lihat riwayat kunjungan serta belanja.</p></div></header>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">PELANGGAN BARU</span><h2>Tambah pelanggan</h2></div></div><CustomerForm /></section>
    <section className="catalog-panel">
      <div className="catalog-panel-heading"><div><span className="eyebrow">DAFTAR PELANGGAN</span><h2>{customers.length} pelanggan</h2></div></div>
      <form className="customer-search" action="/customers"><input aria-label="Cari nama, telepon, atau email" defaultValue={query} maxLength={80} name="q" placeholder="Cari nama, telepon, atau email" /><button className="catalog-button" type="submit">Cari</button>{query && <Link className="catalog-button" href="/customers">Hapus filter</Link>}</form>
      {customers.length ? <div className="customer-list">{customers.map((customer) => {
        const formCustomer = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, notes: customer.notes, isActive: customer.isActive };
        return <article className="customer-card" key={customer.id}>
        <div className="customer-card-main"><div><strong>{customer.name}</strong><span>{[customer.phone, customer.email].filter(Boolean).join(" · ") || "Belum ada kontak"}</span>{customer.notes && <small>{customer.notes}</small>}</div><span className={`catalog-status ${customer.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{customer.isActive ? "Aktif" : "Nonaktif"}</span></div>
        <div className="customer-stats"><span><small>Kunjungan</small><strong>{customer.totalVisits}</strong></span><span><small>Total belanja</small><strong>{formatIdr(customer.totalSpending)}</strong></span><span><small>Kunjungan terakhir</small><strong>{customer.lastVisit ? formatDateTimeId(customer.lastVisit) : "Belum ada"}</strong></span></div>
        <details className="catalog-edit-details"><summary>Edit pelanggan</summary><CustomerForm initial={formCustomer} /></details>
        <CustomerStatusForm customer={{ id: customer.id, isActive: customer.isActive }} />
      </article>;
      })}</div> : <div className="catalog-empty"><strong>{query ? "Pelanggan tidak ditemukan" : "Belum ada pelanggan"}</strong><p>Data pelanggan dapat ditambahkan di sini atau langsung dipilih saat transaksi.</p></div>}
    </section>
  </div>;
}
