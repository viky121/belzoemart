-- AlterTable
ALTER TABLE "variants" ADD COLUMN     "priceSlabsJson" JSONB NOT NULL DEFAULT '[]';
