ALTER TABLE customer_profit_adjustments
ADD COLUMN IF NOT EXISTS profit_date TIMESTAMPTZ;
