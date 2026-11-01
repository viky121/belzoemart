-- Self pickup: the customer collects the order from the shop. Only adds an enum and three columns;
-- every existing order stays "delivery".
CREATE TYPE "FulfilmentMethod" AS ENUM ('delivery', 'pickup');

ALTER TABLE "orders" ADD COLUMN "fulfilment" "FulfilmentMethod" NOT NULL DEFAULT 'delivery';
ALTER TABLE "orders" ADD COLUMN "pickupSlotStart" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "pickupSlotEnd" TIMESTAMP(3);
