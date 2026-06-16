CREATE TABLE IF NOT EXISTS "investment_entry_purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "investment_entry_id" integer NOT NULL REFERENCES "investment_entries"("id"),
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "quantity" integer NOT NULL,
  "cost_price" numeric(10, 3),
  "previous_cost_price" numeric(10, 3),
  "created_at" timestamp with time zone DEFAULT now()
);
