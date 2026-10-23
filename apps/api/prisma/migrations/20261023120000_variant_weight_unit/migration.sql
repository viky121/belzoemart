-- Variant weight / pack size as the admin entered it (value + unit: kg, gm, count, pc, litre, ml).
-- weightGrams stays the courier weight; both columns are optional so existing rows are untouched.
ALTER TABLE "variants" ADD COLUMN "weightValue" DOUBLE PRECISION;
ALTER TABLE "variants" ADD COLUMN "weightUnit" TEXT;
