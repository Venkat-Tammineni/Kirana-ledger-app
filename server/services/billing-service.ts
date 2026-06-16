import { and, eq, sum, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  accounts,
  accountTransactions,
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
import { parseISTDateTime } from "@shared/timezone";
import { deriveUnitPriceFromBase, getBaseUnit, getDefaultSalesUnit, toBaseQuantity } from "@shared/units";

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
  const customerBills = await tx
    .select({
      id: bills.id,
      totalAmount: bills.totalAmount,
      billPaidAmount: bills.billPaidAmount,
      oldBalancePaidAmount: bills.oldBalancePaidAmount,
    })
    .from(bills)
    .where(and(eq(bills.customerId, customerId), eq(bills.status, "completed")));

  const customerPayments = await tx
    .select({
      billId: payments.billId,
      amount: payments.amount,
      note: payments.note,
    })
    .from(payments)
    .where(eq(payments.customerId, customerId));

  const totalBilled = customerBills.reduce((total, bill) => total + Number(bill.totalAmount || 0), 0);
  const totalPaid = customerPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const paidByBillId = new Map<number, number>();
  const paidByOldBalanceNote = new Map<string, number>();

  for (const payment of customerPayments) {
    const amount = Number(payment.amount || 0);
    if (payment.billId) {
      paidByBillId.set(payment.billId, (paidByBillId.get(payment.billId) ?? 0) + amount);
    }
    if (payment.note) {
      paidByOldBalanceNote.set(payment.note, (paidByOldBalanceNote.get(payment.note) ?? 0) + amount);
    }
  }

  const missingStoredPayments = customerBills.reduce((total, bill) => {
    const storedPaid = Number(bill.billPaidAmount || 0) + Number(bill.oldBalancePaidAmount || 0);
    if (storedPaid <= 0) return total;

    const persistedPaid =
      (paidByBillId.get(bill.id) ?? 0) +
      (paidByOldBalanceNote.get(getOldBalancePaymentNote(bill.id)) ?? 0);

    return total + Math.max(0, storedPaid - persistedPaid);
  }, 0);

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

  return totalBilled + manualCreditTotal - (totalPaid + missingStoredPayments);
}

function getOldBalancePaymentNote(billId: number) {
  return `Old balance payment during bill #${billId}`;
}

