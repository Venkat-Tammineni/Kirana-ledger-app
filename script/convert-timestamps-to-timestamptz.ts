import "dotenv/config";
import { pool } from "../server/db";

const timestampColumns = [
  { table: "customers", column: "created_at" },
  { table: "bills", column: "date" },
  { table: "bills", column: "last_edited_at" },
  { table: "quotations", column: "date" },
  { table: "quotations", column: "last_edited_at" },
  { table: "payments", column: "date" },
  { table: "customer_profit_adjustments", column: "created_at" },
  { table: "ledger_entries", column: "created_at" },
  { table: "stock_adjustments", column: "date" },
  { table: "accounts", column: "created_at" },
  { table: "staff", column: "created_at" },
  { table: "staff_attendance", column: "date" },
  { table: "staff_attendance", column: "created_at" },
  { table: "account_transactions", column: "date" },
  { table: "investment_entries", column: "date" },
] as const;

async function convertTimestampColumns() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const { table, column } of timestampColumns) {
      const result = await client.query<{
        data_type: string;
      }>(
        `
          SELECT data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        `,
        [table, column],
      );

      const dataType = result.rows[0]?.data_type;
      if (!dataType) {
        throw new Error(`Column public.${table}.${column} not found`);
      }

      if (dataType === "timestamp with time zone") {
        continue;
      }

      if (dataType !== "timestamp without time zone") {
        throw new Error(`Unsupported type for public.${table}.${column}: ${dataType}`);
      }

      await client.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE timestamp with time zone USING "${column}" AT TIME ZONE 'UTC'`,
      );
    }

    await client.query("COMMIT");
    console.log("Timestamp columns converted to timestamptz");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

convertTimestampColumns()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Timestamp conversion failed", error);
    await pool.end();
    process.exit(1);
  });
