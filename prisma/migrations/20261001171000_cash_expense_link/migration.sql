ALTER TABLE "Expense" ADD COLUMN "cashSessionId" UUID;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Expense_cashSessionId_createdAt_idx" ON "Expense"("cashSessionId", "createdAt");
