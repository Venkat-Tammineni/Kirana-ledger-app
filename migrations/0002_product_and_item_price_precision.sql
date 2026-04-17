ALTER TABLE "products"
ALTER COLUMN "price" TYPE numeric(10, 3);

ALTER TABLE "products"
ALTER COLUMN "cost_price" TYPE numeric(10, 3);

ALTER TABLE "bill_items"
ALTER COLUMN "price" TYPE numeric(10, 3);

ALTER TABLE "bill_items"
ALTER COLUMN "cost_price" TYPE numeric(10, 3);

ALTER TABLE "quotation_items"
ALTER COLUMN "price" TYPE numeric(10, 3);

ALTER TABLE "quotation_items"
ALTER COLUMN "cost_price" TYPE numeric(10, 3);
