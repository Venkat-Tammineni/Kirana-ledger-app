CREATE TABLE IF NOT EXISTS "account_transaction_purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_transaction_id" integer NOT NULL REFERENCES "account_transactions"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "quantity" integer NOT NULL,
  "cost_price" numeric(10, 3),
  "previous_cost_price" numeric(10, 3),
  "created_at" timestamp with time zone DEFAULT now()
);
