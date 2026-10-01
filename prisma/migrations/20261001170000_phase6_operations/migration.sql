ALTER TABLE "Customer" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Customer_isActive_name_idx" ON "Customer"("isActive", "name");

CREATE TABLE "CafeSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedById" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CafeSetting_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "CafeSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashSession_one_open_per_cashier_idx" ON "CashSession"("cashierId") WHERE "closedAt" IS NULL;
