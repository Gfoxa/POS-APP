import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "./password";
import { authenticateCredentials, type CredentialUser } from "./credentials";

describe("credential authentication", () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword("LocalCafeDemo!42");
  });

  const findUser = (user: CredentialUser | null) => async () => user;

  it("returns only safe identity fields for a valid active user", async () => {
    const user: CredentialUser = { id: "user-1", name: "Owner", email: "owner@example.test", isActive: true, role: { name: "OWNER" }, passwordHash };
    await expect(authenticateCredentials({ email: user.email, password: "LocalCafeDemo!42" }, findUser(user)))
      .resolves.toEqual({ id: user.id, name: user.name, email: user.email, role: "OWNER" });
  });

  it("returns null for incorrect, unknown, and inactive accounts", async () => {
    const user: CredentialUser = { id: "user-1", name: "Owner", email: "owner@example.test", isActive: true, role: { name: "OWNER" }, passwordHash };
    await expect(authenticateCredentials({ email: user.email, password: "wrong-password" }, findUser(user))).resolves.toBeNull();
    await expect(authenticateCredentials({ email: user.email, password: "LocalCafeDemo!42" }, findUser(null))).resolves.toBeNull();
    await expect(authenticateCredentials({ email: user.email, password: "LocalCafeDemo!42" }, findUser({ ...user, isActive: false }))).resolves.toBeNull();
  });

  it("rejects malformed credentials before looking up an account", async () => {
    let lookedUp = false;
    const lookup = async () => { lookedUp = true; return null; };
    await expect(authenticateCredentials({ email: "bad", password: "x" }, lookup)).resolves.toBeNull();
    expect(lookedUp).toBe(false);
  });
});