function getBillAccountCreditNote(billId: number, customerName?: string | null) {
  const label = customerName?.trim() ? `${customerName.trim()} money` : "Walk-in money";
  return `${label} (Bill #${billId})`;
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
  const paymentApplied = Math.max(data.paidAmount || 0, 0);
  const billPaidAmount = Math.min(paymentApplied, totalAmount);
  const oldBalancePaidAmount = Math.max(paymentApplied - billPaidAmount, 0);
  const billDate = data.date ? parseISTDateTime(data.date) : new Date();

  let totalProfit = 0;
  const billItemsData: PreparedBillMutation["billItemsData"] = [];

  for (const item of data.items) {
    let productId = item.productId || null;
    let costPrice = item.costPrice ?? 0;
    let productCostPrice: number | null = null;
    let primaryUnit = "PCS";
    let secondaryUnit: string | null = null;
    let unitConversion: number | null = null;

    if (productId) {
      const [product] = await tx.select().from(products).where(eq(products.id, productId));
      if (product) {
        productCostPrice = Number(product.costPrice || 0);
        primaryUnit = product.primaryUnit || "PCS";
        secondaryUnit = product.secondaryUnit ?? null;
        unitConversion = product.unitConversion ?? null;
      }
    } else {
      primaryUnit = item.unit || "PCS";
    }

    const unitContext = {
      primaryUnit,
      secondaryUnit,
      unitConversion,
    };
    const selectedUnit = item.unit || getDefaultSalesUnit(unitContext);
    const baseUnit = item.baseUnit || getBaseUnit(unitContext);
    const baseQuantity = item.baseQuantity || toBaseQuantity(item.quantity, unitContext, selectedUnit);
    if (productCostPrice !== null) {
      costPrice = deriveUnitPriceFromBase(productCostPrice, unitContext, selectedUnit);
    }

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
  options?: {
    paymentAccountId?: number;
  },
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
        const currentStock = Number(product.stock || 0);
        const newStock = Math.max(0, currentStock - itemData.baseQuantity);

        await tx.update(products).set({ stock: newStock.toString() }).where(eq(products.id, itemData.productId));
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
    if (payload.billPaidAmount > 0 && options?.paymentAccountId) {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, options.paymentAccountId));
      if (!account) throw new Error("Selected account not found");

      await tx.insert(accountTransactions).values({
        accountId: account.id,
        type: "credit",
        amount: payload.billPaidAmount.toFixed(2),
        note: getBillAccountCreditNote(billId, null),
        date: payload.billDate,
      });
    }
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
    const [customer] = await tx.select().from(customers).where(eq(customers.id, payload.customerId));

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

    if (options?.paymentAccountId) {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, options.paymentAccountId));
      if (!account) throw new Error("Selected account not found");

      await tx.insert(accountTransactions).values({
        accountId: account.id,
        type: "credit",
        amount: payload.billPaidAmount.toFixed(2),
        note: getBillAccountCreditNote(billId, customer?.name),
        date: payload.billDate,
      });
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
  let customerName: string | null = null;
  if (customerId) {
    const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
    customerName = customer?.name ?? null;
  }

  const existingItems = await tx.select().from(billItems).where(eq(billItems.billId, billId));

  for (const item of existingItems) {
    if (!item.productId) continue;

    const [product] = await tx.select().from(products).where(eq(products.id, item.productId));
    if (!product) continue;

    await tx
      .update(products)
      .set({ stock: (Number(product.stock || 0) + Number(item.baseQuantity || item.quantity || 0)).toString() })
      .where(eq(products.id, item.productId));
  }

  await tx.delete(stockAdjustments).where(eq(stockAdjustments.billId, billId));
  await tx.delete(billItems).where(eq(billItems.billId, billId));
  await tx.delete(billCharges).where(eq(billCharges.billId, billId));
  await tx.delete(payments).where(eq(payments.billId, billId));
  await tx
    .delete(accountTransactions)
    .where(
      eq(
        accountTransactions.note,
        getBillAccountCreditNote(billId, customerName),
      ),
    );

  if (!customerName) {
    await tx
      .delete(accountTransactions)
      .where(eq(accountTransactions.note, getBillAccountCreditNote(billId, null)));
  }

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

    await applyBillArtifacts(tx, bill.id, payload, { paymentAccountId: data.paymentAccountId });

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

    await reverseBillArtifacts(tx, billId, existingBill.customerId);

    const existingCustomerId = existingBill.customerId ?? undefined;
    const requestedCustomerId = data.customerId ?? undefined;
    const payload = await prepareBillMutation(
      tx,
      data,
      existingCustomerId === requestedCustomerId
        ? {
            oldBalanceAmount: Number(existingBill.oldBalanceAmount || 0),
          }
        : undefined,
    );

    const [updatedBill] = await tx
      .update(bills)
      .set({
        customerId: payload.customerId ?? null,
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

    await applyBillArtifacts(tx, billId, payload, { paymentAccountId: data.paymentAccountId });

    return updatedBill;
  });
}

export async function deleteBillTransaction(db: AppDb, billId: number) {
  return db.transaction(async (tx) => {
    const [existingBill] = await tx.select().from(bills).where(eq(bills.id, billId));
    if (!existingBill) {
      throw new Error("Bill not found");
    }
    if (existingBill.status !== "completed") {
      throw new Error("Only completed bills can be deleted");
    }

    await reverseBillArtifacts(tx, billId, existingBill.customerId);

    await tx
      .update(bills)
      .set({
        status: "voided",
        lastEditedAt: new Date(),
      })
      .where(eq(bills.id, billId));
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
  const persistedPaid = customerPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paidByBillId = new Map<number, number>();
  const paidByOldBalanceNote = new Map<string, number>();

  for (const payment of customerPayments) {
    const amount = Number(payment.amount || 0);
    if (payment.billId) {
      paidByBillId.set(payment.billId, (paidByBillId.get(payment.billId) ?? 0) + amount);
    }
    if (payment.note) {
      paidByOldBalanceNote.set(payment.note, (paidByOldBalanceNote.get(payment.note) ?? 0) + amount);
    }
  }

  const missingStoredPayments = customerBills.reduce((sum, bill) => {
    const storedPaid = Number(bill.billPaidAmount || 0) + Number(bill.oldBalancePaidAmount || 0);
    if (storedPaid <= 0) return sum;

    const billPersistedPaid =
      (paidByBillId.get(bill.id) ?? 0) +
      (paidByOldBalanceNote.get(getOldBalancePaymentNote(bill.id)) ?? 0);

    return sum + Math.max(0, storedPaid - billPersistedPaid);
  }, 0);
  const totalPaid = persistedPaid + missingStoredPayments;

  return {
    customer,
    totalBilled,
    totalPaid,
    balance: totalBilled - totalPaid,
    bills: customerBills,
    payments: customerPayments,
  };
}
