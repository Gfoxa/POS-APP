ALTER TABLE "Payment" ADD COLUMN "cashSessionId" UUID;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Payment_cashSessionId_paidAt_idx" ON "Payment"("cashSessionId", "paidAt");
