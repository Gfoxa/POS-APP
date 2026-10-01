ALTER TABLE "CafeTable"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "mergedIntoId" UUID;

CREATE INDEX "CafeTable_isActive_status_idx" ON "CafeTable"("isActive", "status");
CREATE INDEX "CafeTable_mergedIntoId_idx" ON "CafeTable"("mergedIntoId");

ALTER TABLE "CafeTable"
ADD CONSTRAINT "CafeTable_mergedIntoId_fkey"
FOREIGN KEY ("mergedIntoId") REFERENCES "CafeTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
