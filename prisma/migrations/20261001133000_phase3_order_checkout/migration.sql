ALTER TABLE "Order" ADD COLUMN "discountName" TEXT;

ALTER TABLE "Payment"
ADD COLUMN "tenderedAmount" DECIMAL(14,2),
ADD COLUMN "changeAmount" DECIMAL(14,2);
