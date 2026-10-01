import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { reportRangeSchema } from "./validation";
import { resolveReportWindow } from "@/server/services/reports";

describe("Jakarta report windows", () => {
  it("uses Jakarta midnight and Monday as the week start", () => {
    const range = reportRangeSchema.parse({ range: "THIS_WEEK" });
    const window = resolveReportWindow(range, new Date("2026-10-04T16:30:00.000Z"));
    expect(window.from).toBe("2026-09-28");
    expect(window.to).toBe("2026-10-04");
    expect(window.start.toISOString()).toBe("2026-09-27T17:00:00.000Z");
    expect(window.endExclusive.toISOString()).toBe("2026-10-04T17:00:00.000Z");
  });
});
