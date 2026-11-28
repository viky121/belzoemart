-- Staff can mark an order as a test / dummy order. The order and its invoice are kept; it is only left out of reports.
ALTER TABLE "orders" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "orders_isTest_idx" ON "orders"("isTest");
