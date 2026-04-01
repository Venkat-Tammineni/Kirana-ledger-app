import { and, eq, sum, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  bills,
  billCharges,
  billItems,
  customers,
  ledgerEntries,
  payments,
  products,
  stockAdjustments,
  type CreateBillRequest,
  type UpdateBillRequest,
} from "@shared/schema";
import { getBaseUnit, getDefaultSalesUnit, toBaseQuantity } from "@shared/units";

type AppDb = NodePgDatabase<any>;

function isMissingLedgerTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42P01" &&
    candidate.message?.includes('relation "ledger_entries" does not exist') === true
  );
}

async function getCustomerOutstandingBalance(tx: AppDb, customerId: number) {
  const [billSum] = await tx
    .select({ value: sum(bills.totalAmount) })
    .from(bills)
    .where(and(eq(bills.customerId, customerId), eq(bills.status, "completed")));

  const [paymentSum] = await tx
    .select({ value: sum(payments.amount) })
    .from(payments)
    .where(eq(payments.customerId, customerId));

  let manualCreditTotal = 0;
  try {
    const [creditSum] = await tx
      .select({ value: sum(ledgerEntries.amount) })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.customerId, customerId),
          eq(ledgerEntries.type, "CREDIT"),
          sql`${ledgerEntries.billId} IS NULL`,
        ),
      );
    manualCreditTotal = Number(creditSum?.value || 0);
  } catch (error) {
    if (!isMissingLedgerTableError(error)) throw error;
  }

  return Number(billSum?.value || 0) + manualCreditTotal - Number(paymentSum?.value || 0);
}

function getOldBalancePaymentNote(billId: number) {
  return `Old balance payment during bill #${billId}`;
}

type PreparedBillMutation = {
  customerId: number | undefined;
  billDate: Date;
  subtotalAmount: number;
  extraChargesTotal: number;
  totalAmount: number;
  oldBalanceAmount: number;
  billPaidAmount: number;
  oldBalancePaidAmount: number;
  grandTotal: number;
  totalProfit: number;
  normalizedCharges: Array<{ label: string; amount: number }>;
  billItemsData: Array<{
    productId: number | null;
    name: string;
    quantity: number;
    unit: string;
    baseQuantity: number;
    baseUnit: string;
    price: string;
    costPrice: string;
    subtotal: string;
  }>;
};

async function prepareBillMutation(
  tx: AppDb,
  data: CreateBillRequest | UpdateBillRequest,
  options?: {
    allowCreateCustomer?: boolean;
    oldBalanceAmount?: number;
  },
): Promise<PreparedBillMutation> {
  let customerId = data.customerId;

  if (!customerId && options?.allowCreateCustomer && "customerName" in data && data.customerName) {
    const [newCustomer] = await tx
      .insert(customers)
      .values({
        name: data.customerName,
        phone: data.customerPhone || "",
      })
      .returning();
    customerId = newCustomer.id;
  }

  const subtotalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const normalizedCharges = (data.extraCharges || [])
    .map((charge) => ({
      label: charge.label.trim(),
      amount: Number(charge.amount || 0),
    }))
    .filter((charge) => charge.label.length > 0 && charge.amount >= 0);
  const extraChargesTotal = normalizedCharges.reduce((sum, charge) => sum + charge.amount, 0);
  const totalAmount = subtotalAmount + extraChargesTotal;
  const oldBalanceAmount =
    options?.oldBalanceAmount !== undefined
      ? Math.max(0, options.oldBalanceAmount)
      : customerId
        ? Math.max(0, await getCustomerOutstandingBalance(tx, customerId))
        : 0;
  const grandTotal = totalAmount + oldBalanceAmount;
  const paymentApplied = Math.min(Math.max(data.paidAmount || 0, 0), grandTotal);
  const billPaidAmount = Math.min(paymentApplied, totalAmount);
  const oldBalancePaidAmount = Math.max(paymentApplied - billPaidAmount, 0);
  const billDate = data.date ? new Date(data.date) : new Date();

  let totalProfit = 0;
  const billItemsData: PreparedBillMutation["billItemsData"] = [];

  for (const item of data.items) {
    let productId = item.productId || null;
    let costPrice = item.costPrice ?? 0;
    let primaryUnit = "PCS";
    let secondaryUnit: string | null = null;
    let unitConversion: number | null = null;

    if (productId) {
      const [product] = await tx.select().from(products).where(eq(products.id, productId));
      if (product && costPrice === 0) {
        costPrice = Number(product.costPrice || 0);
      }
      if (product) {
        primaryUnit = product.primaryUnit || "PCS";
        secondaryUnit = product.secondaryUnit ?? null;
        unitConversion = product.unitConversion ?? null;
      }
    } else {
      const [existing] = await tx.select().from(products).where(eq(products.name, item.name));
      if (existing) {
        productId = existing.id;
        if (costPrice === 0) {
          costPrice = Number(existing.costPrice || 0);
        }
        primaryUnit = existing.primaryUnit || "PCS";
        secondaryUnit = existing.secondaryUnit ?? null;
        unitConversion = existing.unitConversion ?? null;
      } else {
        primaryUnit = item.unit || "PCS";
        const [newProduct] = await tx
          .insert(products)
          .values({
            name: item.name,
            price: item.price.toString(),
            costPrice: costPrice.toString(),
            primaryUnit,
            secondaryUnit: null,
            unitConversion: null,
            stock: 0,
          })
          .returning();
        productId = newProduct.id;
      }
    }

    const unitContext = {
      primaryUnit,
      secondaryUnit,
      unitConversion,
    };
    const selectedUnit = item.unit || getDefaultSalesUnit(unitContext);
    const baseUnit = item.baseUnit || getBaseUnit(unitContext);
    const baseQuantity = item.baseQuantity || toBaseQuantity(item.quantity, unitContext, selectedUnit);

    totalProfit += (item.price - costPrice) * item.quantity;
    billItemsData.push({
      productId,
      name: item.name,
      quantity: item.quantity,
      unit: selectedUnit,
      baseQuantity,
      baseUnit,
      price: item.price.toString(),
      costPrice: costPrice.toString(),
      subtotal: (item.quantity * item.price).toFixed(2),
    });
  }

  return {
    customerId,
    billDate,
    subtotalAmount,
    extraChargesTotal,
    totalAmount,
    oldBalanceAmount,
    billPaidAmount,
    oldBalancePaidAmount,
    grandTotal,
    totalProfit,
    normalizedCharges,
    billItemsData,
  };
}

