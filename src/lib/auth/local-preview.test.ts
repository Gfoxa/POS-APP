import { describe, expect, it } from "vitest";
import { isLocalPreviewEnabled } from "./local-preview";

describe("local preview mode", () => {
  it("enables preview only when explicitly selected outside production", () => {
    expect(isLocalPreviewEnabled("development", "true")).toBe(true);
    expect(isLocalPreviewEnabled("test", "true")).toBe(true);
    expect(isLocalPreviewEnabled("production", "true")).toBe(false);
    expect(isLocalPreviewEnabled("development", "false")).toBe(false);
    expect(isLocalPreviewEnabled("development", undefined)).toBe(false);
  });
});
