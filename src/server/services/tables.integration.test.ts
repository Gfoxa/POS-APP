import "dotenv/config";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db/prisma";
import { mergeTables, listTables, moveOrderToTable, saveTable, setTableOperation, unmergeTable } from "@/server/services/tables";

const integrationDescribe = process.env.TABLE_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("table services against PostgreSQL", () => {
  const prisma = getPrismaClient();
  const createdTables: string[] = [];
  const createdOrders: string[] = [];
  let ownerId = "";

  beforeAll(async () => {
    const owner = await prisma.user.findUnique({ where: { email: "owner@cafe.local" }, select: { id: true } });
    if (!owner) throw new Error("Run the local database seed before table integration tests.");
    ownerId = owner.id;
  });

  async function newTable(name: string, capacity = 2) {
    const table = await saveTable({ name, capacity }, ownerId);
    createdTables.push(table.id);
    return table;
  }

  async function createOrder(tableId: string, status: "DRAFT" | "COMPLETED" = "DRAFT") {
    const order = await prisma.order.create({ data: {
      orderNumber: `PH4-${crypto.randomUUID().slice(0, 12)}`,
      type: "DINE_IN", status, cashierId: ownerId, tableId,
    } });
    createdOrders.push(order.id);
    return order;
  }

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrders } } });
    if (createdTables.length) {
      await prisma.cafeTable.updateMany({ where: { id: { in: createdTables } }, data: { mergedIntoId: null } });
      await prisma.cafeTable.deleteMany({ where: { id: { in: createdTables } } });
    }
    await prisma.$disconnect();
  });

  it("creates and edits a table while rejecting a duplicate name", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const table = await newTable(`Test ${suffix}`, 2);
    const edited = await saveTable({ id: table.id, name: `  Edited ${suffix}  `, capacity: 6 }, ownerId);
    expect(edited.name).toBe(`Edited ${suffix}`);
    expect(edited.capacity).toBe(6);
    await expect(saveTable({ name: edited.name, capacity: 4 }, ownerId)).rejects.toMatchObject({ code: "DUPLICATE_NAME" });
  });

  it("enforces reserve, release, cleaning, and availability operations", async () => {
    const table = await newTable(`State ${crypto.randomUUID().slice(0, 8)}`);
    await setTableOperation({ tableId: table.id, operation: "RESERVE" }, ownerId);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("RESERVED");
    await expect(setTableOperation({ tableId: table.id, operation: "RESERVE" }, ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await setTableOperation({ tableId: table.id, operation: "RELEASE" }, ownerId);
    await setTableOperation({ tableId: table.id, operation: "START_CLEANING" }, ownerId);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("CLEANING");
    await setTableOperation({ tableId: table.id, operation: "MARK_AVAILABLE" }, ownerId);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("AVAILABLE");
  });

  it("merges table capacities and unmerges a member only when the group is clear", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const primary = await newTable(`Primary ${suffix}`, 2);
    const member = await newTable(`Member ${suffix}`, 4);
    const another = await newTable(`Another ${suffix}`, 6);
    await mergeTables({ primaryTableId: primary.id, memberTableIds: [member.id, another.id] }, ownerId);
    const group = await listTables();
    const merged = group.find((entry) => entry.id === primary.id);
    expect(merged?.capacity).toBe(12);
    expect(merged?.members.map((entry) => entry.id)).toEqual(expect.arrayContaining([member.id, another.id]));
    await unmergeTable(member.id, ownerId);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: member.id } })).mergedIntoId).toBeNull();
    const activeOrder = await createOrder(primary.id);
    await expect(unmergeTable(another.id, ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await prisma.order.delete({ where: { id: activeOrder.id } });
    createdOrders.pop();
  });

  it("moves an active dine-in order and cleans the source group when empty", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const source = await newTable(`Source ${suffix}`);
    const destination = await newTable(`Destination ${suffix}`);
    const order = await createOrder(source.id);
    await prisma.cafeTable.update({ where: { id: source.id }, data: { status: "OCCUPIED" } });
    const moved = await moveOrderToTable(order.id, destination.id, ownerId);
    expect(moved.tableId).toBe(destination.id);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: source.id } })).status).toBe("CLEANING");
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: destination.id } })).status).toBe("OCCUPIED");
    const completed = await createOrder(source.id, "COMPLETED");
    await expect(moveOrderToTable(completed.id, destination.id, ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("does not overwrite a destination reservation when moving an order", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const source = await newTable(`Move source ${suffix}`);
    const destination = await newTable(`Reserved destination ${suffix}`);
    const order = await createOrder(source.id);
    await setTableOperation({ tableId: destination.id, operation: "RESERVE" }, ownerId);
    await expect(moveOrderToTable(order.id, destination.id, ownerId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).tableId).toBe(source.id);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: destination.id } })).status).toBe("RESERVED");
  });

  it("allows only one concurrent reservation of an available table", async () => {
    const table = await newTable(`Race ${crypto.randomUUID().slice(0, 8)}`);
    const results = await Promise.allSettled([
      setTableOperation({ tableId: table.id, operation: "RESERVE" }, ownerId),
      setTableOperation({ tableId: table.id, operation: "RESERVE" }, ownerId),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await prisma.cafeTable.findUniqueOrThrow({ where: { id: table.id } })).status).toBe("RESERVED");
  });
});
