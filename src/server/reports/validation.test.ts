import { describe, expect, it } from "vitest";
import { reportRangeSchema } from "./validation";

describe("report range validation", () => {
  it("accepts presets and ordered custom Jakarta date ranges", () => {
    expect(reportRangeSchema.safeParse({ range: "THIS_MONTH" }).success).toBe(true);
    expect(reportRangeSchema.safeParse({ range: "YESTERDAY", from: "", to: "" }).success).toBe(true);
    expect(reportRangeSchema.safeParse({ range: "THIS_WEEK", from: "", to: "" }).success).toBe(true);
    expect(reportRangeSchema.safeParse({ range: "CUSTOM", from: "2026-10-01", to: "2026-10-10" }).success).toBe(true);
    expect(reportRangeSchema.safeParse({ range: "CUSTOM", from: "2026-10-10", to: "2026-10-01" }).success).toBe(false);
    expect(reportRangeSchema.safeParse({ range: "CUSTOM", from: "bad", to: "2026-10-01" }).success).toBe(false);
  });
});
