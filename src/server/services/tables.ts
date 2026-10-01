import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type { MergeTablesInput, TableInput, TableStatusInput } from "@/server/tables/validation";

export class TableServiceError extends Error {
  constructor(message: string, readonly code: "NOT_FOUND" | "DUPLICATE_NAME" | "INVALID_STATE" | "INVALID_REFERENCE" | "DATABASE") {
    super(message);
    this.name = "TableServiceError";
  }
}

type Db = PrismaClient | Prisma.TransactionClient;
const ACTIVE_ORDER_STATUSES = ["DRAFT", "CONFIRMED", "PREPARING", "READY"] as const;

function safeError(error: unknown): never {
  if (error instanceof TableServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new TableServiceError("Nama meja sudah digunakan.", "DUPLICATE_NAME");
    if (error.code === "P2025") throw new TableServiceError("Meja atau pesanan tidak ditemukan.", "NOT_FOUND");
    if (error.code === "P2003" || error.code === "P2014") throw new TableServiceError("Meja masih digunakan.", "INVALID_STATE");
  }
  console.error("Table operation failed.", error);
  throw new TableServiceError("Meja belum dapat diproses. Coba lagi.", "DATABASE");
}

async function audit(db: Db, actorId: string, action: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
  await db.auditLog.create({ data: { userId: actorId, action, entity: "CafeTable", entityId, metadata } });
}

async function getRoot(db: Db, tableId: string) {
  const table = await db.cafeTable.findUnique({ where: { id: tableId }, select: { id: true, mergedIntoId: true } });
  if (!table) throw new TableServiceError("Meja tidak ditemukan.", "NOT_FOUND");
  return table.mergedIntoId ?? table.id;
}

export async function resolveTableRootInTransaction(db: Db, tableId: string) {
  return getRoot(db, tableId);
}

export async function claimDineInTable(tx: Prisma.TransactionClient, tableId: string) {
  const rootId = await getRoot(tx, tableId);
  const ids = await groupIds(tx, rootId);
  const tables = await tx.cafeTable.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, status: true } });
  if (tables.length !== ids.length || tables.some((table) => !table.isActive || !["AVAILABLE", "OCCUPIED"].includes(table.status))) {
    throw new TableServiceError("Pilih grup meja aktif yang tersedia.", "INVALID_STATE");
  }
  const claimed = await tx.cafeTable.updateMany({
    where: { id: { in: ids }, isActive: true, status: { in: ["AVAILABLE", "OCCUPIED"] } },
    data: { status: "OCCUPIED" },
  });
  if (claimed.count !== ids.length) throw new TableServiceError("Grup meja baru saja berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
  return rootId;
}

async function groupIds(db: Db, rootId: string) {
  const members = await db.cafeTable.findMany({ where: { mergedIntoId: rootId }, select: { id: true } });
  return [rootId, ...members.map((member) => member.id)];
}

async function hasActiveOrders(db: Db, ids: string[]) {
  return (await db.order.count({ where: { tableId: { in: ids }, status: { in: [...ACTIVE_ORDER_STATUSES] } } })) > 0;
}

export async function refreshTableGroupAfterOrderChange(tx: Prisma.TransactionClient, rootId: string) {
  // Serialize competing order completions/moves on the group root. PostgreSQL
  // takes a fresh READ COMMITTED snapshot for the active-order query after this
  // lock is acquired, so the last completion cannot leave the group occupied.
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CafeTable" WHERE "id" = ${rootId}::uuid FOR UPDATE`);
  const ids = await groupIds(tx, rootId);
  const tables = await tx.cafeTable.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, isActive: true } });
  if (!tables.length || tables.some((table) => !table.isActive)) return;
  const hasActive = await hasActiveOrders(tx, ids);
  const status = hasActive ? "OCCUPIED" : tables.some((table) => table.status === "OCCUPIED") ? "CLEANING" : tables[0].status;
  await writeGroupStatus(tx, ids, status);
}

async function writeGroupStatus(db: Db, ids: string[], status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING") {
  await db.cafeTable.updateMany({ where: { id: { in: ids }, isActive: true }, data: { status } });
}

