-- Cost of one unit when the order was placed (paise). Null for orders placed before this column
-- existed; the P/L report then uses the variant cost price of today and marks it as estimated.
ALTER TABLE "order_items" ADD COLUMN "costPrice" INTEGER;