async function applyBillArtifacts(
  tx: AppDb,
  billId: number,
  payload: PreparedBillMutation,
) {
  for (const itemData of payload.billItemsData) {
    await tx.insert(billItems).values({
      billId,
      productId: itemData.productId,
      name: itemData.name,
      quantity: itemData.quantity,
      unit: itemData.unit,
      baseQuantity: itemData.baseQuantity,
      baseUnit: itemData.baseUnit,
      price: itemData.price,
      costPrice: itemData.costPrice,
      subtotal: itemData.subtotal,
    });

    if (itemData.productId) {
      const [product] = await tx.select().from(products).where(eq(products.id, itemData.productId));
      if (product) {
        const currentStock = product.stock || 0;
        const newStock = Math.max(0, currentStock - itemData.baseQuantity);

        await tx.update(products).set({ stock: newStock }).where(eq(products.id, itemData.productId));
        await tx.insert(stockAdjustments).values({
          productId: itemData.productId,
          quantity: -itemData.baseQuantity,
          type: "sale",
          reason: `Sold ${itemData.quantity} ${itemData.unit} in bill #${billId}`,
          billId,
        });
      }
    }
  }

  for (let index = 0; index < payload.normalizedCharges.length; index += 1) {
    const charge = payload.normalizedCharges[index];
    await tx.insert(billCharges).values({
      billId,
      label: charge.label,
      amount: charge.amount.toFixed(2),
      position: index,
    });
  }

  if (!payload.customerId) {
    return;
  }

  try {
    await tx.insert(ledgerEntries).values({
      customerId: payload.customerId,
      type: "CREDIT",
      amount: payload.totalAmount.toFixed(2),
      note: `Bill #${billId}`,
      billId,
      createdAt: payload.billDate,
    });
  } catch (error) {
    if (!isMissingLedgerTableError(error)) throw error;
  }

  if (payload.billPaidAmount > 0) {
    await tx.insert(payments).values({
      customerId: payload.customerId,
      billId,
      amount: payload.billPaidAmount.toFixed(2),
      date: payload.billDate,
      note: "Paid at time of bill",
    });

    try {
      await tx.insert(ledgerEntries).values({
        customerId: payload.customerId,
        billId,
        type: "PAYMENT",
        amount: payload.billPaidAmount.toFixed(2),
        note: `Bill #${billId}`,
        createdAt: payload.billDate,
      });
    } catch (error) {
      if (!isMissingLedgerTableError(error)) throw error;
    }
  }

  if (payload.oldBalancePaidAmount > 0) {
    await tx.insert(payments).values({
      customerId: payload.customerId,
      billId: null,
      amount: payload.oldBalancePaidAmount.toFixed(2),
      date: payload.billDate,
      note: getOldBalancePaymentNote(billId),
    });

    try {
      await tx.insert(ledgerEntries).values({
        customerId: payload.customerId,
        billId: null,
        type: "PAYMENT",
        amount: payload.oldBalancePaidAmount.toFixed(2),
        note: getOldBalancePaymentNote(billId),
        createdAt: payload.billDate,
      });
    } catch (error) {
      if (!isMissingLedgerTableError(error)) throw error;
    }
  }
}