export async function listTables() {
  const prisma = getPrismaClient();
  try {
    const rows = await prisma.cafeTable.findMany({
      where: { isActive: true, mergedIntoId: null },
      orderBy: { name: "asc" },
      include: {
        mergedTables: { where: { isActive: true }, orderBy: { name: "asc" } },
        orders: { where: { status: { in: [...ACTIVE_ORDER_STATUSES] } }, orderBy: { createdAt: "asc" }, select: { id: true, orderNumber: true, type: true, status: true, createdAt: true, total: true, _count: { select: { items: true } } } },
      },
    });
    return Promise.all(rows.map(async (root) => {
      const ids = [root.id, ...root.mergedTables.map((member) => member.id)];
      const memberOrders = root.mergedTables.length
        ? await prisma.order.findMany({ where: { tableId: { in: root.mergedTables.map((member) => member.id) }, status: { in: [...ACTIVE_ORDER_STATUSES] } }, orderBy: { createdAt: "asc" }, select: { id: true, orderNumber: true, type: true, status: true, createdAt: true, total: true, _count: { select: { items: true } } } })
        : [];
      const orders = [...root.orders, ...memberOrders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return {
        id: root.id,
        name: root.name,
        capacity: root.capacity + root.mergedTables.reduce((sum, member) => sum + member.capacity, 0),
        status: orders.length ? "OCCUPIED" as const : root.status,
        members: [{ id: root.id, name: root.name, capacity: root.capacity }, ...root.mergedTables.map((member) => ({ id: member.id, name: member.name, capacity: member.capacity }))],
        activeOrderCount: orders.length,
        orders: orders.map((order) => ({ id: order.id, orderNumber: order.orderNumber, type: order.type, status: order.status, createdAt: order.createdAt, total: order.total.toFixed(2), itemCount: order._count.items })),
        groupIds: ids,
      };
    }));
  } catch (error) {
    return safeError(error);
  }
}

export async function saveTable(input: TableInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const name = input.name.trim();
      if (!name || name.length > 40) throw new TableServiceError("Nama meja tidak valid.", "INVALID_REFERENCE");
      const duplicate = await tx.cafeTable.findUnique({ where: { name }, select: { id: true } });
      if (duplicate && duplicate.id !== input.id) throw new TableServiceError("Nama meja sudah digunakan.", "DUPLICATE_NAME");
      if (!input.id) {
        const table = await tx.cafeTable.create({ data: { name, capacity: input.capacity, isActive: input.isActive ?? true } });
        await audit(tx, actorId, "TABLE_CREATED", table.id, { name: table.name, capacity: table.capacity });
        return table;
      }

      const current = await tx.cafeTable.findUnique({ where: { id: input.id }, include: { mergedTables: { select: { id: true } } } });
      if (!current) throw new TableServiceError("Meja tidak ditemukan.", "NOT_FOUND");
      const group = await groupIds(tx, current.mergedIntoId ?? current.id);
      const active = await hasActiveOrders(tx, group);
      if (current.mergedIntoId || current.mergedTables.length || (active && input.isActive === false)) {
        throw new TableServiceError("Meja aktif dalam grup atau pesanan dan tidak dapat diubah dengan aman.", "INVALID_STATE");
      }
      const table = await tx.cafeTable.update({ where: { id: input.id }, data: { name, capacity: input.capacity, ...(input.isActive === undefined ? {} : { isActive: input.isActive }) } });
      await audit(tx, actorId, "TABLE_UPDATED", table.id, { name: table.name, capacity: table.capacity, isActive: table.isActive });
      return table;
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function setTableOperation(input: TableStatusInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const rootId = await getRoot(tx, input.tableId);
      const ids = await groupIds(tx, rootId);
      const tables = await tx.cafeTable.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, isActive: true } });
      if (tables.length !== ids.length || tables.some((table) => !table.isActive)) throw new TableServiceError("Grup meja tidak aktif.", "INVALID_STATE");
      const active = await hasActiveOrders(tx, ids);
      let expected: typeof tables[number]["status"][];
      let next: typeof tables[number]["status"];
      switch (input.operation) {
        case "RESERVE": expected = ["AVAILABLE"]; next = "RESERVED"; break;
        case "RELEASE": expected = ["RESERVED"]; next = "AVAILABLE"; break;
        case "START_CLEANING": expected = ["AVAILABLE", "OCCUPIED"]; next = "CLEANING"; break;
        case "MARK_AVAILABLE": expected = ["CLEANING"]; next = "AVAILABLE"; break;
      }
      if (tables.some((table) => !expected.includes(table.status)) || ((input.operation === "RESERVE" || input.operation === "START_CLEANING" || input.operation === "MARK_AVAILABLE") && active)) {
        throw new TableServiceError("Status meja berubah atau masih memiliki pesanan aktif.", "INVALID_STATE");
      }
      const claimed = await tx.cafeTable.updateMany({ where: { id: { in: ids }, isActive: true, status: { in: expected } }, data: { status: next } });
      if (claimed.count !== ids.length) throw new TableServiceError("Status meja berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      await audit(tx, actorId, `TABLE_${input.operation}`, rootId, { tableIds: ids });
      return { id: rootId, status: next };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function mergeTables(input: MergeTablesInput, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const ids = [input.primaryTableId, ...input.memberTableIds];
      const tables = await tx.cafeTable.findMany({ where: { id: { in: ids }, isActive: true }, include: { mergedTables: { select: { id: true } } } });
      const root = tables.find((table) => table.id === input.primaryTableId);
      const members = input.memberTableIds.map((id) => tables.find((table) => table.id === id));
      if (!root || members.some((table) => !table)) throw new TableServiceError("Pilih meja aktif yang tersedia.", "INVALID_REFERENCE");
      if (root.mergedIntoId || ["RESERVED", "CLEANING"].includes(root.status)) throw new TableServiceError("Meja utama tidak dapat digabungkan.", "INVALID_STATE");
      if (members.some((table) => table!.mergedIntoId || table!.mergedTables.length || ["RESERVED", "CLEANING"].includes(table!.status))) {
        throw new TableServiceError("Pilih meja yang belum tergabung dan tidak sedang dipesan atau dibersihkan.", "INVALID_STATE");
      }
      const occupied = await hasActiveOrders(tx, ids);
      const nextStatus = occupied || tables.some((table) => table.status === "OCCUPIED") ? "OCCUPIED" : "AVAILABLE";
      const claimed = await tx.cafeTable.updateMany({
        where: { id: { in: input.memberTableIds }, isActive: true, mergedIntoId: null, status: { in: ["AVAILABLE", "OCCUPIED"] } },
        data: { mergedIntoId: root.id, status: nextStatus },
      });
      if (claimed.count !== input.memberTableIds.length) throw new TableServiceError("Salah satu meja baru saja berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      const rootClaim = await tx.cafeTable.updateMany({ where: { id: root.id, isActive: true, mergedIntoId: null, status: { in: ["AVAILABLE", "OCCUPIED"] } }, data: { status: nextStatus } });
      if (!rootClaim.count) throw new TableServiceError("Meja utama baru saja berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      await audit(tx, actorId, "TABLES_MERGED", root.id, { tableIds: ids });
      return { id: root.id, memberIds: input.memberTableIds };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function unmergeTable(memberTableId: string, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const member = await tx.cafeTable.findUnique({ where: { id: memberTableId }, select: { id: true, mergedIntoId: true, status: true } });
      if (!member?.mergedIntoId) throw new TableServiceError("Meja bukan anggota grup gabungan.", "INVALID_STATE");
      const ids = await groupIds(tx, member.mergedIntoId);
      const tables = await tx.cafeTable.findMany({ where: { id: { in: ids } }, select: { status: true } });
      if (await hasActiveOrders(tx, ids) || tables.some((table) => table.status === "RESERVED" || table.status === "CLEANING")) {
        throw new TableServiceError("Selesaikan semua pesanan dan layanan meja sebelum memisahkan grup.", "INVALID_STATE");
      }
      const changed = await tx.cafeTable.updateMany({ where: { id: member.id, mergedIntoId: member.mergedIntoId }, data: { mergedIntoId: null, status: "AVAILABLE" } });
      if (!changed.count) throw new TableServiceError("Grup meja baru saja berubah.", "INVALID_STATE");
      const remaining = ids.filter((id) => id !== member.id);
      await writeGroupStatus(tx, remaining, "AVAILABLE");
      await audit(tx, actorId, "TABLE_UNMERGED", member.id, { previousGroupIds: ids, remainingGroupIds: remaining });
      return { id: member.id, status: "AVAILABLE" as const };
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function moveOrderToTable(orderId: string, destinationTableId: string, actorId: string) {
  const prisma = getPrismaClient();
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, type: true, tableId: true, orderNumber: true } });
      if (!order || !order.tableId) throw new TableServiceError("Pesanan makan di tempat tidak ditemukan.", "NOT_FOUND");
      if (order.type !== "DINE_IN" || !ACTIVE_ORDER_STATUSES.includes(order.status as typeof ACTIVE_ORDER_STATUSES[number])) {
        throw new TableServiceError("Hanya pesanan makan di tempat yang belum selesai dapat dipindahkan.", "INVALID_STATE");
      }
      const sourceRoot = await getRoot(tx, order.tableId);
      const destinationRoot = await getRoot(tx, destinationTableId);
      if (sourceRoot === destinationRoot) throw new TableServiceError("Pesanan sudah berada di grup meja tersebut.", "INVALID_STATE");
      const destination = await tx.cafeTable.findUnique({ where: { id: destinationRoot }, select: { id: true, isActive: true, status: true } });
      if (!destination?.isActive || !["AVAILABLE", "OCCUPIED"].includes(destination.status)) throw new TableServiceError("Pilih grup meja aktif yang tersedia.", "INVALID_STATE");
      const destinationIds = await groupIds(tx, destinationRoot);
      const claimedDestination = await tx.cafeTable.updateMany({
        where: { id: { in: destinationIds }, isActive: true, status: { in: ["AVAILABLE", "OCCUPIED"] } },
        data: { status: "OCCUPIED" },
      });
      if (claimedDestination.count !== destinationIds.length) throw new TableServiceError("Meja tujuan baru saja berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      const changed = await tx.order.updateMany({ where: { id: order.id, status: order.status, type: "DINE_IN" }, data: { tableId: destinationRoot } });
      if (!changed.count) throw new TableServiceError("Status pesanan berubah. Muat ulang lalu coba lagi.", "INVALID_STATE");
      const sourceIds = await groupIds(tx, sourceRoot);
      if (await hasActiveOrders(tx, sourceIds)) await writeGroupStatus(tx, sourceIds, "OCCUPIED");
      else await writeGroupStatus(tx, sourceIds, "CLEANING");
      await audit(tx, actorId, "ORDER_TABLE_MOVED", order.id, { orderNumber: order.orderNumber, fromTableId: order.tableId, toTableId: destinationRoot });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { id: true, tableId: true, status: true } });
    });
  } catch (error) {
    return safeError(error);
  }
}
