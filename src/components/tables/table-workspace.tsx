"use client";

import { useActionState } from "react";
import { OrderTransitionButton } from "@/components/orders/order-transition-button";
import { mergeTablesAction, moveOrderToTableAction, saveTableAction, tableOperationAction, unmergeTableAction, type TableActionState } from "@/server/actions/tables";
import { formatDateTimeId, formatIdr } from "@/lib/utils/format";

type TableGroup = {
  id: string; name: string; capacity: number; status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING";
  members: { id: string; name: string; capacity: number }[]; activeOrderCount: number;
  orders: { id: string; orderNumber: string; status: string; createdAt: Date; total: string; itemCount: number }[];
};
const STATUS: Record<TableGroup["status"], string> = { AVAILABLE: "Tersedia", OCCUPIED: "Terisi", RESERVED: "Dipesan", CLEANING: "Dibersihkan" };

function Result({ state }: { state: TableActionState }) { return state.message ? <p className={state.error ? "catalog-feedback catalog-feedback--error" : "catalog-feedback"} role={state.error ? "alert" : "status"}>{state.message}</p> : null; }

function TableEditor({ table }: { table?: { id: string; name: string; capacity: number } }) {
  const [state, action, pending] = useActionState(saveTableAction, { message: "" });
  return <form action={action} className="table-editor">
    {table && <input name="id" type="hidden" value={table.id} />}
    <label className="catalog-field"><span>Nama meja</span><input maxLength={40} name="name" required defaultValue={table?.name ?? ""} /></label>
    <label className="catalog-field"><span>Kapasitas</span><input max={30} min={1} name="capacity" required type="number" defaultValue={table?.capacity ?? 2} /></label>
    <input name="isActive" type="hidden" value="true" />
    <button className="catalog-button catalog-button--small" disabled={pending} type="submit">{table ? "Simpan" : "Tambah meja"}</button><Result state={state} />
  </form>;
}

function Operation({ tableId, operation, label }: { tableId: string; operation: string; label: string }) {
  const [state, action, pending] = useActionState(tableOperationAction, { message: "" });
  return <form action={action}><input name="tableId" type="hidden" value={tableId} /><input name="operation" type="hidden" value={operation} /><button className="catalog-button catalog-button--small catalog-button--secondary" disabled={pending} type="submit">{pending ? "…" : label}</button>{state.message && <span className="sr-only" role={state.error ? "alert" : "status"}>{state.message}</span>}</form>;
}

function Unmerge({ tableId }: { tableId: string }) {
  const [state, action, pending] = useActionState(unmergeTableAction, { message: "" });
  return <form action={action}><input name="tableId" type="hidden" value={tableId} /><button className="catalog-button catalog-button--small" disabled={pending} type="submit">{pending ? "…" : "Pisahkan"}</button>{state.message && <span role={state.error ? "alert" : "status"}>{state.message}</span>}</form>;
}

function Merge({ rootId, candidates }: { rootId: string; candidates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(mergeTablesAction, { message: "" });
  return <form action={action} className="table-merge-form"><input name="primaryTableId" type="hidden" value={rootId} /><label className="catalog-field"><span>Gabungkan meja lain</span><select multiple name="memberTableIds" size={Math.min(4, Math.max(2, candidates.length))}>{candidates.filter((table) => table.id !== rootId).map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label><button className="catalog-button catalog-button--small" disabled={pending || candidates.length < 2} type="submit">Gabungkan</button><Result state={state} /></form>;
}

function MoveOrder({ orderId, tables }: { orderId: string; tables: { id: string; name: string; status: string }[] }) {
  const [state, action, pending] = useActionState(moveOrderToTableAction, { message: "" });
  return <form action={action} className="table-move-form"><input name="orderId" type="hidden" value={orderId} /><select aria-label="Pindahkan pesanan ke meja" name="tableId" required defaultValue=""><option value="">Pindahkan ke…</option>{tables.filter((table) => ["AVAILABLE", "OCCUPIED"].includes(table.status)).map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}</select><button className="catalog-button catalog-button--small" disabled={pending} type="submit">Pindah</button>{state.message && <span role={state.error ? "alert" : "status"}>{state.message}</span>}</form>;
}

export function TableWorkspace({ tables, canComplete }: { tables: TableGroup[]; canComplete: boolean }) {
  const all = ["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING"];
  return <div className="catalog-page">
    <header className="catalog-heading"><div><span className="eyebrow">OPERASIONAL / LAYANAN MEJA</span><h1>Meja</h1><p>Atur meja, pindahkan pesanan, dan selesaikan layanan ruang makan.</p></div></header>
    <section className="catalog-panel"><div className="catalog-panel-heading"><div><span className="eyebrow">TATA LETAK</span><h2>Tambah meja</h2></div><span className="catalog-count">{tables.length} grup</span></div><TableEditor /></section>
    <section className="table-grid">{tables.map((table) => <article className="catalog-panel table-card" key={table.id}>
      <header className="table-card-heading"><div><span className={`catalog-status ${table.status === "AVAILABLE" ? "catalog-status--active" : "catalog-status--inactive"}`}>{STATUS[table.status]}</span><h2>{table.name}</h2><p>{table.capacity} kursi · {table.members.length} meja · {table.activeOrderCount} pesanan aktif</p></div></header>
      <TableEditor table={{ id: table.id, name: table.name, capacity: table.members[0]?.capacity ?? table.capacity }} />
      <div className="table-operations">{table.status === "AVAILABLE" && <><Operation tableId={table.id} operation="RESERVE" label="Pesan" /><Operation tableId={table.id} operation="START_CLEANING" label="Mulai bersihkan" /></>}{table.status === "RESERVED" && <Operation tableId={table.id} operation="RELEASE" label="Batalkan reservasi" />}{table.status === "OCCUPIED" && <Operation tableId={table.id} operation="START_CLEANING" label="Mulai bersihkan" />}{table.status === "CLEANING" && <Operation tableId={table.id} operation="MARK_AVAILABLE" label="Tandai tersedia" />}</div>
      {table.members.length > 1 && <div className="table-members"><strong>Meja dalam grup</strong>{table.members.map((member) => <div key={member.id}><span>{member.name} · {member.capacity} kursi</span>{member.id !== table.id && <Unmerge tableId={member.id} />}</div>)}</div>}
      <Merge rootId={table.id} candidates={tables.map((candidate) => ({ id: candidate.id, name: candidate.name }))} />
      {table.orders.length > 0 && <div className="table-orders"><strong>Pesanan aktif</strong>{table.orders.map((order) => <article key={order.id}><div><b>{order.orderNumber}</b><span>{order.itemCount} item · {formatIdr(order.total)} · {formatDateTimeId(order.createdAt)}</span></div><div className="table-order-actions">{order.status === "READY" && canComplete && <OrderTransitionButton orderId={order.id} expectedStatus="READY" nextStatus="COMPLETED" label="Selesaikan" />}<MoveOrder orderId={order.id} tables={tables.filter((candidate) => candidate.id !== table.id).map((candidate) => ({ id: candidate.id, name: candidate.name, status: candidate.status }))} /></div></article>)}</div>}
      <span className="sr-only">Status grup: {all.includes(table.status) ? STATUS[table.status] : table.status}</span>
    </article>)}</section>
  </div>;
}
