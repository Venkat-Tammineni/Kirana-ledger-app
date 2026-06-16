ALTER TABLE investment_entry_purchases
  ALTER COLUMN quantity TYPE double precision USING quantity::double precision;

ALTER TABLE account_transaction_purchases
  ALTER COLUMN quantity TYPE double precision USING quantity::double precision;
