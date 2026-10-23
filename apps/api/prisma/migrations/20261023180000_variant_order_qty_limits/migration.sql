-- Per-variant purchase limits: the fewest / most units a customer can buy in one order.
-- NULL keeps the old behaviour (min 1, max 99), so existing rows are untouched.
ALTER TABLE "variants" ADD COLUMN "minOrderQty" INTEGER;
ALTER TABLE "variants" ADD COLUMN "maxOrderQty" INTEGER;
