-- MRP of each unit at the time of the order, for the invoice ("Gross sales value", "You have saved").
ALTER TABLE "order_items" ADD COLUMN "mrp" INTEGER;
