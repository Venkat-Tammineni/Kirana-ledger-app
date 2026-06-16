WITH resequenced AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY id) AS next_bill_number
  FROM bills
)
UPDATE bills
SET bill_number = resequenced.next_bill_number
FROM resequenced
WHERE bills.id = resequenced.id;

SELECT setval(
  'bill_number_seq',
  COALESCE((SELECT MAX(bill_number) FROM bills), 1),
  true
);
