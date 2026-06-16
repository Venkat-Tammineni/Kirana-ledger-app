CREATE TABLE IF NOT EXISTS "staff_salary_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "staff_id" integer NOT NULL REFERENCES "staff"("id"),
  "range_start" timestamp with time zone NOT NULL,
  "range_end" timestamp with time zone NOT NULL,
  "amount" numeric(10, 2) NOT NULL DEFAULT '0',
  "note" text,
  "created_at" timestamp with time zone DEFAULT now()
);
