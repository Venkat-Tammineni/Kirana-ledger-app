ALTER TABLE "bill_items"
ALTER COLUMN "quantity" TYPE double precision
USING "quantity"::double precision;

ALTER TABLE "quotation_items"
ALTER COLUMN "quantity" TYPE double precision
USING "quantity"::double precision;