async function reverseBillArtifacts(
  tx: AppDb,
  billId: number,
  customerId?: number | null,
) {
  const existingItems = await tx.select().from(billItems).where(eq(billItems.billId, billId));

  for (const item of existingItems) {
    if (!item.productId) continue;

    const [product] = await tx.select().from(products).where(eq(products.id, item.productId));
    if (!product) continue;

    await tx
      .update(products)
      .set({ stock: Number(product.stock || 0) + Number(item.baseQuantity || item.quantity || 0) })
      .where(eq(products.id, item.productId));
  }

  await tx.delete(stockAdjustments).where(eq(stockAdjustments.billId, billId));
  await tx.delete(billItems).where(eq(billItems.billId, billId));
  await tx.delete(billCharges).where(eq(billCharges.billId, billId));
  await tx.delete(payments).where(eq(payments.billId, billId));

  if (customerId) {
    await tx
      .delete(payments)
      .where(
        and(
          eq(payments.customerId, customerId),
          sql`${payments.billId} IS NULL`,
          eq(payments.note, getOldBalancePaymentNote(billId)),
        ),
      );
  }

  try {
    await tx.delete(ledgerEntries).where(eq(ledgerEntries.billId, billId));
    if (customerId) {
      await tx
        .delete(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.customerId, customerId),
            sql`${ledgerEntries.billId} IS NULL`,
            eq(ledgerEntries.note, getOldBalancePaymentNote(billId)),
          ),
        );
    }
  } catch (error) {
    if (!isMissingLedgerTableError(error)) throw error;
  }
}

export async function createBillTransaction(db: AppDb, data: CreateBillRequest) {
  return db.transaction(async (tx) => {
    const payload = await prepareBillMutation(tx, data, { allowCreateCustomer: true });

    const [bill] = await tx
      .insert(bills)
      .values({
        customerId: payload.customerId,
        subtotalAmount: payload.subtotalAmount.toFixed(2),
        extraChargesTotal: payload.extraChargesTotal.toFixed(2),
        totalAmount: payload.totalAmount.toFixed(2),
        oldBalanceAmount: payload.oldBalanceAmount.toFixed(2),
        billPaidAmount: payload.billPaidAmount.toFixed(2),
        oldBalancePaidAmount: payload.oldBalancePaidAmount.toFixed(2),
        grandTotal: payload.grandTotal.toFixed(2),
        totalProfit: payload.totalProfit.toFixed(2),
        date: payload.billDate,
        status: "completed",
      })
      .returning();

    await applyBillArtifacts(tx, bill.id, payload);

    return bill;
  });
}

export async function updateBillTransaction(
  db: AppDb,
  billId: number,
  data: UpdateBillRequest,
) {
  return db.transaction(async (tx) => {
    const [existingBill] = await tx.select().from(bills).where(eq(bills.id, billId));
    if (!existingBill) {
      throw new Error("Bill not found");
    }
    if (existingBill.status !== "completed") {
      throw new Error("Only completed bills can be edited");
    }

    const existingCustomerId = existingBill.customerId ?? undefined;
    const requestedCustomerId = data.customerId ?? undefined;
    if (existingCustomerId !== requestedCustomerId) {
      throw new Error("Changing customer on an existing bill is not allowed");
    }

    await reverseBillArtifacts(tx, billId, existingBill.customerId);

    const payload = await prepareBillMutation(tx, data, {
      oldBalanceAmount: Number(existingBill.oldBalanceAmount || 0),
    });

    const [updatedBill] = await tx
      .update(bills)
      .set({
        subtotalAmount: payload.subtotalAmount.toFixed(2),
        extraChargesTotal: payload.extraChargesTotal.toFixed(2),
        totalAmount: payload.totalAmount.toFixed(2),
        oldBalanceAmount: payload.oldBalanceAmount.toFixed(2),
        billPaidAmount: payload.billPaidAmount.toFixed(2),
        oldBalancePaidAmount: payload.oldBalancePaidAmount.toFixed(2),
        grandTotal: payload.grandTotal.toFixed(2),
        totalProfit: payload.totalProfit.toFixed(2),
        date: payload.billDate,
        lastEditedAt: new Date(),
        lastEditedBy: data.editedBy?.trim() || null,
      })
      .where(eq(bills.id, billId))
      .returning();

    await applyBillArtifacts(tx, billId, payload);

    return updatedBill;
  });
}

export async function getCustomerStatement(db: AppDb, customerId: number) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return null;

  const customerBills = await db
    .select()
    .from(bills)
    .where(and(eq(bills.customerId, customerId), eq(bills.status, "completed")));

  const customerPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.customerId, customerId));

  const totalBilled = customerBills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
  const totalPaid = customerPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return {
    customer,
    totalBilled,
    totalPaid,
    balance: totalBilled - totalPaid,
    bills: customerBills,
    payments: customerPayments,
  };
}
