-- Purchase (cost) price per variant, paise. Admin-only; nullable, no default.
ALTER TABLE "variants" ADD COLUMN "costPrice" INTEGER;
-- Parent SKU used by the bulk Excel sheet. Nullable; Postgres UNIQUE allows many NULLs.
ALTER TABLE "products" ADD COLUMN "sku" TEXT;
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
