-- Spend and get special price offers, and a mark on order items sold through one.
ALTER TABLE "order_items" ADD COLUMN "offerId" TEXT;
ALTER TABLE "order_items" ADD COLUMN "offerName" TEXT;
CREATE INDEX "order_items_offerId_idx" ON "order_items"("offerId");

CREATE TABLE "spend_offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "minSpend" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "specialPrice" INTEGER NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spend_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spend_offers_variantId_idx" ON "spend_offers"("variantId");
CREATE INDEX "spend_offers_isActive_idx" ON "spend_offers"("isActive");

ALTER TABLE "spend_offers" ADD CONSTRAINT "spend_offers_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
