import { and, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { db } from "../db";
import {
  accountTransactions,
  accounts,
  billItems,
  bills,
  customers,
  payments,
  products,
  stockAdjustments,
} from "@shared/schema";
import { dateFromISTParts, formatIST, getISTDayBounds, getISTParts } from "@shared/timezone";
import { storage } from "../storage";

export type AdvancedRange = {
  startDate: Date;
  endDate: Date;
  granularity?: "day" | "week" | "month";
};

function toNumber(value: unknown) {
  return Number(value || 0);
}

function formatBucketLabel(date: Date, granularity: AdvancedRange["granularity"]) {
  if (granularity === "month") {
    return formatIST(date, "MMM yyyy");
  }
  if (granularity === "week") {
    const parts = getISTParts(date);
    const midnight = dateFromISTParts(parts.year, parts.month, parts.day);
    const weekday = midnight.getUTCDay();
    const diff = weekday === 0 ? -6 : 1 - weekday;
    const weekStart = new Date(midnight.getTime() + diff * 24 * 60 * 60 * 1000);
    return `${formatIST(weekStart, "dd MMM")} week`;
  }
  return formatIST(date, "dd MMM");
}

function getRangeFilters(column: any, range: AdvancedRange) {
  return and(
    sql`${column} >= ${range.startDate}`,
    sql`${column} <= ${range.endDate}`,
  );
}

function buildTrend<T extends Record<string, number>>(
  rows: { date: Date | null; values: T }[],
  granularity: AdvancedRange["granularity"],
) {
  const buckets = new Map<string, T>();

  for (const row of rows) {
    if (!row.date) continue;
    const label = formatBucketLabel(new Date(row.date), granularity);
    const current = buckets.get(label);
    if (!current) {
      buckets.set(label, { ...row.values });
      continue;
    }

    for (const key of Object.keys(row.values) as Array<keyof T>) {
      (current as Record<string, number>)[String(key)] += (row.values as Record<string, number>)[String(key)];
    }
  }

  return Array.from(buckets.entries()).map(([label, values]) => ({
    label,
    ...values,
  }));
}

async function getSalesBase(range: AdvancedRange) {
  const billRows = await db
    .select({
      id: bills.id,
      customerId: bills.customerId,
      customerName: customers.name,
      date: bills.date,
      totalAmount: bills.totalAmount,
      totalProfit: bills.totalProfit,
    })
    .from(bills)
    .leftJoin(customers, eq(bills.customerId, customers.id))
    .where(and(eq(bills.status, "completed"), getRangeFilters(bills.date, range)))
    .orderBy(desc(bills.date));

  const billIds = billRows.map((bill) => bill.id);
  const itemRows =
    billIds.length === 0
      ? []
      : await db
          .select({
            billId: billItems.billId,
            itemsCount: sql<number>`count(*)`,
            subtotal: sum(billItems.subtotal),
          })
          .from(billItems)
          .where(inArray(billItems.billId, billIds))
          .groupBy(billItems.billId);

  const paymentRows =
    billIds.length === 0
      ? []
      : await db
          .select({
            billId: payments.billId,
            paidAmount: sum(payments.amount),
          })
          .from(payments)
          .where(inArray(payments.billId, billIds))
          .groupBy(payments.billId);

  return {
    billRows,
    itemMap: new Map(itemRows.map((row) => [row.billId, row])),
    paymentMap: new Map(paymentRows.map((row) => [row.billId, toNumber(row.paidAmount)])),
  };
}

export async function getAdvancedSalesReport(range: AdvancedRange) {
  const { billRows, itemMap, paymentMap } = await getSalesBase(range);

  let paidCount = 0;
  let unpaidCount = 0;
  let partialCount = 0;
  let paidAmount = 0;
  let unpaidAmount = 0;
  let partialAmount = 0;

  const customerTotals = new Map<string, { customerId: number | null; customerName: string; revenue: number }>();
  const trend = buildTrend(
    billRows.map((bill) => ({
      date: bill.date,
      values: { sales: toNumber(bill.totalAmount), bills: 1 },
    })),
    range.granularity,
  );

  const table = billRows.map((bill) => {
    const subtotal = toNumber(itemMap.get(bill.id)?.subtotal ?? bill.totalAmount);
    const itemsCount = toNumber(itemMap.get(bill.id)?.itemsCount ?? 0);
    const total = toNumber(bill.totalAmount);
    const paid = bill.customerId == null ? total : toNumber(paymentMap.get(bill.id));
    const status =
      paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";

    if (status === "paid") {
      paidCount += 1;
      paidAmount += total;
    } else if (status === "partial") {
      partialCount += 1;
      partialAmount += total;
    } else {
      unpaidCount += 1;
      unpaidAmount += total;
    }

    const customerKey = `${bill.customerId ?? "walk-in"}:${bill.customerName ?? "Walk-in Customer"}`;
    const current = customerTotals.get(customerKey) ?? {
      customerId: bill.customerId,
      customerName: bill.customerName || "Walk-in Customer",
      revenue: 0,
    };
    current.revenue += total;
    customerTotals.set(customerKey, current);

    return {
      invoiceNo: `INV-${bill.id}`,
      customer: bill.customerName || "Walk-in Customer",
      date: bill.date ? formatIST(bill.date, "dd MMM yyyy, hh:mm a") : "",
      itemsCount,
      subtotal,
      gst: 0,
      total,
      status,
    };
  });

  const totalSales = table.reduce((sumValue, row) => sumValue + row.total, 0);
  const billCount = table.length;

  return {
    metrics: {
      totalSales,
      billCount,
      avgBillValue: billCount > 0 ? totalSales / billCount : 0,
      gstCollected: 0,
    },
    breakdown: {
      paid: { count: paidCount, amount: paidAmount },
      unpaid: { count: unpaidCount, amount: unpaidAmount },
      partial: { count: partialCount, amount: partialAmount },
    },
    trend,
    topCustomers: Array.from(customerTotals.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    table,
    gstSummary: {
      cgst: 0,
      sgst: 0,
      igst: 0,
    },
  };
}

export async function getAdvancedPurchaseReport(range: AdvancedRange) {
  const rows = await db
    .select({
      id: stockAdjustments.id,
      productId: stockAdjustments.productId,
      productName: products.name,
      date: stockAdjustments.date,
      quantity: stockAdjustments.quantity,
      reason: stockAdjustments.reason,
      costPrice: products.costPrice,
    })
    .from(stockAdjustments)
    .innerJoin(products, eq(stockAdjustments.productId, products.id))
    .where(and(eq(stockAdjustments.type, "purchase"), getRangeFilters(stockAdjustments.date, range)))
    .orderBy(desc(stockAdjustments.date));

  const productTotals = new Map<string, { productId: number | null; productName: string; amount: number }>();
  const trend = buildTrend(
    rows.map((row) => ({
      date: row.date,
      values: { purchases: toNumber(row.costPrice) * Math.max(0, row.quantity), entries: 1 },
    })),
    range.granularity,
  );

  const table = rows.map((row) => {
    const total = toNumber(row.costPrice) * Math.max(0, row.quantity);
    const productKey = `${row.productId}:${row.productName}`;
    const current = productTotals.get(productKey) ?? {
      productId: row.productId,
      productName: row.productName,
      amount: 0,
    };
    current.amount += total;
    productTotals.set(productKey, current);

    return {
      invoiceNo: `PUR-${row.id}`,
      supplier: row.reason || "Inventory Purchase",
      date: row.date ? formatIST(row.date, "dd MMM yyyy, hh:mm a") : "",
      itemsCount: 1,
      subtotal: total,
      gst: 0,
      total,
      status: "paid" as const,
    };
  });

  const totalPurchases = table.reduce((sumValue, row) => sumValue + row.total, 0);

  return {
    metrics: {
      totalPurchases,
      billCount: table.length,
      avgBillValue: table.length > 0 ? totalPurchases / table.length : 0,
      gstCollected: 0,
    },
    breakdown: {
      paid: { count: table.length, amount: totalPurchases },
      unpaid: { count: 0, amount: 0 },
      partial: { count: 0, amount: 0 },
    },
    trend,
    topProducts: Array.from(productTotals.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10),
    table,
    gstSummary: {
      cgst: 0,
      sgst: 0,
      igst: 0,
      input: 0,
      output: 0,
      netPayable: 0,
    },
  };
}

export async function getAdvancedProfitLoss(range: AdvancedRange) {
  const sales = await getAdvancedSalesReport(range);
  const purchases = await getAdvancedPurchaseReport(range);

  const expenseRows = await db
    .select({
      accountName: accounts.name,
      amount: accountTransactions.amount,
      date: accountTransactions.date,
    })
    .from(accountTransactions)
    .innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
    .where(and(eq(accountTransactions.type, "spent"), getRangeFilters(accountTransactions.date, range)));

  const expenses = expenseRows.reduce((sumValue, row) => sumValue + toNumber(row.amount), 0);
  const netRevenue = sales.metrics.totalSales;
  const cogs = purchases.metrics.totalPurchases;
  const grossProfit = netRevenue - cogs;
  const netProfit = grossProfit - expenses;

  const expenseBreakdownMap = new Map<string, number>();
  for (const row of expenseRows) {
    expenseBreakdownMap.set(row.accountName, (expenseBreakdownMap.get(row.accountName) ?? 0) + toNumber(row.amount));
  }

  const combinedTrendMap = new Map<string, { revenue: number; cost: number; profit: number }>();
  for (const point of sales.trend) {
    combinedTrendMap.set(point.label, {
      revenue: point.sales ?? 0,
      cost: 0,
      profit: point.sales ?? 0,
    });
  }
  for (const point of purchases.trend) {
    const current = combinedTrendMap.get(point.label) ?? { revenue: 0, cost: 0, profit: 0 };
    current.cost += point.purchases ?? 0;
    current.profit = current.revenue - current.cost;
    combinedTrendMap.set(point.label, current);
  }
  for (const row of expenseRows) {
    if (!row.date) continue;
    const label = formatBucketLabel(new Date(row.date), range.granularity);
    const current = combinedTrendMap.get(label) ?? { revenue: 0, cost: 0, profit: 0 };
    current.profit -= toNumber(row.amount);
    combinedTrendMap.set(label, current);
  }

  return {
    metrics: {
      netRevenue,
      cogs,
      grossProfit,
      expenses,
      netProfit,
      grossMarginPct: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
      netMarginPct: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0,
    },
    trend: Array.from(combinedTrendMap.entries()).map(([label, value]) => ({
      label,
      ...value,
    })),
    expenseBreakdown: Array.from(expenseBreakdownMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function getAdvancedOutstanding() {
  const customerRows = await storage.getCustomers();
  const dueCustomers = customerRows
    .filter((customer) => customer.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const table = await Promise.all(
    dueCustomers.map(async (customer) => {
      const history = await storage.getCustomerHistory(customer.id);
      const lastTransaction = history[0]?.date || null;
      const oldestBill = history
        .filter((entry) => entry.type === "bill")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
      const oldestDue = oldestBill?.date || null;

      return {
        customerId: customer.id,
        customer: customer.name,
        phone: customer.phone,
        balance: customer.balance,
        lastTransaction,
        oldestDue,
        remindText: `Hi ${customer.name}, your pending balance is Rs.${customer.balance.toFixed(2)}. Please pay when possible. - Ganesh Kirana Store`,
      };
    }),
  );

  const aging = { bucket0To7: 0, bucket8To30: 0, bucket31To60: 0, bucket60Plus: 0 };
  for (const row of table) {
    if (!row.oldestDue) {
      aging.bucket0To7 += row.balance;
      continue;
    }

    const ageDays = Math.floor((getISTDayBounds(new Date()).start.getTime() - getISTDayBounds(row.oldestDue).start.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays <= 7) aging.bucket0To7 += row.balance;
    else if (ageDays <= 30) aging.bucket8To30 += row.balance;
    else if (ageDays <= 60) aging.bucket31To60 += row.balance;
    else aging.bucket60Plus += row.balance;
  }

  return {
    metrics: {
      totalOutstanding: table.reduce((sumValue, row) => sumValue + row.balance, 0),
      customerCount: table.length,
    },
    aging,
    table,
  };
}

export async function getAdvancedStockSummary() {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(products.name);

  const table = rows.map((product) => {
    const qty = Number(product.stock || 0);
    const buyPrice = toNumber(product.costPrice);
    const sellPrice = toNumber(product.price);
    const value = buyPrice * qty;
    const profit = (sellPrice - buyPrice) * qty;
    return {
      productId: product.id,
      item: product.name,
      qty,
      buyPrice,
      sellPrice,
      value,
      profit,
      marginPct: value > 0 ? (profit / value) * 100 : 0,
    };
  });

  return {
    metrics: {
      totalItems: table.length,
      stockValue: table.reduce((sumValue, row) => sumValue + row.value, 0),
      potentialProfit: table.reduce((sumValue, row) => sumValue + row.profit, 0),
    },
    table,
  };
}

export async function getAdvancedCashbook(range: AdvancedRange) {
  const openingAccounts = await db.select({ openingBalance: accounts.openingBalance }).from(accounts);
  const priorTransactions = await db
    .select({
      type: accountTransactions.type,
      amount: accountTransactions.amount,
    })
    .from(accountTransactions)
    .where(sql`${accountTransactions.date} < ${range.startDate}`);

  const openingBalance =
    openingAccounts.reduce((sumValue, row) => sumValue + toNumber(row.openingBalance), 0) +
    priorTransactions.reduce((sumValue, row) => {
      const amount = toNumber(row.amount);
      return sumValue + (row.type === "credit" ? amount : -amount);
    }, 0);

  const rows = await db
    .select({
      date: accountTransactions.date,
      category: accounts.name,
      note: accountTransactions.note,
      type: accountTransactions.type,
      amount: accountTransactions.amount,
    })
    .from(accountTransactions)
    .innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
    .where(getRangeFilters(accountTransactions.date, range))
    .orderBy(accountTransactions.date, accountTransactions.id);

  let runningBalance = openingBalance;
  const breakdownMap = new Map<string, { cashIn: number; cashOut: number }>();

  const table = rows.map((row) => {
    const amount = toNumber(row.amount);
    const cashIn = row.type === "credit" ? amount : 0;
    const cashOut = row.type === "spent" ? amount : 0;
    runningBalance += cashIn - cashOut;

    const current = breakdownMap.get(row.category) ?? { cashIn: 0, cashOut: 0 };
    current.cashIn += cashIn;
    current.cashOut += cashOut;
    breakdownMap.set(row.category, current);

    return {
      date: row.date?.toISOString() || "",
      category: row.category,
      note: row.note || "",
      cashIn,
      cashOut,
      runningBalance,
    };
  });

  let cumulativeBalance = openingBalance;
  const trend = buildTrend(
    rows.map((row) => {
      const amount = toNumber(row.amount);
      const cashIn = row.type === "credit" ? amount : 0;
      const cashOut = row.type === "spent" ? amount : 0;
      cumulativeBalance += cashIn - cashOut;
      return {
        date: row.date,
        values: { cashIn, cashOut, balance: cumulativeBalance },
      };
    }),
    range.granularity,
  );

  const totalCashIn = table.reduce((sumValue, row) => sumValue + row.cashIn, 0);
  const totalCashOut = table.reduce((sumValue, row) => sumValue + row.cashOut, 0);

  return {
    metrics: {
      openingBalance,
      totalCashIn,
      totalCashOut,
      balance: openingBalance + totalCashIn - totalCashOut,
    },
    breakdown: Array.from(breakdownMap.entries()).map(([category, value]) => ({
      category,
      cashIn: value.cashIn,
      cashOut: value.cashOut,
    })),
    trend,
    table,
  };
}

export async function getAdvancedOverview(range: AdvancedRange) {
  const [sales, purchases, profitLoss, outstanding, stockSummary, cashbook] = await Promise.all([
    getAdvancedSalesReport(range),
    getAdvancedPurchaseReport(range),
    getAdvancedProfitLoss(range),
    getAdvancedOutstanding(),
    getAdvancedStockSummary(),
    getAdvancedCashbook(range),
  ]);

  return {
    cards: {
      sales: {
        label: "Sales Report",
        value: sales.metrics.totalSales,
        secondary: `${sales.metrics.billCount} bills`,
      },
      purchases: {
        label: "Purchase Report",
        value: purchases.metrics.totalPurchases,
        secondary: `${purchases.metrics.billCount} entries`,
      },
      profitLoss: {
        label: "Profit & Loss",
        value: profitLoss.metrics.netProfit,
        secondary: `${profitLoss.metrics.netMarginPct.toFixed(1)}% net margin`,
      },
      outstanding: {
        label: "Outstanding Balances",
        value: outstanding.metrics.totalOutstanding,
        secondary: `${outstanding.metrics.customerCount} customers`,
      },
      stockSummary: {
        label: "Stock Summary",
        value: stockSummary.metrics.stockValue,
        secondary: `${stockSummary.metrics.totalItems} items`,
      },
      cashbook: {
        label: "Cashbook Report",
        value: cashbook.metrics.balance,
        secondary: `${cashbook.metrics.totalCashIn.toFixed(0)} in / ${cashbook.metrics.totalCashOut.toFixed(0)} out`,
      },
    },
  };
}
