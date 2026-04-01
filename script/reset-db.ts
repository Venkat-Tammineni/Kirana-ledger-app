import "dotenv/config";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function resetDb() {
  await db.execute(
    sql`TRUNCATE TABLE
      stock_adjustments,
      ledger_entries,
      customer_profit_adjustments,
      payments,
      quotation_charges,
      quotation_items,
      quotations,
      bill_charges,
      bill_items,
      bills,
      staff_attendance,
      account_transactions,
      investment_entries,
      staff,
      accounts,
      products,
      customers
      RESTART IDENTITY CASCADE`,
  );
}

resetDb()
  .then(async () => {
    await pool.end();
    console.log("Database reset complete");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Database reset failed", error);
    await pool.end();
    process.exit(1);
  });
