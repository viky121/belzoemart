-- AlterTable
ALTER TABLE "products" ADD COLUMN     "seoKeywords" TEXT;
ALTER TABLE "products" ADD COLUMN     "shgName" TEXT;
ALTER TABLE "products" ADD COLUMN     "story" TEXT;
ALTER TABLE "products" ADD COLUMN     "attributesJson" JSONB NOT NULL DEFAULT '{}';
