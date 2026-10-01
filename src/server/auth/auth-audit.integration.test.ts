import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { authOptions } from "@/lib/auth/config";
import { getPrismaClient } from "@/lib/db/prisma";

const integrationDescribe = process.env.PHASE6_INTEGRATION_TESTS === "true" ? describe : describe.skip;

type SignInEvent = Parameters<NonNullable<NonNullable<typeof authOptions.events>["signIn"]>>[0];
type SignOutEvent = Parameters<NonNullable<NonNullable<typeof authOptions.events>["signOut"]>>[0];

integrationDescribe("authentication audit events", () => {
  it("records successful sign-in and sign-out without secrets", async () => {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true, name: true, email: true } });
    try {
      const signIn = authOptions.events?.signIn;
      const signOut = authOptions.events?.signOut;
      if (!signIn || !signOut) throw new Error("Auth audit callbacks are not configured.");
      await signIn({ user, account: null, profile: undefined, isNewUser: false } as unknown as SignInEvent);
      await signOut({ token: { sub: user.id } } as SignOutEvent);
      const records = await prisma.auditLog.findMany({ where: { userId: user.id, entity: "User", entityId: user.id, action: { in: ["LOGIN", "LOGOUT"] } }, orderBy: { createdAt: "desc" }, take: 2 });
      expect(records.map((record) => record.action).sort()).toEqual(["LOGIN", "LOGOUT"]);
      expect(records.every((record) => record.metadata === null)).toBe(true);
    } finally {
      await prisma.auditLog.deleteMany({ where: { userId: user.id, entityId: user.id, action: { in: ["LOGIN", "LOGOUT"] } } });
      await prisma.$disconnect();
    }
  });
});
