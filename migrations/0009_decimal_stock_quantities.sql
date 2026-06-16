ALTER TABLE products
  ALTER COLUMN stock TYPE numeric(12, 3) USING stock::numeric(12, 3),
  ALTER COLUMN low_stock_threshold TYPE numeric(12, 3) USING low_stock_threshold::numeric(12, 3);

ALTER TABLE stock_adjustments
  ALTER COLUMN quantity TYPE double precision USING quantity::double precision;

ALTER TABLE bill_items
  ALTER COLUMN base_quantity TYPE double precision USING base_quantity::double precision;

ALTER TABLE quotation_items
  ALTER COLUMN base_quantity TYPE double precision USING base_quantity::double precision;
