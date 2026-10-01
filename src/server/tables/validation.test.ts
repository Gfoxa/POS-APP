import { describe, expect, it } from "vitest";
import { mergeTablesInputSchema, splitDraftInputSchema, tableInputSchema, tableStatusInputSchema } from "./validation";

const tableA = "550e8400-e29b-41d4-a716-446655440000";
const tableB = "550e8400-e29b-41d4-a716-446655440001";
const orderItemA = "550e8400-e29b-41d4-a716-446655440002";

describe("table input validation", () => {
  it("trims table names and accepts capacities within the configured range", () => {
    const parsed = tableInputSchema.safeParse({ name: "  Patio  ", capacity: 6 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Patio");
  });

  it("rejects invalid capacities and empty names", () => {
    expect(tableInputSchema.safeParse({ name: " ", capacity: 2 }).success).toBe(false);
    expect(tableInputSchema.safeParse({ name: "Patio", capacity: 0 }).success).toBe(false);
    expect(tableInputSchema.safeParse({ name: "Patio", capacity: 31 }).success).toBe(false);
    expect(tableInputSchema.safeParse({ name: "Patio", capacity: 1.5 }).success).toBe(false);
  });

  it("rejects merging the primary table into itself or repeating a member", () => {
    expect(mergeTablesInputSchema.safeParse({ primaryTableId: tableA, memberTableIds: [tableA] }).success).toBe(false);
    expect(mergeTablesInputSchema.safeParse({ primaryTableId: tableA, memberTableIds: [tableB, tableB] }).success).toBe(false);
  });

  it("requires unique positive whole item quantities when splitting a draft", () => {
    expect(splitDraftInputSchema.safeParse({ orderId: tableA, lines: [{ orderItemId: orderItemA, quantity: 2 }] }).success).toBe(true);
    expect(splitDraftInputSchema.safeParse({ orderId: tableA, lines: [{ orderItemId: orderItemA, quantity: 1.5 }] }).success).toBe(false);
    expect(splitDraftInputSchema.safeParse({ orderId: tableA, lines: [{ orderItemId: orderItemA, quantity: 0 }] }).success).toBe(false);
    expect(splitDraftInputSchema.safeParse({ orderId: tableA, lines: [{ orderItemId: orderItemA, quantity: 1 }, { orderItemId: orderItemA, quantity: 1 }] }).success).toBe(false);
  });

  it("accepts only the supported table status operations", () => {
    expect(tableStatusInputSchema.safeParse({ tableId: tableA, operation: "RESERVE" }).success).toBe(true);
    expect(tableStatusInputSchema.safeParse({ tableId: tableA, operation: "OCCUPIED" }).success).toBe(false);
  });
});
