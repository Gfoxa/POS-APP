import { EditUserForm, NewUserForm } from "@/components/users/user-forms";
import { requireRouteAccess } from "@/lib/auth/guards";
import { listUsers } from "@/server/services/users";

const label: Record<string, string> = { OWNER: "Pemilik", MANAGER: "Manajer", CASHIER: "Kasir", KITCHEN: "Tim dapur" };

export default async function UsersPage() {
  await requireRouteAccess("users");
  const users = await listUsers();
  return <div className="catalog-page"><header className="catalog-heading"><div><span className="eyebrow">AKSES / TIM</span><h1>Pengguna</h1><p>Buat akun dan atur peran. Akun dinonaktifkan tetap tersimpan pada riwayat.</p></div></header>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">AKUN BARU</span><h2>Tambah anggota tim</h2></div></div><NewUserForm /></section>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">AKUN TERSIMPAN</span><h2>{users.length} pengguna</h2></div></div><div className="user-list">{users.map((user) => <article className="user-card" key={user.id}><div className="customer-card-main"><div><strong>{user.name}</strong><span>{user.email} · {label[user.role]}</span></div><span className={`catalog-status ${user.isActive ? "catalog-status--active" : "catalog-status--inactive"}`}>{user.isActive ? "Aktif" : "Nonaktif"}</span></div><details className="catalog-edit-details"><summary>Edit akun</summary><EditUserForm user={{ ...user, role: user.role }} /></details></article>)}</div></section>
  </div>;
}
