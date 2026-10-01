"use client";

import { useActionState } from "react";
import { createUserAction, updateUserAction } from "@/server/actions/users";
import { CatalogFeedback } from "@/components/catalog/catalog-feedback";
import { EMPTY_CATALOG_ACTION_STATE } from "@/server/catalog/action-state";

type User = { id: string; name: string; email: string; role: string; isActive: boolean };
const roles = [["OWNER", "Pemilik"], ["MANAGER", "Manajer"], ["CASHIER", "Kasir"], ["KITCHEN", "Tim dapur"]];

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUserAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="catalog-form"><label className="catalog-field"><span>Nama</span><input maxLength={120} name="name" required /></label><label className="catalog-field"><span>Email</span><input autoComplete="off" maxLength={254} name="email" required type="email" /></label><label className="catalog-field"><span>Kata sandi awal <small>Minimal 12 karakter</small></span><input autoComplete="new-password" maxLength={72} minLength={12} name="password" required type="password" /></label><label className="catalog-field"><span>Peran</span><select name="role">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="catalog-button catalog-button--primary" disabled={pending} type="submit">{pending ? "Membuat…" : "Buat pengguna"}</button><CatalogFeedback error={state.error} message={state.message} /></form>;
}

export function EditUserForm({ user }: { user: User }) {
  const [state, action, pending] = useActionState(updateUserAction, EMPTY_CATALOG_ACTION_STATE);
  return <form action={action} className="user-edit-form"><input name="id" type="hidden" value={user.id} /><label className="catalog-field"><span>Nama</span><input defaultValue={user.name} maxLength={120} name="name" required /></label><label className="catalog-field"><span>Email</span><input defaultValue={user.email} maxLength={254} name="email" required type="email" /></label><label className="catalog-field"><span>Peran</span><select defaultValue={user.role} name="role">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="catalog-field"><span>Kata sandi baru <small>Opsional; minimal 12 karakter</small></span><input autoComplete="new-password" maxLength={72} minLength={12} name="password" type="password" /></label><label className="catalog-check"><input name="isActive" type="hidden" value="false" /><input defaultChecked={user.isActive} name="isActive" type="checkbox" value="true" /><span>Akun aktif</span></label><button className="catalog-button" disabled={pending} type="submit">{pending ? "Menyimpan…" : "Simpan pengguna"}</button><CatalogFeedback error={state.error} message={state.message} /></form>;
}
