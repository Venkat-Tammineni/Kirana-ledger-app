CREATE SEQUENCE IF NOT EXISTS bill_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE bills
ADD COLUMN IF NOT EXISTS bill_number integer;

WITH ordered_bills AS (
  SELECT id
  FROM bills
  WHERE bill_number IS NULL
  ORDER BY id
)
UPDATE bills
SET bill_number = nextval('bill_number_seq')
WHERE id IN (SELECT id FROM ordered_bills);

SELECT setval(
  'bill_number_seq',
  GREATEST((SELECT COALESCE(MAX(bill_number), 0) FROM bills), 1),
  true
);

ALTER TABLE bills
ALTER COLUMN bill_number SET DEFAULT nextval('bill_number_seq');

ALTER TABLE bills
ALTER COLUMN bill_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bills_bill_number_unique_idx
ON bills (bill_number);
