import "dotenv/config";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { getPrismaClient } from "@/lib/db/prisma";
import { cafeSettingsInputSchema } from "@/server/settings/validation";
import { saveCafeSettings } from "./settings";

const integrationDescribe = process.env.PHASE6_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integrationDescribe("cafe settings", () => {
  it("saves validated tax and service rates transactionally and restores defaults", async () => {
    const prisma = getPrismaClient();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@cafe.local" }, select: { id: true } });
    const keys = ["name", "address", "phone", "taxRateBasisPoints", "serviceChargeRateBasisPoints"];
    const before = await prisma.cafeSetting.findMany({ where: { key: { in: keys } } });
    const beforeAuditIds = (await prisma.auditLog.findMany({ where: { entity: "CafeSetting", entityId: "cafe" }, select: { id: true } })).map((row) => row.id);
    try {
      const saved = await saveCafeSettings(cafeSettingsInputSchema.parse({ name: "Sore Baru", address: "Jalan Kopi", phone: "0812345678", taxRate: "10.5", serviceChargeRate: "2" }), owner.id);
      expect(saved).toMatchObject({ name: "Sore Baru", address: "Jalan Kopi", phone: "0812345678", taxRateBasisPoints: 1050, serviceChargeRateBasisPoints: 200 });
      expect(await prisma.auditLog.count({ where: { entity: "CafeSetting", entityId: "cafe", action: "CAFE_SETTINGS_UPDATED" } })).toBeGreaterThan(0);
    } finally {
      await prisma.$transaction(async (tx) => {
        await tx.cafeSetting.deleteMany({ where: { key: { in: keys } } });
        if (before.length) await tx.cafeSetting.createMany({ data: before.map(({ key, value, updatedById }) => ({ key, value, updatedById })) });
        await tx.auditLog.deleteMany({ where: { entity: "CafeSetting", entityId: "cafe", id: { notIn: beforeAuditIds } } });
      });
      await prisma.$disconnect();
    }
  });
});
