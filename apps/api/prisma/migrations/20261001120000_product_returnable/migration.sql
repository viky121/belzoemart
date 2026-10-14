-- AlterTable: products can be flagged non-returnable (e.g. food items).
ALTER TABLE "products" ADD COLUMN "isReturnable" BOOLEAN NOT NULL DEFAULT true;
