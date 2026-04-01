import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { products, stockAdjustments } from "@shared/schema";

type AppDb = NodePgDatabase<any>;
type AdjustmentType = "purchase" | "sale" | "adjustment" | "damage" | "return";

export async function adjustStockTransaction(
  db: AppDb,
  productId: number,
  quantity: number,
  type: AdjustmentType,
  reason?: string,
  billId?: number,
) {
  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId));
    if (!product) {
      throw new Error("Product not found");
    }

    const currentStock = product.stock || 0;
    const newStock = Math.max(0, currentStock + quantity);

    await tx.update(products).set({ stock: newStock }).where(eq(products.id, productId));

    const [adjustment] = await tx
      .insert(stockAdjustments)
      .values({
        productId,
        quantity,
        type,
        reason: reason || undefined,
        billId: billId || undefined,
      })
      .returning();

    return adjustment;
  });
}

export async function bulkAdjustStock(
  db: AppDb,
  items: Array<{ productId: number; quantity: number; type: AdjustmentType; reason?: string }>,
) {
  const results = [];
  for (const item of items) {
    const adjustment = await adjustStockTransaction(
      db,
      item.productId,
      item.quantity,
      item.type,
      item.reason,
    );
    results.push(adjustment);
  }
  return results;
}

export async function recurringPurchase(
  db: AppDb,
  items: Array<{ productId: number; quantity: number; costPrice?: number }>,
  note?: string,
) {
  const results = [];
  for (const item of items) {
    if (item.costPrice !== undefined) {
      await db
        .update(products)
        .set({ costPrice: item.costPrice.toString() })
        .where(eq(products.id, item.productId));
    }

    const adjustment = await adjustStockTransaction(
      db,
      item.productId,
      item.quantity,
      "purchase",
      note || "Recurring purchase entry",
    );
    results.push(adjustment);
  }
  return results;
}
