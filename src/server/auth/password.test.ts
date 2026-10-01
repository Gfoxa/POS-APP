import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("stores a verifiable hash instead of the submitted password", async () => {
    const password = "LocalCafeDemo!42";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("incorrect", passwordHash)).toBe(false);
  });
});
