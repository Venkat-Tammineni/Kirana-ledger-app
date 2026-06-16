
import { db } from "./db";
import {
  customers, products, bills, billItems, billCharges, quotations, quotationItems, quotationCharges, payments, customerProfitAdjustments, ledgerEntries, stockAdjustments, accounts, staff, staffAttendance, staffSalaryPayments, accountTransactions, investmentEntries, investmentEntryPurchases, accountTransactionPurchases,
  type Customer, type Product, type Bill, type BillItem, type BillCharge, type Quotation, type QuotationItem, type QuotationCharge, type Payment, type CustomerProfitAdjustment, type LedgerEntry, type StockAdjustment, type Account, type Staff, type StaffAttendance, type StaffSalaryPayment, type AccountTransaction, type InvestmentEntry, type InvestmentEntryPurchase, type AccountTransactionPurchase,
  type CreateBillRequest,
  type UpdateBillRequest,
  type CreateQuotationRequest,
  type UpdateQuotationRequest,
} from "@shared/schema";
import { eq, desc, sql, sum, and, inArray } from "drizzle-orm";
import { createBillTransaction, deleteBillTransaction, updateBillTransaction } from "./services/billing-service";
import { adjustStockTransaction } from "./services/inventory-service";
import { getISTDateKey, getISTDayBounds, getISTMonthBounds, parseISTDateTime } from "@shared/timezone";

const LEDGER_TABLE_NAME = "ledger_entries";
const MIRCHI_POWDER_ITEM_NAME = "mirchi powder";
const STAFF_SALARY_PAYMENTS_TABLE_NAME = "staff_salary_payments";

type AccountTransactionWithCustomer = AccountTransaction & { customerId?: number | null };

function isMissingLedgerTableError(error: unknown): boolean {
  return isMissingTableError(error, LEDGER_TABLE_NAME);
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42P01" &&
    candidate.message?.includes(`relation "${tableName}" does not exist`) === true
  );
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42703" &&
    candidate.message?.includes(columnName) === true
  );
}

type CustomerLedgerView = {
  id: number;
  customerId: number;
  type: "CREDIT" | "PAYMENT";
  amount: number;
  note: string | null;
  billId: number | null;
  createdAt: string;
  runningBalance: number;
};

type CustomerStats = {
  totalPurchased: number;
  totalPaid: number;
  balance: number;
  totalProfit: number;
  todayProfit: number;
  selectedProfitDate: string;
  totalGiven: number;
  totalReceived: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
};

type CustomerListSummary = {
  totalPurchased: number;
  totalPaid: number;
  totalProfit: number;
  totalGiven: number;
  totalReceived: number;
  balance: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
};

type StaffSummary = {
  presentDays: number;
  absentDays: number;
  attendancePaymentTotal: number;
  overallAdjustment: number;
  totalPayment: number;
  thisMonthPayable: number;
  todayStatus: "present" | "absent" | null;
  todayPayment: number;
};

type StaffSalaryPaymentView = {
  id: number;
  staffId: number;
  rangeStart: string;
  rangeEnd: string;
  amount: number;
  note: string | null;
};

function getMonthlyDailySalary(staffRecord: Pick<Staff, "salaryAmount">) {
  return Number(staffRecord.salaryAmount || 0) / 30;
}

function getAttendancePaymentForStaff(staffRecord: Pick<Staff, "salaryType" | "salaryAmount">, entry: StaffAttendance) {
  if (staffRecord.salaryType === "monthly") {
    return entry.status === "present" ? getMonthlyDailySalary(staffRecord) : 0;
  }

  return Number(entry.payment || 0);
}

type MirchiPowderTotals = {
  sales: number;
  profit: number;
};

type InvestmentHistoryEntry = {
  id: number;
  source: "account_spent" | "manual";
  sourceLabel: string;
  amount: number;
  note: string | null;
  date: string;
};

function parseAccountLinkedPaymentNote(note: string | null | undefined) {
  if (!note) return null;
  const trimmed = note.trim();
  const explicitMatch = trimmed.match(/^(.*)\s+\(received in (.+)\)$/i);
  if (!explicitMatch) return null;

  return {
    accountName: explicitMatch[2].trim(),
    accountTxnNote: explicitMatch[1].trim(),
  };
}

function getOldBalancePaymentNote(billId: number) {
  return `Old balance payment during bill #${billId}`;
}

function getOldBalancePaymentBillId(note: string | null | undefined) {
  const match = note?.match(/^Old balance payment during bill #(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function getReceivedDuringBillNote(billId: number) {
  return `Received during Bill #${billId}`;
}

function getMissingStoredBillPayments(
  billRows: Array<{
    id: number;
    customerId: number | null;
    billPaidAmount: unknown;
    oldBalancePaidAmount: unknown;
  }>,
  paymentRows: Array<{
    customerId: number;
    billId: number | null;
    amount: unknown;
    note: string | null;
  }>,
) {
  const paidByBillId = new Map<number, number>();
  const paidByCustomerAndOldBalanceNote = new Map<string, number>();
  const missingByCustomer = new Map<number, number>();

  for (const payment of paymentRows) {
    const amount = Number(payment.amount || 0);
    if (payment.billId) {
      paidByBillId.set(payment.billId, (paidByBillId.get(payment.billId) ?? 0) + amount);
    }
    if (payment.note) {
      const key = `${payment.customerId}:${payment.note}`;
      paidByCustomerAndOldBalanceNote.set(key, (paidByCustomerAndOldBalanceNote.get(key) ?? 0) + amount);
    }
  }

  for (const bill of billRows) {
    if (bill.customerId == null) continue;

    const storedPaid = Number(bill.billPaidAmount || 0) + Number(bill.oldBalancePaidAmount || 0);
    if (storedPaid <= 0) continue;

    const oldBalanceNoteKey = `${bill.customerId}:${getOldBalancePaymentNote(bill.id)}`;
    const persistedPaid =
      (paidByBillId.get(bill.id) ?? 0) +
      (paidByCustomerAndOldBalanceNote.get(oldBalanceNoteKey) ?? 0);
    const missingPaid = Math.max(0, storedPaid - persistedPaid);

    if (missingPaid > 0) {
      missingByCustomer.set(bill.customerId, (missingByCustomer.get(bill.customerId) ?? 0) + missingPaid);
    }
  }

  return missingByCustomer;
}

export interface IStorage {
  // Staff
  getStaff(): Promise<(Staff & { presentDays: number; absentDays: number; totalPayment: number; thisMonthPayable: number; todayStatus: "present" | "absent" | null; todayPayment: number })[]>;
  getStaffDetails(id: number): Promise<{ staff: Staff; summary: StaffSummary; attendance: StaffAttendance[]; payments: StaffSalaryPaymentView[] } | undefined>;
  createStaff(data: Omit<Staff, "id" | "createdAt" | "overallPaymentAdjustment">): Promise<Staff>;
  markStaffAttendance(id: number, input: { date?: Date; status: "present" | "absent"; payment?: number }): Promise<StaffAttendance>;
  updateStaffTodayPayment(id: number, payment: number, date?: Date): Promise<StaffAttendance>;
  updateStaffOverallPayment(id: number, totalPayment: number): Promise<{ staffId: number; totalPayment: number; overallAdjustment: number }>;
  updateStaffSalary(id: number, input: { salaryType: "daily" | "monthly"; salaryAmount: number; applyToRange?: boolean; rangeStart?: Date; rangeEnd?: Date }): Promise<Staff>;
  upsertStaffSalaryPayment(id: number, input: { rangeStart: Date; rangeEnd: Date; amount: number; note?: string }): Promise<StaffSalaryPaymentView>;

  // Accounts
  getAccounts(): Promise<(Account & { currentBalance: number; totalSpent: number })[]>;
  getAccount(id: number): Promise<Account | undefined>;
  getAccountDetails(id: number): Promise<{ account: Account; currentBalance: number; totalSpent: number; transactions: AccountTransactionWithCustomer[] } | undefined>;
  createAccount(account: Omit<Account, "id" | "createdAt">): Promise<Account>;
  spendFromAccount(id: number, amount: number, note: string, date?: Date, purchases?: Array<{ productId: number; quantity: number; costPrice?: number }>): Promise<AccountTransaction>;
  addToAccount(id: number, amount: number, note: string, customerId?: number): Promise<AccountTransaction>;
  updateAccountTransaction(accountId: number, transactionId: number, input: { amount: number; note: string; customerId?: number | null }): Promise<AccountTransaction>;
  deleteAccountTransaction(accountId: number, transactionId: number): Promise<void>;
  deleteAccountSafe(id: number): Promise<void>;
  deleteAccountForce(id: number): Promise<void>;
  getInvestmentDetails(): Promise<{
    totalInvestment: number;
    accountSpentTotal: number;
    manualInvestmentTotal: number;
    entries: InvestmentHistoryEntry[];
  }>;
  createInvestmentEntry(data: {
    amount: number;
    note: string;
    date?: Date;
    purchases?: Array<{ productId: number; quantity: number; costPrice?: number }>;
  }): Promise<InvestmentEntry>;
  deleteInvestmentEntry(id: number): Promise<void>;

  // Customers
  getCustomers(search?: string): Promise<(Customer & {
    balance: number;
    totalProfit?: number;
    totalGiven: number;
    totalReceived: number;
    lastPaymentDate: string | null;
    daysSinceLastPayment: number | null;
  })[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerStats(id: number, profitDate?: Date, startDate?: Date, endDate?: Date): Promise<CustomerStats>;
  getCustomerHistory(id: number): Promise<{ type: 'bill' | 'payment', date: string, amount: number, id: number }[]>;
  getCustomerLedger(id: number): Promise<CustomerLedgerView[]>;
  createCustomer(customer: Omit<Customer, "id" | "createdAt">): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<Omit<Customer, "id" | "createdAt">>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  createPayment(payment: Omit<Payment, "id" | "date"> & { date?: Date; paymentAccountId?: number }): Promise<Payment>;
  deleteCustomerPayment(customerId: number, paymentId: number): Promise<void>;
  setCustomerTotalProfit(id: number, totalProfit: number): Promise<{ customerId: number; totalProfit: number; adjustment: number }>;
  setCustomerDailyProfit(id: number, profitDate: Date, totalProfit: number): Promise<{ customerId: number; profitDate: string; totalProfit: number; adjustment: number }>;
  createLedgerCredit(entry: {
    customerId: number;
    amount: number;
    note?: string;
    billId?: number | null;
    createdAt?: Date;
  }): Promise<LedgerEntry>;
  deleteCustomerCredit(customerId: number, entryId: number): Promise<void>;
  
  // Products
  getProducts(search?: string): Promise<Product[]>;
  createProduct(product: Omit<Product, "id">): Promise<Product>;
  updateProduct(id: number, product: Partial<Omit<Product, "id">>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Bills
  getBills(): Promise<(Bill & { customerName: string | null })[]>;
  getBill(id: number): Promise<(Bill & { items: BillItem[]; charges: BillCharge[]; customer: Customer | null }) | undefined>;
  getPreviousBillForCustomer(customerId: number): Promise<(Bill & { items: BillItem[]; charges: BillCharge[] }) | undefined>;
  getLastBilledItemMemory(
    customerId: number,
    lookup: { productId?: number; name?: string },
  ): Promise<{
    productId: number | null;
    name: string;
    quantity: number;
    unit: string;
    price: number;
    costPrice: number;
    billId: number;
    billDate: string;
  } | null>;
  createBill(data: CreateBillRequest): Promise<Bill>;
  updateBill(id: number, data: UpdateBillRequest): Promise<Bill>;
  deleteBill(id: number): Promise<void>;

  // Quotations
  getQuotations(): Promise<(Quotation & { customerName: string | null })[]>;
  getQuotation(id: number): Promise<(Quotation & { items: QuotationItem[]; charges: QuotationCharge[]; customer: Customer | null; convertedBill: Bill | null }) | undefined>;
  createQuotation(data: CreateQuotationRequest): Promise<Quotation>;
  updateQuotation(id: number, data: UpdateQuotationRequest): Promise<Quotation>;
  updateQuotationStatus(id: number, status: "draft" | "sent" | "accepted" | "rejected"): Promise<Quotation>;
  convertQuotationToBill(id: number): Promise<{ quotation: Quotation; bill: Bill }>;
  
  // Dashboard
  getDashboardStats(): Promise<{ todaySales: number; todayProfit: number; mirchiPowderSales: number; mirchiPowderProfit: number; totalDue: number; activeCustomers: number }>;
  
  // Reporting
  getProfitReport(startDate: Date, endDate: Date): Promise<{
    totalSales: number;
    totalProfit: number;
    totalInvestment: number;
    mirchiPowderSales: number;
    mirchiPowderProfit: number;
    mirchiPowderInvestment: number;
    mirchiPowderCustomers: Array<{
      customerId: number | null;
      customerName: string;
      totalQuantity: number;
      unit: string;
      totalSales: number;
      totalProfit: number;
      details: Array<{
        billId: number;
        date: Date | string;
        quantity: number;
        unit: string;
        rate: number;
        sales: number;
        profit: number;
      }>;
    }>;
  }>;
  getCustomerProfitReport(startDate: Date, endDate: Date): Promise<Array<{
    customerId: number | null;
    customerName: string;
    totalSales: number;
    totalProfit: number;
    items: Array<{
      productId: number | null;
      itemName: string;
      quantity: number;
      unit: string;
      totalSales: number;
      totalProfit: number;
    }>;
  }>>;
  
  // Inventory/Stock
  adjustStock(productId: number, quantity: number, type: 'purchase' | 'sale' | 'adjustment' | 'damage' | 'return', reason?: string, billId?: number): Promise<StockAdjustment>;
  getStockHistory(productId?: number): Promise<(StockAdjustment & { productName: string })[]>;
  getLowStockProducts(): Promise<Product[]>;
  getTopSellingProducts(limit?: number): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>>;
  getLeastSellingProducts(limit?: number): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>>;
}

export class DatabaseStorage implements IStorage {
  private getMirchiPowderItemCondition() {
    return sql`lower(trim(${billItems.name})) = ${MIRCHI_POWDER_ITEM_NAME}`;
  }

  private getCurrentCostProfitExpression() {
    return sql`
      coalesce(${billItems.subtotal}, ${billItems.price} * ${billItems.quantity})::numeric
      - coalesce(${billItems.costPrice}, 0)::numeric * ${billItems.quantity}
    `;
  }

  private async getMirchiPowderTotalsForRange(startDate: Date, endDate: Date): Promise<MirchiPowderTotals> {
    const currentCostProfit = this.getCurrentCostProfitExpression();
    const [row] = await db
      .select({
        sales: sum(billItems.subtotal),
        profit: sum(currentCostProfit),
      })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(
        and(
          eq(bills.status, "completed"),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`,
          this.getMirchiPowderItemCondition(),
        ),
      );

    return {
      sales: Number(row?.sales || 0),
      profit: Number(row?.profit || 0),
    };
  }

  private toDateKey(date: Date) {
    return getISTDateKey(date);
  }

  private getDayBounds(date: Date) {
    return getISTDayBounds(date);
  }

  private getDaysSince(value: Date | string | null | undefined) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }

  private async getCurrentLedgerBalance(customerId: number): Promise<number | undefined> {
    const ledger = await this.getCustomerLedger(customerId);
    return ledger[0]?.runningBalance;
  }

  private async getCustomerLedgerSummary(customerId: number): Promise<{
    totalGiven: number;
    totalReceived: number;
    balance: number;
  } | undefined> {
    const ledger = await this.getCustomerLedger(customerId);
    if (ledger.length === 0) return undefined;

    return {
      totalGiven: ledger
        .filter((entry) => entry.type === "CREDIT")
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      totalReceived: ledger
        .filter((entry) => entry.type === "PAYMENT")
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      balance: Number(ledger[0]?.runningBalance || 0),
    };
  }

  private async getCustomerListSummaries(customerIds: number[]): Promise<Map<number, CustomerListSummary>> {
    const summaries = new Map<number, CustomerListSummary>();
    if (customerIds.length === 0) return summaries;
    const currentCostProfit = this.getCurrentCostProfitExpression();

    const billRows = await db
      .select({
        customerId: bills.customerId,
        totalPurchased: sum(bills.totalAmount),
      })
      .from(bills)
      .where(
        and(
          eq(bills.status, "completed"),
          sql`${bills.customerId} IS NOT NULL`,
          inArray(bills.customerId, customerIds),
        ),
      )
      .groupBy(bills.customerId);

    const profitRows = await db
      .select({
        customerId: bills.customerId,
        totalProfit: sum(currentCostProfit),
      })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(
        and(
          eq(bills.status, "completed"),
          sql`${bills.customerId} IS NOT NULL`,
          inArray(bills.customerId, customerIds),
        ),
      )
      .groupBy(bills.customerId);

    const paymentRows = await db
      .select({
        customerId: payments.customerId,
        totalPaid: sum(payments.amount),
        lastPaymentDate: sql<Date | null>`max(${payments.date})`,
      })
      .from(payments)
      .where(inArray(payments.customerId, customerIds))
      .groupBy(payments.customerId);

    const billPaymentRows = await db
      .select({
        id: bills.id,
        customerId: bills.customerId,
        billPaidAmount: bills.billPaidAmount,
        oldBalancePaidAmount: bills.oldBalancePaidAmount,
      })
      .from(bills)
      .where(
        and(
          eq(bills.status, "completed"),
          sql`${bills.customerId} IS NOT NULL`,
          inArray(bills.customerId, customerIds),
        ),
      );

    const paymentDetailRows = await db
      .select({
        customerId: payments.customerId,
        billId: payments.billId,
        amount: payments.amount,
        note: payments.note,
      })
      .from(payments)
      .where(inArray(payments.customerId, customerIds));

    const missingStoredPayments = getMissingStoredBillPayments(billPaymentRows, paymentDetailRows);

    let manualCreditRows: Array<{ customerId: number; totalManualCredit: string | null }> = [];
    try {
      manualCreditRows = await db
        .select({
          customerId: ledgerEntries.customerId,
          totalManualCredit: sum(ledgerEntries.amount),
        })
        .from(ledgerEntries)
        .where(
          and(
            inArray(ledgerEntries.customerId, customerIds),
            eq(ledgerEntries.type, "CREDIT"),
            sql`${ledgerEntries.billId} IS NULL`,
          ),
        )
        .groupBy(ledgerEntries.customerId);
    } catch (error) {
      if (!isMissingLedgerTableError(error)) throw error;
    }

    const totalProfitAdjustments = new Map<number, number>();
    try {
      const adjustmentRows = await db
        .select()
        .from(customerProfitAdjustments)
        .where(inArray(customerProfitAdjustments.customerId, customerIds));

      const rowsByCustomer = new Map<number, CustomerProfitAdjustment[]>();
      for (const row of adjustmentRows) {
        const existing = rowsByCustomer.get(row.customerId) ?? [];
        existing.push(row);
        rowsByCustomer.set(row.customerId, existing);
      }

      rowsByCustomer.forEach((rows: CustomerProfitAdjustment[], customerId: number) => {
        const latestGlobalAdjustment = rows
          .filter((row) => !row.profitDate)
          .sort(
            (a: CustomerProfitAdjustment, b: CustomerProfitAdjustment) =>
              new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
          )[0];
        const datedAdjustmentTotal = rows
          .filter((row) => row.profitDate)
          .reduce((sum: number, row: CustomerProfitAdjustment) => sum + Number(row.amount || 0), 0);

        totalProfitAdjustments.set(
          customerId,
          Number(latestGlobalAdjustment?.amount || 0) + datedAdjustmentTotal,
        );
      });
    } catch (error) {
      if (
        isMissingTableError(error, "customer_profit_adjustments") ||
        isMissingColumnError(error, "profit_date")
      ) {
        try {
          const legacyAdjustmentRows = await db
            .select({
              customerId: customerProfitAdjustments.customerId,
              amount: customerProfitAdjustments.amount,
              createdAt: customerProfitAdjustments.createdAt,
            })
            .from(customerProfitAdjustments)
            .where(inArray(customerProfitAdjustments.customerId, customerIds))
            .orderBy(desc(customerProfitAdjustments.createdAt), desc(customerProfitAdjustments.id));

          for (const row of legacyAdjustmentRows) {
            if (!totalProfitAdjustments.has(row.customerId)) {
              totalProfitAdjustments.set(row.customerId, Number(row.amount || 0));
            }
          }
        } catch (legacyError) {
          if (!isMissingTableError(legacyError, "customer_profit_adjustments")) throw legacyError;
        }
      } else {
        throw error;
      }
    }

    for (const row of billRows) {
      if (row.customerId == null) continue;
      summaries.set(row.customerId, {
        totalPurchased: Number(row.totalPurchased || 0),
        totalPaid: 0,
        totalProfit: totalProfitAdjustments.get(row.customerId) ?? 0,
        totalGiven: Number(row.totalPurchased || 0),
        totalReceived: 0,
        balance: Number(row.totalPurchased || 0),
        lastPaymentDate: null,
        daysSinceLastPayment: null,
      });
    }

    for (const row of profitRows) {
      if (row.customerId == null) continue;
      const summary = summaries.get(row.customerId);
      if (!summary) continue;
      summary.totalProfit = Number(row.totalProfit || 0) + (totalProfitAdjustments.get(row.customerId) ?? 0);
    }

    for (const row of paymentRows) {
      const current = summaries.get(row.customerId) ?? {
        totalPurchased: 0,
        totalPaid: 0,
        totalProfit: totalProfitAdjustments.get(row.customerId) ?? 0,
        totalGiven: 0,
        totalReceived: 0,
        balance: 0,
        lastPaymentDate: null,
        daysSinceLastPayment: null,
      };
      const lastPaymentDate = row.lastPaymentDate ? new Date(row.lastPaymentDate).toISOString() : null;
      const totalPaid = Number(row.totalPaid || 0);
      const effectivePaid = totalPaid + (missingStoredPayments.get(row.customerId) ?? 0);
      current.totalPaid = effectivePaid;
      current.totalReceived = effectivePaid;
      current.lastPaymentDate = lastPaymentDate;
      current.daysSinceLastPayment = this.getDaysSince(row.lastPaymentDate);
      summaries.set(row.customerId, current);
    }

    for (const [customerId, missingPaid] of Array.from(missingStoredPayments.entries())) {
      const current = summaries.get(customerId) ?? {
        totalPurchased: 0,
        totalPaid: 0,
        totalProfit: totalProfitAdjustments.get(customerId) ?? 0,
        totalGiven: 0,
        totalReceived: 0,
        balance: 0,
        lastPaymentDate: null,
        daysSinceLastPayment: null,
      };
      if (!paymentRows.some((row) => row.customerId === customerId)) {
        current.totalPaid = missingPaid;
        current.totalReceived = missingPaid;
        summaries.set(customerId, current);
      }
    }

    for (const row of manualCreditRows) {
      const current = summaries.get(row.customerId) ?? {
        totalPurchased: 0,
        totalPaid: 0,
        totalProfit: totalProfitAdjustments.get(row.customerId) ?? 0,
        totalGiven: 0,
        totalReceived: 0,
        balance: 0,
        lastPaymentDate: null,
        daysSinceLastPayment: null,
      };
      current.totalGiven += Number(row.totalManualCredit || 0);
      summaries.set(row.customerId, current);
    }

    const ledgerSummaries = new Map<number, { totalGiven: number; totalReceived: number; balance: number }>();
    await Promise.all(
      customerIds.map(async (customerId) => {
        const ledgerSummary = await this.getCustomerLedgerSummary(customerId);
        if (ledgerSummary) {
          ledgerSummaries.set(customerId, ledgerSummary);
        }
      }),
    );

    for (const customerId of customerIds) {
      const current = summaries.get(customerId) ?? {
        totalPurchased: 0,
        totalPaid: 0,
        totalProfit: totalProfitAdjustments.get(customerId) ?? 0,
        totalGiven: 0,
        totalReceived: 0,
        balance: 0,
        lastPaymentDate: null,
        daysSinceLastPayment: null,
      };
      const ledgerSummary = ledgerSummaries.get(customerId);
      if (ledgerSummary) {
        current.totalGiven = ledgerSummary.totalGiven;
        current.totalReceived = ledgerSummary.totalReceived;
        current.balance = ledgerSummary.balance;
      } else {
        current.totalGiven = current.totalPurchased + (current.totalGiven - current.totalPurchased);
        current.totalReceived = current.totalPaid;
        current.balance = current.totalGiven - current.totalReceived;
      }
      summaries.set(customerId, current);
    }

    return summaries;
  }

  private async getAttendanceRows(staffId: number): Promise<StaffAttendance[]> {
    const rows = await db
      .select()
      .from(staffAttendance)
      .where(eq(staffAttendance.staffId, staffId))
      .orderBy(desc(staffAttendance.date), desc(staffAttendance.id));

    const uniqueRows: StaffAttendance[] = [];
    const duplicateIds: number[] = [];
    const seenDates = new Set<string>();

    for (const row of rows) {
      const dateKey = this.toDateKey(new Date(row.date));
      if (seenDates.has(dateKey)) {
        duplicateIds.push(row.id);
        continue;
      }

      seenDates.add(dateKey);
      uniqueRows.push(row);
    }

    if (duplicateIds.length > 0) {
      await db.delete(staffAttendance).where(inArray(staffAttendance.id, duplicateIds));
    }

    return uniqueRows;
  }

  private async findAttendanceForDate(staffId: number, date: Date): Promise<StaffAttendance | undefined> {
    const dateKey = this.toDateKey(date);
    const rows = await this.getAttendanceRows(staffId);
    return rows.find((row) => this.toDateKey(new Date(row.date)) === dateKey);
  }

  private async getStaffSummaryRecord(staffRecord: Staff): Promise<StaffSummary> {
    const attendance = await this.getAttendanceRows(staffRecord.id);
    const salaryPayments = await this.getStaffSalaryPaymentRows(staffRecord.id);
    const presentDays = attendance.filter((entry) => entry.status === "present").length;
    const absentDays = attendance.filter((entry) => entry.status === "absent").length;
    const attendancePaymentTotal = attendance.reduce(
      (sum, entry) => sum + getAttendancePaymentForStaff(staffRecord, entry),
      0,
    );
    const { start: monthStart, end: monthEnd } = getISTMonthBounds(new Date());
    const currentMonthAttendance = attendance.filter((entry) => {
      const entryDate = new Date(entry.date);
      return entryDate >= monthStart && entryDate <= monthEnd;
    });
    const currentMonthAttendancePayment = currentMonthAttendance.reduce(
      (sum, entry) => sum + getAttendancePaymentForStaff(staffRecord, entry),
      0,
    );
    const overallAdjustment = Number(staffRecord.overallPaymentAdjustment || 0);
    const salaryPaymentTotal = salaryPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const legacyTotalPayment = attendancePaymentTotal + overallAdjustment;
    const totalPayment = salaryPaymentTotal > 0 ? salaryPaymentTotal : legacyTotalPayment;
    const thisMonthPayable = currentMonthAttendancePayment;
    const todayAttendance = await this.findAttendanceForDate(staffRecord.id, new Date());

    return {
      presentDays,
      absentDays,
      attendancePaymentTotal,
      overallAdjustment,
      totalPayment,
      thisMonthPayable,
      todayStatus: (todayAttendance?.status as "present" | "absent" | undefined) || null,
      todayPayment: todayAttendance ? getAttendancePaymentForStaff(staffRecord, todayAttendance) : 0,
    };
  }

  async getStaff(): Promise<(Staff & { presentDays: number; absentDays: number; totalPayment: number; thisMonthPayable: number; todayStatus: "present" | "absent" | null; todayPayment: number })[]> {
    const allStaff = await db.select().from(staff).orderBy(desc(staff.id));
    return Promise.all(
      allStaff.map(async (member) => {
        const summary = await this.getStaffSummaryRecord(member);
        return {
          ...member,
          presentDays: summary.presentDays,
          absentDays: summary.absentDays,
          totalPayment: summary.totalPayment,
          thisMonthPayable: summary.thisMonthPayable,
          todayStatus: summary.todayStatus,
          todayPayment: summary.todayPayment,
        };
      }),
    );
  }

  async getStaffDetails(id: number): Promise<{ staff: Staff; summary: StaffSummary; attendance: StaffAttendance[]; payments: StaffSalaryPaymentView[] } | undefined> {
    const [staffRecord] = await db.select().from(staff).where(eq(staff.id, id));
    if (!staffRecord) return undefined;

    const [summary, attendance, payments] = await Promise.all([
      this.getStaffSummaryRecord(staffRecord),
      this.getAttendanceRows(id),
      this.getStaffSalaryPaymentRows(id),
    ]);

    return {
      staff: staffRecord,
      summary,
      attendance,
      payments: payments.map((payment) => ({
        id: payment.id,
        staffId: payment.staffId,
        rangeStart: payment.rangeStart.toISOString(),
        rangeEnd: payment.rangeEnd.toISOString(),
        amount: Number(payment.amount || 0),
        note: payment.note ?? null,
      })),
    };
  }

  private async getStaffSalaryPaymentRows(staffId: number): Promise<StaffSalaryPayment[]> {
    try {
      return await db
        .select()
        .from(staffSalaryPayments)
        .where(eq(staffSalaryPayments.staffId, staffId))
        .orderBy(desc(staffSalaryPayments.rangeStart), desc(staffSalaryPayments.id));
    } catch (error) {
      if (isMissingTableError(error, STAFF_SALARY_PAYMENTS_TABLE_NAME)) return [];
      throw error;
    }
  }

  async createStaff(data: Omit<Staff, "id" | "createdAt" | "overallPaymentAdjustment">): Promise<Staff> {
    const [staffRecord] = await db.insert(staff).values({
      name: data.name,
      phone: data.phone,
      salaryType: data.salaryType,
      salaryAmount: data.salaryAmount?.toString() || "0",
    }).returning();
    return staffRecord;
  }

  async markStaffAttendance(id: number, input: { date?: Date; status: "present" | "absent"; payment?: number }): Promise<StaffAttendance> {
    const [staffRecord] = await db.select().from(staff).where(eq(staff.id, id));
    if (!staffRecord) throw new Error("Staff member not found");

    const attendanceDate = input.date || new Date();
    const existing = await this.findAttendanceForDate(id, attendanceDate);
    const payment =
      input.payment ??
      (input.status === "present"
        ? staffRecord.salaryType === "monthly"
          ? getMonthlyDailySalary(staffRecord)
          : Number(staffRecord.salaryAmount || 0)
        : 0);

    if (existing) {
      const [updated] = await db
        .update(staffAttendance)
        .set({
          status: input.status,
          payment: payment.toFixed(2),
        })
        .where(eq(staffAttendance.id, existing.id))
        .returning();
      return updated;
    }

    const { start } = this.getDayBounds(attendanceDate);
    const [created] = await db.insert(staffAttendance).values({
      staffId: id,
      date: start,
      status: input.status,
      payment: payment.toFixed(2),
    }).returning();
    return created;
  }

  async updateStaffTodayPayment(id: number, payment: number, date?: Date): Promise<StaffAttendance> {
    const attendanceDate = date || new Date();
    const existing = await this.findAttendanceForDate(id, attendanceDate);
    if (!existing) {
      throw new Error("Attendance must be marked for the selected date before editing payment.");
    }

    const [updated] = await db
      .update(staffAttendance)
      .set({ payment: payment.toFixed(2) })
      .where(eq(staffAttendance.id, existing.id))
      .returning();
    return updated;
  }

  async updateStaffOverallPayment(id: number, totalPayment: number): Promise<{ staffId: number; totalPayment: number; overallAdjustment: number }> {
    const details = await this.getStaffDetails(id);
    if (!details) throw new Error("Staff member not found");

    const baseTotal = details.summary.attendancePaymentTotal;
    const overallAdjustment = totalPayment - baseTotal;

    await db
      .update(staff)
      .set({ overallPaymentAdjustment: overallAdjustment.toFixed(2) })
      .where(eq(staff.id, id));

    return {
      staffId: id,
      totalPayment,
      overallAdjustment,
    };
  }

  async updateStaffSalary(id: number, input: { salaryType: "daily" | "monthly"; salaryAmount: number; applyToRange?: boolean; rangeStart?: Date; rangeEnd?: Date }): Promise<Staff> {
    const [existing] = await db.select().from(staff).where(eq(staff.id, id));
    if (!existing) throw new Error("Staff member not found");

    const [updated] = await db
      .update(staff)
      .set({
        salaryType: input.salaryType,
        salaryAmount: input.salaryAmount.toFixed(2),
      })
      .where(eq(staff.id, id))
      .returning();

    if (input.salaryType === "daily" && input.applyToRange && input.rangeStart && input.rangeEnd) {
      const { start } = this.getDayBounds(input.rangeStart);
      const { end } = this.getDayBounds(input.rangeEnd);

      await db
        .update(staffAttendance)
        .set({ payment: input.salaryAmount.toFixed(2) })
        .where(
          and(
            eq(staffAttendance.staffId, id),
            eq(staffAttendance.status, "present"),
            sql`${staffAttendance.date} >= ${start}`,
            sql`${staffAttendance.date} <= ${end}`,
          ),
        );
    }

    return updated;
  }

  async getAccounts(): Promise<(Account & { currentBalance: number; totalSpent: number })[]> {
    const allAccounts = await db.select().from(accounts).orderBy(accounts.id);
    const enriched = await Promise.all(
      allAccounts.map(async (account) => {
        const details = await this.getAccountDetails(account.id);
        return {
          ...account,
          currentBalance: details?.currentBalance || Number(account.openingBalance || 0),
          totalSpent: details?.totalSpent || 0,
        };
      }),
    );
    return enriched;
  }

  async getAccount(id: number): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  }

  async getAccountDetails(id: number): Promise<{ account: Account; currentBalance: number; totalSpent: number; transactions: AccountTransactionWithCustomer[] } | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!account) return undefined;

    const transactions = await db
      .select()
      .from(accountTransactions)
      .where(eq(accountTransactions.accountId, id))
      .orderBy(desc(accountTransactions.date));

    const opening = Number(account.openingBalance || 0);
    const totalSpent = transactions
      .filter((t) => t.type === "spent")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalCredit = transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const accountPayments = await db.select().from(payments).where(sql`${payments.note} like ${`% (received in ${account.name})`}`);
    const transactionsWithCustomers = transactions.map((transaction) => {
      if (transaction.type !== "credit" || !transaction.note?.trim()) return transaction;

      const linkedPaymentNote = `${transaction.note.trim()} (received in ${account.name})`;
      const matchingPayments = accountPayments.filter(
        (payment) => payment.amount === transaction.amount && payment.note === linkedPaymentNote,
      );

      if (matchingPayments.length === 0) return transaction;

      const txnDateValue = transaction.date ? new Date(transaction.date).getTime() : Number.POSITIVE_INFINITY;
      const payment = matchingPayments.reduce((closest, current) => {
        const currentDistance = Math.abs(new Date(current.date ?? 0).getTime() - txnDateValue);
        const closestDistance = Math.abs(new Date(closest.date ?? 0).getTime() - txnDateValue);
        return currentDistance < closestDistance ? current : closest;
      });

      return { ...transaction, customerId: payment.customerId };
    });

    return {
      account,
      currentBalance: opening + totalCredit - totalSpent,
      totalSpent,
      transactions: transactionsWithCustomers,
    };
  }

  async createAccount(data: Omit<Account, "id" | "createdAt">): Promise<Account> {
    const [account] = await db.insert(accounts).values({
      name: data.name,
      openingBalance: data.openingBalance?.toString() || "0",
    }).returning();
    return account;
  }

  async spendFromAccount(
    id: number,
    amount: number,
    note: string,
    date?: Date,
    purchases?: Array<{ productId: number; quantity: number; costPrice?: number }>,
  ): Promise<AccountTransaction> {
    return db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, id));
      if (!account) throw new Error("Account not found");

      const transactions = await tx.select().from(accountTransactions).where(eq(accountTransactions.accountId, id));
      const opening = Number(account.openingBalance || 0);
      const totalSpent = transactions
        .filter((t) => t.type === "spent")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalCredit = transactions
        .filter((t) => t.type === "credit")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const [txn] = await tx.insert(accountTransactions).values({
        accountId: id,
        type: "spent",
        amount: amount.toString(),
        note,
        date: date || new Date(),
      }).returning();

      const purchaseLines = (purchases || []).filter((item) => item.quantity > 0);
      if (purchaseLines.length > 0) {
        const productRows = await tx
          .select({ id: products.id, costPrice: products.costPrice })
          .from(products)
          .where(inArray(products.id, purchaseLines.map((item) => item.productId)));
        const productCostPriceMap = new Map(productRows.map((row) => [row.id, row.costPrice]));

        for (const purchase of purchaseLines) {
          const previousCostPrice = productCostPriceMap.get(purchase.productId);
          await tx.insert(accountTransactionPurchases).values({
            accountTransactionId: txn.id,
            productId: purchase.productId,
            quantity: purchase.quantity,
            costPrice: purchase.costPrice !== undefined ? purchase.costPrice.toFixed(3) : null,
            previousCostPrice: previousCostPrice ?? null,
          });

          await adjustStockTransaction(
            tx as any,
            purchase.productId,
            purchase.quantity,
            "purchase",
            note,
          );
        }
      }

      return txn;
    });
  }

  async upsertStaffSalaryPayment(id: number, input: { rangeStart: Date; rangeEnd: Date; amount: number; note?: string }): Promise<StaffSalaryPaymentView> {
    const [staffRecord] = await db.select().from(staff).where(eq(staff.id, id));
    if (!staffRecord) throw new Error("Staff member not found");

    try {
      const existing = await db
        .select()
        .from(staffSalaryPayments)
        .where(
          and(
            eq(staffSalaryPayments.staffId, id),
            eq(staffSalaryPayments.rangeStart, input.rangeStart),
            eq(staffSalaryPayments.rangeEnd, input.rangeEnd),
          ),
        )
        .limit(1);

      const values = {
        staffId: id,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        amount: input.amount.toFixed(2),
        note: input.note?.trim() || null,
      };

      const [payment] = existing[0]
        ? await db
            .update(staffSalaryPayments)
            .set(values)
            .where(eq(staffSalaryPayments.id, existing[0].id))
            .returning()
        : await db
            .insert(staffSalaryPayments)
            .values(values)
            .returning();

      return {
        id: payment.id,
        staffId: payment.staffId,
        rangeStart: payment.rangeStart.toISOString(),
        rangeEnd: payment.rangeEnd.toISOString(),
        amount: Number(payment.amount || 0),
        note: payment.note ?? null,
      };
    } catch (error) {
      if (isMissingTableError(error, STAFF_SALARY_PAYMENTS_TABLE_NAME)) {
        throw new Error("Staff salary payment feature requires a database update. Run npm run db:push.");
      }
      throw error;
    }
  }

  async addToAccount(id: number, amount: number, note: string, customerId?: number): Promise<AccountTransaction> {
    return db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, id));
      if (!account) throw new Error("Account not found");

      let customerName: string | null = null;
      if (customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
        if (!customer) throw new Error("Customer not found");
        customerName = customer.name;
      }

      const [txn] = await tx.insert(accountTransactions).values({
        accountId: id,
        type: "credit",
        amount: amount.toString(),
        note,
      }).returning();

      if (customerId) {
        const paymentDate = new Date();
        const paymentNote = note?.trim()
          ? `${note.trim()} (received in ${account.name})`
          : `Received in ${account.name}${customerName ? ` from ${customerName}` : ""}`;

        await tx.insert(payments).values({
          customerId,
          billId: null,
          amount: amount.toString(),
          note: paymentNote,
          date: paymentDate,
        });

        try {
          await tx.insert(ledgerEntries).values({
            customerId,
            type: "PAYMENT",
            amount: amount.toString(),
            note: paymentNote,
            billId: null,
            createdAt: paymentDate,
          });
        } catch (error) {
          if (!isMissingLedgerTableError(error)) throw error;
        }
      }

      return txn;
    });
  }

  async updateAccountTransaction(
    accountId: number,
    transactionId: number,
    input: { amount: number; note: string; customerId?: number | null },
  ): Promise<AccountTransaction> {
    return db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
      if (!account) throw new Error("Account not found");

      const [txn] = await tx
        .select()
        .from(accountTransactions)
        .where(and(eq(accountTransactions.id, transactionId), eq(accountTransactions.accountId, accountId)));

      if (!txn) throw new Error("Transaction not found");

      const oldLinkedPaymentNote = txn.note?.trim()
        ? `${txn.note.trim()} (received in ${account.name})`
        : null;
      const newLinkedPaymentNote = `${input.note.trim()} (received in ${account.name})`;

      const [updatedTxn] = await tx
        .update(accountTransactions)
        .set({
          amount: input.amount.toString(),
          note: input.note.trim(),
        })
        .where(eq(accountTransactions.id, transactionId))
        .returning();

      if (txn.type === "credit" && input.customerId) {
        const [customer] = await tx.select().from(customers).where(eq(customers.id, input.customerId));
        if (!customer) throw new Error("Customer not found");
      }

      if (txn.type === "credit" && oldLinkedPaymentNote && input.customerId !== undefined) {
        const matchingPayments = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.amount, txn.amount), eq(payments.note, oldLinkedPaymentNote)));

        if (matchingPayments.length > 0) {
          const txnDateValue = txn.date ? new Date(txn.date).getTime() : Number.POSITIVE_INFINITY;
          const paymentToUpdate = matchingPayments.reduce((closest, current) => {
            const currentDistance = Math.abs(new Date(current.date ?? 0).getTime() - txnDateValue);
            const closestDistance = Math.abs(new Date(closest.date ?? 0).getTime() - txnDateValue);
            return currentDistance < closestDistance ? current : closest;
          });

          if (input.customerId === null) {
            await tx.delete(payments).where(eq(payments.id, paymentToUpdate.id));
          } else {
            await tx
              .update(payments)
              .set({
                customerId: input.customerId,
                amount: input.amount.toString(),
                note: newLinkedPaymentNote,
              })
              .where(eq(payments.id, paymentToUpdate.id));
          }

          try {
            const matchingLedgerEntries = await tx
              .select()
              .from(ledgerEntries)
              .where(
                and(
                  eq(ledgerEntries.customerId, paymentToUpdate.customerId),
                  eq(ledgerEntries.type, "PAYMENT"),
                  eq(ledgerEntries.amount, paymentToUpdate.amount),
                  eq(ledgerEntries.note, oldLinkedPaymentNote),
                  sql`${ledgerEntries.billId} IS NULL`,
                ),
              );

            if (matchingLedgerEntries.length > 0) {
              const ledgerToSave = matchingLedgerEntries.reduce((closest, current) => {
                const currentDistance = Math.abs(new Date(current.createdAt ?? 0).getTime() - txnDateValue);
                const closestDistance = Math.abs(new Date(closest.createdAt ?? 0).getTime() - txnDateValue);
                return currentDistance < closestDistance ? current : closest;
              });

              if (input.customerId === null) {
                await tx.delete(ledgerEntries).where(eq(ledgerEntries.id, ledgerToSave.id));
              } else {
                await tx
                  .update(ledgerEntries)
                  .set({
                    customerId: input.customerId,
                    amount: input.amount.toString(),
                    note: newLinkedPaymentNote,
                  })
                  .where(eq(ledgerEntries.id, ledgerToSave.id));
              }
            }
          } catch (error) {
            if (!isMissingLedgerTableError(error)) throw error;
          }
        } else if (input.customerId) {
          const paymentDate = txn.date ? new Date(txn.date) : new Date();
          await tx.insert(payments).values({
            customerId: input.customerId,
            billId: null,
            amount: input.amount.toString(),
            note: newLinkedPaymentNote,
            date: paymentDate,
          });

          try {
            await tx.insert(ledgerEntries).values({
              customerId: input.customerId,
              type: "PAYMENT",
              amount: input.amount.toString(),
              note: newLinkedPaymentNote,
              billId: null,
              createdAt: paymentDate,
            });
          } catch (error) {
            if (!isMissingLedgerTableError(error)) throw error;
          }
        }
      }

      return updatedTxn;
    });
  }

  async deleteAccountTransaction(accountId: number, transactionId: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
      if (!account) throw new Error("Account not found");

      const [txn] = await tx
        .select()
        .from(accountTransactions)
        .where(and(eq(accountTransactions.id, transactionId), eq(accountTransactions.accountId, accountId)));

      if (!txn) throw new Error("Transaction not found");

      const linkedPurchases = await tx
        .select()
        .from(accountTransactionPurchases)
        .where(eq(accountTransactionPurchases.accountTransactionId, transactionId));

      for (const purchase of linkedPurchases) {
        const [product] = await tx.select().from(products).where(eq(products.id, purchase.productId));
        if (!product) continue;

        const currentStock = Number(product.stock || 0);
        const reverseQuantity = Math.max(0, currentStock - Number(purchase.quantity || 0));

        await tx.update(products).set({ stock: reverseQuantity.toString() }).where(eq(products.id, purchase.productId));

        await tx.insert(stockAdjustments).values({
          productId: purchase.productId,
          quantity: -Math.abs(Number(purchase.quantity || 0)),
          type: "adjustment",
          reason: `Deleted account investment #${transactionId}${txn.note ? `: ${txn.note}` : ""}`,
        });

      }

      if (txn.type === "credit" && txn.note?.trim()) {
        const linkedPaymentNote = `${txn.note.trim()} (received in ${account.name})`;
        const matchingPayments = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.amount, txn.amount), eq(payments.note, linkedPaymentNote)));

        if (matchingPayments.length > 0) {
          const txnDateValue = txn.date ? new Date(txn.date).getTime() : Number.POSITIVE_INFINITY;
          const paymentToDelete = matchingPayments.reduce((closest, current) => {
            const currentDistance = Math.abs(new Date(current.date ?? 0).getTime() - txnDateValue);
            const closestDistance = Math.abs(new Date(closest.date ?? 0).getTime() - txnDateValue);
            return currentDistance < closestDistance ? current : closest;
          });

          await tx.delete(payments).where(eq(payments.id, paymentToDelete.id));

          try {
            const matchingLedgerEntries = await tx
              .select()
              .from(ledgerEntries)
              .where(
                and(
                  eq(ledgerEntries.customerId, paymentToDelete.customerId),
                  eq(ledgerEntries.type, "PAYMENT"),
                  eq(ledgerEntries.amount, paymentToDelete.amount),
                  eq(ledgerEntries.note, linkedPaymentNote),
                  sql`${ledgerEntries.billId} IS NULL`,
                ),
              );

            if (matchingLedgerEntries.length > 0) {
              const ledgerToDelete = matchingLedgerEntries.reduce((closest, current) => {
                const currentDistance = Math.abs(new Date(current.createdAt ?? 0).getTime() - txnDateValue);
                const closestDistance = Math.abs(new Date(closest.createdAt ?? 0).getTime() - txnDateValue);
                return currentDistance < closestDistance ? current : closest;
              });

              await tx.delete(ledgerEntries).where(eq(ledgerEntries.id, ledgerToDelete.id));
            }
          } catch (error) {
            if (!isMissingLedgerTableError(error)) throw error;
          }
        }
      }

      if (linkedPurchases.length > 0) {
        await tx.delete(accountTransactionPurchases).where(eq(accountTransactionPurchases.accountTransactionId, transactionId));
      }

      await tx.delete(accountTransactions).where(eq(accountTransactions.id, transactionId));
    });
  }

  async deleteAccountSafe(id: number): Promise<void> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!account) throw new Error("Account not found");

    const [txn] = await db
      .select({ id: accountTransactions.id })
      .from(accountTransactions)
      .where(eq(accountTransactions.accountId, id))
      .limit(1);

    if (txn) {
      throw new Error("Safe delete only works for accounts with no transaction history.");
    }

    await db.delete(accounts).where(eq(accounts.id, id));
  }

  async deleteAccountForce(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, id));
      if (!account) throw new Error("Account not found");

      await tx.delete(accountTransactions).where(eq(accountTransactions.accountId, id));
      await tx.delete(accounts).where(eq(accounts.id, id));
    });
  }

  async getInvestmentDetails(): Promise<{
    totalInvestment: number;
    accountSpentTotal: number;
    manualInvestmentTotal: number;
    entries: InvestmentHistoryEntry[];
  }> {
    const spentTransactions = await db
      .select({
        id: accountTransactions.id,
        accountId: accountTransactions.accountId,
        accountName: accounts.name,
        amount: accountTransactions.amount,
        note: accountTransactions.note,
        date: accountTransactions.date,
      })
      .from(accountTransactions)
      .innerJoin(accounts, eq(accountTransactions.accountId, accounts.id))
      .where(eq(accountTransactions.type, "spent"))
      .orderBy(desc(accountTransactions.date), desc(accountTransactions.id));

    const manualEntries = await db
      .select()
      .from(investmentEntries)
      .orderBy(desc(investmentEntries.date), desc(investmentEntries.id));

    const accountSpentTotal = spentTransactions.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const manualInvestmentTotal = manualEntries.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const entries = [
      ...spentTransactions.map((row) => ({
        id: row.id,
        source: "account_spent" as const,
        accountId: row.accountId,
        sourceLabel: row.accountName,
        amount: Number(row.amount || 0),
        note: row.note ?? null,
        date: row.date?.toISOString() || "",
      })),
      ...manualEntries.map((row) => ({
        id: row.id,
        source: "manual" as const,
        accountId: null,
        sourceLabel: "Manual Investment",
        amount: Number(row.amount || 0),
        note: row.note ?? null,
        date: row.date?.toISOString() || "",
      })),
    ].sort((a, b) => {
      const timeDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      return timeDiff !== 0 ? timeDiff : b.id - a.id;
    });

    return {
      totalInvestment: accountSpentTotal + manualInvestmentTotal,
      accountSpentTotal,
      manualInvestmentTotal,
      entries,
    };
  }

  async createInvestmentEntry(data: {
    amount: number;
    note: string;
    date?: Date;
    purchases?: Array<{ productId: number; quantity: number; costPrice?: number }>;
  }): Promise<InvestmentEntry> {
    return db.transaction(async (tx) => {
      const purchaseLines = (data.purchases || []).filter((item) => item.quantity > 0);
      const productRows = purchaseLines.length
        ? await tx
            .select({ id: products.id, name: products.name, costPrice: products.costPrice })
            .from(products)
            .where(inArray(products.id, purchaseLines.map((item) => item.productId)))
        : [];
      const productNameMap = new Map(productRows.map((row) => [row.id, row.name]));
      const productCostPriceMap = new Map(productRows.map((row) => [row.id, row.costPrice]));
      const purchaseSummary = purchaseLines.length
        ? purchaseLines
            .map((item) => {
              const name = productNameMap.get(item.productId) || `Product ${item.productId}`;
              return `${name} ${item.quantity}${item.costPrice !== undefined ? ` @ ${item.costPrice}` : ""}`;
            })
            .join(", ")
        : "";

      const [entry] = await tx
        .insert(investmentEntries)
        .values({
          amount: data.amount.toFixed(2),
          note: purchaseSummary ? `${data.note} | Items: ${purchaseSummary}` : data.note,
          date: data.date || new Date(),
        })
        .returning();

      for (const purchase of purchaseLines) {
        const previousCostPrice = productCostPriceMap.get(purchase.productId);

        await tx.insert(investmentEntryPurchases).values({
          investmentEntryId: entry.id,
          productId: purchase.productId,
          quantity: purchase.quantity,
          costPrice: purchase.costPrice !== undefined ? purchase.costPrice.toFixed(3) : null,
          previousCostPrice: previousCostPrice ?? null,
        });

        await adjustStockTransaction(
          tx as any,
          purchase.productId,
          purchase.quantity,
          "purchase",
          data.note,
        );
      }

      return entry;
    });
  }

  async deleteInvestmentEntry(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [entry] = await tx.select().from(investmentEntries).where(eq(investmentEntries.id, id));
      if (!entry) {
        throw new Error("Investment entry not found");
      }

      const purchaseRows = await tx
        .select()
        .from(investmentEntryPurchases)
        .where(eq(investmentEntryPurchases.investmentEntryId, id));

      for (const purchase of purchaseRows) {
        const [product] = await tx.select().from(products).where(eq(products.id, purchase.productId));
        if (!product) continue;

        const currentStock = Number(product.stock || 0);
        const reverseQuantity = Math.max(0, currentStock - Number(purchase.quantity || 0));

        await tx
          .update(products)
          .set({ stock: reverseQuantity.toString() })
          .where(eq(products.id, purchase.productId));

        await tx.insert(stockAdjustments).values({
          productId: purchase.productId,
          quantity: -Math.abs(Number(purchase.quantity || 0)),
          type: "adjustment",
          reason: `Deleted investment #${id}${entry.note ? `: ${entry.note}` : ""}`,
        });

      }

      await tx.delete(investmentEntryPurchases).where(eq(investmentEntryPurchases.investmentEntryId, id));
      await tx.delete(investmentEntries).where(eq(investmentEntries.id, id));
    });
  }

  async getCustomers(search?: string): Promise<(Customer & {
    balance: number;
    totalProfit?: number;
    totalGiven: number;
    totalReceived: number;
    lastPaymentDate: string | null;
    daysSinceLastPayment: number | null;
  })[]> {
    const whereClause = search ? sql`name ILIKE ${`%${search}%`} OR phone ILIKE ${`%${search}%`}` : undefined;
    const allCustomers = await db.select().from(customers).where(whereClause);

    const summaryMap = await this.getCustomerListSummaries(allCustomers.map((customer) => customer.id));

    return allCustomers
      .map((customer) => {
        const summary = summaryMap.get(customer.id);
        return {
          ...customer,
          balance: summary?.balance ?? 0,
          totalProfit: summary?.totalProfit ?? 0,
          totalGiven: summary?.totalGiven ?? 0,
          totalReceived: summary?.totalReceived ?? 0,
          lastPaymentDate: summary?.lastPaymentDate ?? null,
          daysSinceLastPayment: summary?.daysSinceLastPayment ?? null,
        };
      })
      .sort((a, b) => b.balance - a.balance);
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async getCustomerStats(id: number, profitDate?: Date, startDate?: Date, endDate?: Date): Promise<CustomerStats> {
    const currentCostProfit = this.getCurrentCostProfitExpression();
    const billSum = await db.select({ value: sum(bills.totalAmount) })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));
      
    const paymentSum = await db.select({ value: sum(payments.amount) })
      .from(payments)
      .where(eq(payments.customerId, id));

    const billPaymentRows = await db
      .select({
        id: bills.id,
        customerId: bills.customerId,
        billPaidAmount: bills.billPaidAmount,
        oldBalancePaidAmount: bills.oldBalancePaidAmount,
      })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, "completed")));

    const paymentDetailRows = await db
      .select({
        customerId: payments.customerId,
        billId: payments.billId,
        amount: payments.amount,
        note: payments.note,
      })
      .from(payments)
      .where(eq(payments.customerId, id));

    const missingStoredPayments = getMissingStoredBillPayments(billPaymentRows, paymentDetailRows).get(id) ?? 0;

    const profitSum = await db.select({ value: sum(currentCostProfit) })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));

    const selectedProfitDate = profitDate ? parseISTDateTime(profitDate) : new Date();
    const { start: selectedDayStart, end: selectedDayEnd } = this.getDayBounds(selectedProfitDate);
    const profitRangeStart = startDate ? this.getDayBounds(parseISTDateTime(startDate)).start : selectedDayStart;
    const profitRangeEnd = endDate ? this.getDayBounds(parseISTDateTime(endDate)).end : selectedDayEnd;

    const dailyProfitSum = await db.select({ value: sum(currentCostProfit) })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(
        and(
          eq(bills.customerId, id),
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${profitRangeStart}`,
          sql`${bills.date} <= ${profitRangeEnd}`,
        ),
      );

    let manualCreditTotal = 0;
    try {
      const manualCreditSum = await db.select({ value: sum(ledgerEntries.amount) })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.customerId, id),
            eq(ledgerEntries.type, "CREDIT"),
            sql`${ledgerEntries.billId} IS NULL`,
          ),
        );
      manualCreditTotal = Number(manualCreditSum[0]?.value || 0);
    } catch (error) {
      if (!isMissingLedgerTableError(error)) throw error;
    }

    const lastPaymentResult = await db.select({ value: payments.date })
      .from(payments)
      .where(eq(payments.customerId, id))
      .orderBy(desc(payments.date))
      .limit(1);

    const totalPurchased = Number(billSum[0]?.value || 0);
    const totalPaid = Number(paymentSum[0]?.value || 0) + missingStoredPayments;
    const baseTotalProfit = Number(profitSum[0]?.value || 0);
    const todayProfit = Number(dailyProfitSum[0]?.value || 0);
    const totalGiven = totalPurchased + manualCreditTotal;
    const totalReceived = totalPaid;
    const lastPaymentDate = lastPaymentResult[0]?.value ? lastPaymentResult[0].value.toISOString() : null;
    const daysSinceLastPayment = lastPaymentResult[0]?.value
      ? Math.floor(
          (Date.now() - new Date(lastPaymentResult[0].value).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

      let totalProfitAdjustment = 0;
      let dailyProfitAdjustment = 0;
      try {
        const adjustmentRows: CustomerProfitAdjustment[] = await db.select()
          .from(customerProfitAdjustments)
          .where(eq(customerProfitAdjustments.customerId, id));

        const latestGlobalAdjustment = adjustmentRows
          .filter((row) => !row.profitDate)
          .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];

        const latestDailyAdjustment = adjustmentRows
          .filter((row) => {
            if (!row.profitDate) return false;
            const rowDate = new Date(row.profitDate);
            return rowDate >= profitRangeStart && rowDate <= profitRangeEnd;
          })
          .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];

        totalProfitAdjustment =
          Number(latestGlobalAdjustment?.amount || 0) +
          adjustmentRows
            .filter((row) => row.profitDate)
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        dailyProfitAdjustment = Number(latestDailyAdjustment?.amount || 0);
      } catch (error) {
        if (
          isMissingTableError(error, "customer_profit_adjustments") ||
          isMissingColumnError(error, "profit_date")
        ) {
          try {
            const legacyAdjustmentRows = await db
              .select({
                amount: customerProfitAdjustments.amount,
                createdAt: customerProfitAdjustments.createdAt,
              })
              .from(customerProfitAdjustments)
              .where(eq(customerProfitAdjustments.customerId, id))
              .orderBy(desc(customerProfitAdjustments.createdAt), desc(customerProfitAdjustments.id))
              .limit(1);

            totalProfitAdjustment = Number(legacyAdjustmentRows[0]?.amount || 0);
            dailyProfitAdjustment = 0;
          } catch (legacyError) {
            if (!isMissingTableError(legacyError, "customer_profit_adjustments")) throw legacyError;
          }
        } else {
          throw error;
        }
      }
    
    const ledgerSummary = await this.getCustomerLedgerSummary(id);

    return {
      totalPurchased,
      totalPaid,
      balance: ledgerSummary?.balance ?? totalGiven - totalReceived,
        totalProfit: baseTotalProfit + totalProfitAdjustment,
        todayProfit: todayProfit + dailyProfitAdjustment,
      selectedProfitDate: selectedProfitDate.toISOString(),
      totalGiven: ledgerSummary?.totalGiven ?? totalGiven,
      totalReceived: ledgerSummary?.totalReceived ?? totalReceived,
      lastPaymentDate,
      daysSinceLastPayment,
    };
  }

  async getCustomerHistory(id: number): Promise<{ type: 'bill' | 'payment', date: string, amount: number, id: number }[]> {
    const customerBills = await db.select().from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')))
      .orderBy(desc(bills.date));
      
    const customerPayments = await db.select().from(payments)
      .where(eq(payments.customerId, id))
      .orderBy(desc(payments.date));

    const history = [
      ...customerBills.map(b => ({ type: 'bill' as const, date: b.date?.toISOString() || '', amount: Number(b.totalAmount), id: b.id })),
      ...customerPayments.map(p => ({ type: 'payment' as const, date: p.date?.toISOString() || '', amount: Number(p.amount), id: p.id }))
    ];

    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getCustomerLedger(id: number): Promise<CustomerLedgerView[]> {
    const customerBills = await db
      .select({
        id: bills.id,
        amount: bills.totalAmount,
        oldBalanceAmount: bills.oldBalanceAmount,
        grandTotal: bills.grandTotal,
        billPaidAmount: bills.billPaidAmount,
        oldBalancePaidAmount: bills.oldBalancePaidAmount,
        note: sql<string>`'Bill #' || ${bills.id}`,
        createdAt: bills.date,
        billId: bills.id,
      })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, "completed")));

    const customerPayments = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        note: payments.note,
        createdAt: payments.date,
        billId: payments.billId,
      })
      .from(payments)
      .where(eq(payments.customerId, id));

    let manualCredits: LedgerEntry[] = [];
    try {
      manualCredits = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.customerId, id),
            eq(ledgerEntries.type, "CREDIT"),
            sql`${ledgerEntries.billId} IS NULL`,
          ),
        );
    } catch (error) {
      if (!isMissingLedgerTableError(error)) throw error;
    }

    const persistedPaidByBillId = new Map<number, number>();
    const persistedPaidByOldBalanceNote = new Map<string, number>();
    for (const payment of customerPayments) {
      const amount = Number(payment.amount || 0);
      if (payment.billId) {
        persistedPaidByBillId.set(payment.billId, (persistedPaidByBillId.get(payment.billId) ?? 0) + amount);
      }
      if (payment.note) {
        persistedPaidByOldBalanceNote.set(payment.note, (persistedPaidByOldBalanceNote.get(payment.note) ?? 0) + amount);
      }
    }

    const storedPaymentFallbacks = customerBills.flatMap((bill) => {
      const billPaidAmount = Number(bill.billPaidAmount || 0);
      const oldBalancePaidAmount = Number(bill.oldBalancePaidAmount || 0);
      const rows: Array<{
        id: number;
        customerId: number;
        type: "PAYMENT";
        amount: number;
        note: string;
        billId: number | null;
        createdAt: string;
      }> = [];

      const missingBillPaid = Math.max(0, billPaidAmount - (persistedPaidByBillId.get(bill.id) ?? 0));
      if (missingBillPaid > 0) {
        rows.push({
          id: -bill.id * 2,
          customerId: id,
          type: "PAYMENT",
          amount: missingBillPaid,
          note: "Paid at time of bill",
          billId: bill.id,
          createdAt: bill.createdAt?.toISOString() || "",
        });
      }

      const oldBalanceNote = getOldBalancePaymentNote(bill.id);
      const missingOldBalancePaid = Math.max(
        0,
        oldBalancePaidAmount - (persistedPaidByOldBalanceNote.get(oldBalanceNote) ?? 0),
      );
      if (missingOldBalancePaid > 0) {
        rows.push({
          id: -bill.id * 2 - 1,
          customerId: id,
          type: "PAYMENT",
          amount: missingOldBalancePaid,
          note: oldBalanceNote,
          billId: null,
          createdAt: bill.createdAt?.toISOString() || "",
        });
      }

      return rows;
    });

    const rawPaymentEntries = [
      ...customerPayments.map((entry) => ({
        id: entry.id,
        customerId: id,
        type: "PAYMENT" as const,
        amount: Number(entry.amount || 0),
        note: entry.note ?? (entry.billId ? `Bill #${entry.billId}` : "Manual payment"),
        billId: entry.billId,
        createdAt: entry.createdAt?.toISOString() || "",
      })),
      ...storedPaymentFallbacks,
    ];

    const paymentEntries: Array<{
      id: number;
      customerId: number;
      type: "PAYMENT";
      amount: number;
      note: string | null;
      billId: number | null;
      createdAt: string;
    }> = [];
    const billTimePaymentGroups = new Map<string, (typeof paymentEntries)[number]>();

    for (const entry of rawPaymentEntries) {
      const oldBalanceBillId = getOldBalancePaymentBillId(entry.note);
      const billId = entry.billId ?? oldBalanceBillId;

      if (!billId) {
        paymentEntries.push({ ...entry, billId: entry.billId ?? null });
        continue;
      }

      const groupKey = String(billId);
      const existing = billTimePaymentGroups.get(groupKey);

      if (existing) {
        existing.amount += entry.amount;
        existing.id = Math.min(existing.id, entry.id);
      } else {
        const groupedEntry = {
          ...entry,
          id: entry.id,
          billId,
          note: getReceivedDuringBillNote(billId),
        };
        billTimePaymentGroups.set(groupKey, groupedEntry);
        paymentEntries.push(groupedEntry);
      }
    }

    const entries = [
      ...customerBills.map((entry) => ({
        id: entry.id,
        customerId: id,
        type: "CREDIT" as const,
        amount: Number(entry.amount || 0),
        note: entry.note ?? `Bill #${entry.id}`,
        billId: entry.billId,
        createdAt: entry.createdAt?.toISOString() || "",
      })),
      ...paymentEntries,
      ...manualCredits.map((entry) => ({
        id: entry.id,
        customerId: id,
        type: "CREDIT" as const,
        amount: Number(entry.amount || 0),
        note: entry.note ?? "Manual credit",
        billId: entry.billId ?? null,
        createdAt: entry.createdAt?.toISOString() || "",
      })),
    ].sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.type !== b.type) return a.type === "CREDIT" ? -1 : 1;
      return a.id - b.id;
    });

    let runningBalance = 0;
    const rows = entries.map((entry) => {
      runningBalance += entry.type === "CREDIT" ? entry.amount : -entry.amount;

      return {
        id: entry.id,
        customerId: entry.customerId,
        type: entry.type,
        amount: entry.amount,
        note: entry.note ?? null,
        billId: entry.billId ?? null,
        createdAt: entry.createdAt,
        runningBalance,
      };
    });

    return rows.reverse();
  }

  async createCustomer(data: Omit<Customer, "id" | "createdAt">): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }

  async updateCustomer(id: number, data: Partial<Omit<Customer, "id" | "createdAt">>): Promise<Customer> {
    const [customer] = await db.update(customers).set(data).where(eq(customers.id, id)).returning();
    return customer;
  }

  async deleteCustomer(id: number): Promise<void> {
    // Check if customer has bills
    const [bill] = await db.select().from(bills).where(eq(bills.customerId, id)).limit(1);
    if (bill) {
      throw new Error("Cannot delete customer with existing bills");
    }
    try {
      const [ledgerEntry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.customerId, id)).limit(1);
      if (ledgerEntry) {
        throw new Error("Cannot delete customer with existing ledger entries");
      }
    } catch (error) {
      if (!isMissingLedgerTableError(error)) throw error;
    }
    await db.delete(customers).where(eq(customers.id, id));
  }

  async createPayment(data: Omit<Payment, "id" | "date"> & { date?: Date; paymentAccountId?: number }): Promise<Payment> {
    return db.transaction(async (tx) => {
      const paymentDate = data.date || new Date();
      let paymentNote = data.note ?? null;

      if (data.paymentAccountId) {
        const [account] = await tx.select().from(accounts).where(eq(accounts.id, data.paymentAccountId));
        if (!account) throw new Error("Selected account not found");

        const [customer] = await tx.select().from(customers).where(eq(customers.id, data.customerId));
        if (!customer) throw new Error("Customer not found");

        paymentNote = paymentNote?.trim()
          ? `${paymentNote.trim()} (received in ${account.name})`
          : `Received in ${account.name} from ${customer.name}`;

        await tx.insert(accountTransactions).values({
          accountId: account.id,
          type: "credit",
          amount: data.amount.toString(),
          note: paymentNote,
          date: paymentDate,
        });
      }

      const [payment] = await tx.insert(payments).values({
        customerId: data.customerId,
        billId: data.billId ?? null,
        amount: data.amount.toString(),
        note: paymentNote,
        date: paymentDate,
      }).returning();

      try {
        await tx.insert(ledgerEntries).values({
          customerId: data.customerId,
          type: "PAYMENT",
          amount: data.amount.toString(),
          note: paymentNote,
          billId: data.billId ?? null,
          createdAt: paymentDate,
        });
      } catch (error) {
        if (!isMissingLedgerTableError(error)) throw error;
      }

      return payment;
    });
  }

  async deleteCustomerPayment(customerId: number, paymentId: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.id, paymentId), eq(payments.customerId, customerId)));

      if (!payment) throw new Error("Payment not found");
      if (payment.billId) throw new Error("Bill-linked payments must be changed from the bill itself");

      const accountLink = parseAccountLinkedPaymentNote(payment.note);
      if (accountLink) {
        const [account] = await tx.select().from(accounts).where(eq(accounts.name, accountLink.accountName));
        if (account) {
          const matchingTransactions = await tx
            .select()
            .from(accountTransactions)
            .where(
              and(
                eq(accountTransactions.accountId, account.id),
                eq(accountTransactions.type, "credit"),
                eq(accountTransactions.amount, payment.amount),
                eq(accountTransactions.note, accountLink.accountTxnNote),
              ),
            );

          if (matchingTransactions.length > 0) {
            const paymentDateValue = payment.date ? new Date(payment.date).getTime() : Number.POSITIVE_INFINITY;
            const txnToDelete = matchingTransactions.reduce((closest, current) => {
              const currentDistance = Math.abs(new Date(current.date ?? 0).getTime() - paymentDateValue);
              const closestDistance = Math.abs(new Date(closest.date ?? 0).getTime() - paymentDateValue);
              return currentDistance < closestDistance ? current : closest;
            });

            await tx.delete(accountTransactions).where(eq(accountTransactions.id, txnToDelete.id));
          }
        }
      }

      try {
        const noteCondition =
          payment.note == null
            ? sql`${ledgerEntries.note} IS NULL`
            : eq(ledgerEntries.note, payment.note);
        await tx
          .delete(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.customerId, customerId),
              eq(ledgerEntries.type, "PAYMENT"),
              eq(ledgerEntries.amount, payment.amount),
              noteCondition,
              sql`${ledgerEntries.billId} IS NULL`,
            ),
          );
      } catch (error) {
        if (!isMissingLedgerTableError(error)) throw error;
      }

      await tx.delete(payments).where(eq(payments.id, paymentId));
    });
  }

  async setCustomerTotalProfit(id: number, totalProfit: number): Promise<{ customerId: number; totalProfit: number; adjustment: number }> {
    const currentCostProfit = this.getCurrentCostProfitExpression();
    const profitSum = await db.select({ value: sum(currentCostProfit) })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));

    const baseTotalProfit = Number(profitSum[0]?.value || 0);
    const adjustment = totalProfit - baseTotalProfit;

    try {
        await db.transaction(async (tx) => {
          await tx
            .delete(customerProfitAdjustments)
            .where(
              and(
                eq(customerProfitAdjustments.customerId, id),
                sql`${customerProfitAdjustments.profitDate} IS NULL`,
              ),
            );
          await tx.insert(customerProfitAdjustments).values({
            customerId: id,
            amount: adjustment.toFixed(2),
            profitDate: null,
          });
        });
    } catch (error) {
      if (isMissingTableError(error, "customer_profit_adjustments")) {
        throw new Error("Profit edit requires a database update. Run npm run db:push.");
      }
      throw error;
    }

      return {
        customerId: id,
        totalProfit,
        adjustment,
      };
    }

  async setCustomerDailyProfit(id: number, profitDate: Date, totalProfit: number): Promise<{ customerId: number; profitDate: string; totalProfit: number; adjustment: number }> {
    const { start, end } = this.getDayBounds(profitDate);
    const currentCostProfit = this.getCurrentCostProfitExpression();
    const profitSum = await db.select({ value: sum(currentCostProfit) })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(
        and(
          eq(bills.customerId, id),
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${start}`,
          sql`${bills.date} <= ${end}`,
        ),
      );

    const baseDailyProfit = Number(profitSum[0]?.value || 0);
    const adjustment = totalProfit - baseDailyProfit;

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(customerProfitAdjustments)
          .where(
            and(
              eq(customerProfitAdjustments.customerId, id),
              sql`${customerProfitAdjustments.profitDate} >= ${start}`,
              sql`${customerProfitAdjustments.profitDate} <= ${end}`,
            ),
          );
        await tx.insert(customerProfitAdjustments).values({
          customerId: id,
          amount: adjustment.toFixed(2),
          profitDate: start,
        });
      });
    } catch (error) {
      if (isMissingTableError(error, "customer_profit_adjustments")) {
        throw new Error("Day-wise profit edit requires a database update. Run npm run db:push.");
      }
      throw error;
    }

    return {
      customerId: id,
      profitDate: start.toISOString(),
      totalProfit,
      adjustment,
    };
  }

  async createLedgerCredit(entry: {
    customerId: number;
    amount: number;
    note?: string;
    billId?: number | null;
    createdAt?: Date;
  }): Promise<LedgerEntry> {
    let ledgerEntry: LedgerEntry[];
    try {
      ledgerEntry = await db.insert(ledgerEntries).values({
        customerId: entry.customerId,
        type: "CREDIT",
        amount: entry.amount.toString(),
        note: entry.note ?? null,
        billId: entry.billId ?? null,
        createdAt: entry.createdAt || new Date(),
      }).returning();
    } catch (error) {
      if (isMissingLedgerTableError(error)) {
        throw new Error("Ledger feature requires a database update. Run npm run db:push.");
      }
      throw error;
    }

      return ledgerEntry[0];
    }

  async deleteCustomerCredit(customerId: number, entryId: number): Promise<void> {
    try {
      const [entry] = await db
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.id, entryId),
            eq(ledgerEntries.customerId, customerId),
            eq(ledgerEntries.type, "CREDIT"),
            sql`${ledgerEntries.billId} IS NULL`,
          ),
        );

      if (!entry) throw new Error("Credit entry not found");

      await db.delete(ledgerEntries).where(eq(ledgerEntries.id, entryId));
    } catch (error) {
      if (isMissingLedgerTableError(error)) {
        throw new Error("Ledger feature requires a database update. Run npm run db:push.");
      }
      throw error;
    }
  }

  async getProducts(search?: string): Promise<Product[]> {
    if (search) {
      return db
        .select()
        .from(products)
        .where(and(eq(products.isActive, true), sql`name ILIKE ${`%${search}%`}`))
        .orderBy(sql`lower(${products.name})`, products.id);
    }
    return db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(sql`lower(${products.name})`, products.id);
  }

  async createProduct(data: Omit<Product, "id">): Promise<Product> {
    const trimmedName = data.name.trim();
    const trimmedSku = data.sku?.trim() || null;
    const normalizedName = trimmedName.toLowerCase();
    const [existingProduct] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`lower(${products.name}) = ${normalizedName}`,
        ),
      );

    if (existingProduct) {
      throw new Error("A product with this name already exists");
    }

    const [product] = await db.insert(products).values({
      ...data,
      name: trimmedName,
      price: data.price?.toString(),
      costPrice: data.costPrice?.toString() || "0",
      primaryUnit: data.primaryUnit || "PCS",
      secondaryUnit: data.secondaryUnit ?? null,
      unitConversion: data.unitConversion ?? null,
      sku: trimmedSku,
      stock: String(data.stock ?? 0),
      lowStockThreshold: String(data.lowStockThreshold ?? 10),
    }).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<Omit<Product, "id">>): Promise<Product> {
    const updateData: any = {};
    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      const normalizedName = trimmedName.toLowerCase();
      const [existingProduct] = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.isActive, true),
            sql`lower(${products.name}) = ${normalizedName}`,
            sql`${products.id} <> ${id}`,
          ),
        );

      if (existingProduct) {
        throw new Error("A product with this name already exists");
      }

      updateData.name = trimmedName;
    }
    // `Product.price` / `costPrice` are `string | null` in the inferred select type.
    // Guard against null before calling `.toString()`.
    if (data.price != null) {
      const price = Number(data.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error("Invalid selling price");
      }
      updateData.price = price.toString();
    }
    if (data.costPrice != null) {
      const costPrice = Number(data.costPrice);
      if (!Number.isFinite(costPrice) || costPrice < 0) {
        throw new Error("Invalid cost price");
      }
      updateData.costPrice = costPrice.toString();
    }
    if (data.primaryUnit !== undefined) updateData.primaryUnit = data.primaryUnit;
    if (data.secondaryUnit !== undefined) updateData.secondaryUnit = data.secondaryUnit ?? null;
    if (data.unitConversion !== undefined) updateData.unitConversion = data.unitConversion ?? null;
    if (data.sku !== undefined) updateData.sku = data.sku?.trim() || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.stock !== undefined) {
      const stock = Number(data.stock);
      if (!Number.isFinite(stock) || stock < 0) {
        throw new Error("Invalid stock");
      }
      updateData.stock = stock.toString();
    }
    if (data.lowStockThreshold !== undefined) {
      const lowStockThreshold = Number(data.lowStockThreshold);
      if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
        throw new Error("Invalid low stock threshold");
      }
      updateData.lowStockThreshold = lowStockThreshold.toString();
    }
    
    const [product] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
    if (!product) {
      throw new Error("Product not found");
    }
    return product;
  }

  async deleteProduct(id: number): Promise<void> {
    // Soft-delete so historical bills referencing this product remain valid.
    const [product] = await db
      .update(products)
      .set({ isActive: false })
      .where(eq(products.id, id))
      .returning({ id: products.id });

    if (!product) {
      throw new Error("Product not found");
    }
  }

  async getQuotations(): Promise<(Quotation & { customerName: string | null })[]> {
    const results = await db
      .select({
        quotation: quotations,
        customerName: customers.name,
      })
      .from(quotations)
      .leftJoin(customers, eq(quotations.customerId, customers.id))
      .orderBy(desc(quotations.date), desc(quotations.id));

    return results.map((row) => ({ ...row.quotation, customerName: row.customerName }));
  }

  async getQuotation(
    id: number,
  ): Promise<(Quotation & { items: QuotationItem[]; charges: QuotationCharge[]; customer: Customer | null; convertedBill: Bill | null }) | undefined> {
    const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id));
    if (!quotation) return undefined;

    const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));
    const charges = await db
      .select()
      .from(quotationCharges)
      .where(eq(quotationCharges.quotationId, id))
      .orderBy(quotationCharges.position, quotationCharges.id);

    let customer: Customer | null = null;
    if (quotation.customerId) {
      [customer] = await db.select().from(customers).where(eq(customers.id, quotation.customerId));
    }

    let convertedBill: Bill | null = null;
    if (quotation.convertedBillId) {
      [convertedBill] = await db.select().from(bills).where(eq(bills.id, quotation.convertedBillId));
    }

    return {
      ...quotation,
      items,
      charges,
      customer,
      convertedBill,
    };
  }

  async createQuotation(data: CreateQuotationRequest): Promise<Quotation> {
    return db.transaction(async (tx) => {
      const normalizedCharges = (data.extraCharges || [])
        .map((charge) => ({
          label: charge.label.trim(),
          amount: Number(charge.amount || 0),
        }))
        .filter((charge) => charge.label.length > 0 && charge.amount >= 0);
      const normalizedItems = data.items.map((item) => ({
        productId: item.productId ?? null,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit || "PCS",
        baseQuantity: item.baseQuantity ?? item.quantity,
        baseUnit: item.baseUnit || item.unit || "PCS",
        price: item.price,
        costPrice: item.costPrice ?? 0,
        subtotal: item.quantity * item.price,
      }));
      const subtotalAmount = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const extraChargesTotal = normalizedCharges.reduce((sum, charge) => sum + charge.amount, 0);
      const totalAmount = subtotalAmount + extraChargesTotal;
      const quotationDate = data.date ? parseISTDateTime(data.date) : new Date();

      const [quotation] = await tx
        .insert(quotations)
        .values({
          customerId: data.customerId ?? null,
          date: quotationDate,
          subtotalAmount: subtotalAmount.toFixed(2),
          extraChargesTotal: extraChargesTotal.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          notes: data.notes?.trim() || null,
          status: "draft",
          lastEditedAt: data.editedBy?.trim() ? new Date() : null,
          lastEditedBy: data.editedBy?.trim() || null,
        })
        .returning();

      for (const item of normalizedItems) {
        await tx.insert(quotationItems).values({
          quotationId: quotation.id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          baseQuantity: item.baseQuantity,
          baseUnit: item.baseUnit,
          price: item.price.toFixed(2),
          costPrice: item.costPrice.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
        });
      }

      for (let index = 0; index < normalizedCharges.length; index += 1) {
        const charge = normalizedCharges[index];
        await tx.insert(quotationCharges).values({
          quotationId: quotation.id,
          label: charge.label,
          amount: charge.amount.toFixed(2),
          position: index,
        });
      }

      return quotation;
    });
  }

  async updateQuotation(id: number, data: UpdateQuotationRequest): Promise<Quotation> {
    return db.transaction(async (tx) => {
      const [existingQuotation] = await tx.select().from(quotations).where(eq(quotations.id, id));
      if (!existingQuotation) throw new Error("Quotation not found");
      if (existingQuotation.status === "converted") {
        throw new Error("Converted quotations cannot be edited");
      }

      const normalizedCharges = (data.extraCharges || [])
        .map((charge) => ({
          label: charge.label.trim(),
          amount: Number(charge.amount || 0),
        }))
        .filter((charge) => charge.label.length > 0 && charge.amount >= 0);
      const normalizedItems = data.items.map((item) => ({
        productId: item.productId ?? null,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit || "PCS",
        baseQuantity: item.baseQuantity ?? item.quantity,
        baseUnit: item.baseUnit || item.unit || "PCS",
        price: item.price,
        costPrice: item.costPrice ?? 0,
        subtotal: item.quantity * item.price,
      }));
      const subtotalAmount = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const extraChargesTotal = normalizedCharges.reduce((sum, charge) => sum + charge.amount, 0);
      const totalAmount = subtotalAmount + extraChargesTotal;

      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
      await tx.delete(quotationCharges).where(eq(quotationCharges.quotationId, id));

      const [quotation] = await tx
        .update(quotations)
        .set({
          customerId: data.customerId ?? null,
          date: data.date ? parseISTDateTime(data.date) : existingQuotation.date,
          subtotalAmount: subtotalAmount.toFixed(2),
          extraChargesTotal: extraChargesTotal.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          notes: data.notes?.trim() || null,
          lastEditedAt: new Date(),
          lastEditedBy: data.editedBy?.trim() || null,
        })
        .where(eq(quotations.id, id))
        .returning();

      for (const item of normalizedItems) {
        await tx.insert(quotationItems).values({
          quotationId: id,
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          baseQuantity: item.baseQuantity,
          baseUnit: item.baseUnit,
          price: item.price.toFixed(2),
          costPrice: item.costPrice.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
        });
      }

      for (let index = 0; index < normalizedCharges.length; index += 1) {
        const charge = normalizedCharges[index];
        await tx.insert(quotationCharges).values({
          quotationId: id,
          label: charge.label,
          amount: charge.amount.toFixed(2),
          position: index,
        });
      }

      return quotation;
    });
  }

  async updateQuotationStatus(
    id: number,
    status: "draft" | "sent" | "accepted" | "rejected",
  ): Promise<Quotation> {
    const [existingQuotation] = await db.select().from(quotations).where(eq(quotations.id, id));
    if (!existingQuotation) throw new Error("Quotation not found");
    if (existingQuotation.status === "converted") {
      throw new Error("Converted quotations cannot change status");
    }

    const [quotation] = await db
      .update(quotations)
      .set({
        status,
        lastEditedAt: new Date(),
      })
      .where(eq(quotations.id, id))
      .returning();

    return quotation;
  }

  async convertQuotationToBill(id: number): Promise<{ quotation: Quotation; bill: Bill }> {
    return db.transaction(async (tx) => {
      const [quotation] = await tx.select().from(quotations).where(eq(quotations.id, id));
      if (!quotation) throw new Error("Quotation not found");
      if (quotation.status === "converted" && quotation.convertedBillId) {
        throw new Error("Quotation is already converted");
      }

      const items = await tx.select().from(quotationItems).where(eq(quotationItems.quotationId, id));
      const charges = await tx
        .select()
        .from(quotationCharges)
        .where(eq(quotationCharges.quotationId, id))
        .orderBy(quotationCharges.position, quotationCharges.id);

      const bill = await createBillTransaction(tx as any, {
        customerId: quotation.customerId ?? undefined,
        items: items.map((item) => ({
          productId: item.productId ?? undefined,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit as any,
          baseQuantity: item.baseQuantity ?? undefined,
          baseUnit: item.baseUnit as any,
          price: Number(item.price || 0),
          costPrice: Number(item.costPrice || 0),
        })),
        extraCharges: charges.map((charge) => ({
          label: charge.label,
          amount: Number(charge.amount || 0),
        })),
        paidAmount: 0,
      });

      const [updatedQuotation] = await tx
        .update(quotations)
        .set({
          status: "converted",
          convertedBillId: bill.id,
          lastEditedAt: new Date(),
          lastEditedBy: quotation.lastEditedBy ?? null,
        })
        .where(eq(quotations.id, id))
        .returning();

      return {
        quotation: updatedQuotation,
        bill,
      };
    });
  }

  async getBills(): Promise<(Bill & { customerName: string | null })[]> {
    const results = await db.select({
      bill: bills,
      customerName: customers.name
    })
      .from(bills)
      .leftJoin(customers, eq(bills.customerId, customers.id))
      .where(eq(bills.status, 'completed'))
      .orderBy(desc(bills.id));

    return results.map(r => ({ ...r.bill, customerName: r.customerName }));
  }

  async getBill(id: number): Promise<(Bill & { items: BillItem[]; charges: BillCharge[]; customer: Customer | null }) | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, id));
    if (!bill) return undefined;

    const items = await db.select().from(billItems).where(eq(billItems.billId, id));
    const charges = await db
      .select()
      .from(billCharges)
      .where(eq(billCharges.billId, id))
      .orderBy(billCharges.position, billCharges.id);
    let customer = null;
    if (bill.customerId) {
      [customer] = await db.select().from(customers).where(eq(customers.id, bill.customerId));
    }

    let billPaidAmount = Number(bill.billPaidAmount || 0);
    let oldBalancePaidAmount = Number(bill.oldBalancePaidAmount || 0);

    if (bill.customerId) {
      const billLinkedPayments = await db
        .select({ amount: sum(payments.amount) })
        .from(payments)
        .where(eq(payments.billId, id));

      const oldBalancePayments = await db
        .select({ amount: sum(payments.amount) })
        .from(payments)
        .where(
          and(
            eq(payments.customerId, bill.customerId),
            sql`${payments.billId} IS NULL`,
            eq(payments.note, `Old balance payment during bill #${id}`),
          ),
        );

      billPaidAmount = Number(billLinkedPayments[0]?.amount || 0);
      oldBalancePaidAmount = Number(oldBalancePayments[0]?.amount || 0);

      if (billPaidAmount <= 0 && Number(bill.billPaidAmount || 0) > 0) {
        billPaidAmount = Number(bill.billPaidAmount || 0);
      }
      if (oldBalancePaidAmount <= 0 && Number(bill.oldBalancePaidAmount || 0) > 0) {
        oldBalancePaidAmount = Number(bill.oldBalancePaidAmount || 0);
      }
    }

    return {
      ...bill,
      billPaidAmount: billPaidAmount.toFixed(2),
      oldBalancePaidAmount: oldBalancePaidAmount.toFixed(2),
      items,
      charges,
      customer: customer || null,
    };
  }

  async getPreviousBillForCustomer(customerId: number): Promise<(Bill & { items: BillItem[]; charges: BillCharge[] }) | undefined> {
    const [bill] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.customerId, customerId), eq(bills.status, "completed")))
      .orderBy(desc(bills.date), desc(bills.id))
      .limit(1);
    if (!bill) return undefined;

    const items = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, bill.id))
      .orderBy(billItems.id);
    const charges = await db
      .select()
      .from(billCharges)
      .where(eq(billCharges.billId, bill.id))
      .orderBy(billCharges.position, billCharges.id);

    return {
      ...bill,
      items,
      charges,
    };
  }

  async getLastBilledItemMemory(
    customerId: number,
    lookup: { productId?: number; name?: string },
  ): Promise<{
    productId: number | null;
    name: string;
    quantity: number;
    unit: string;
    price: number;
    costPrice: number;
    billId: number;
    billDate: string;
  } | null> {
    const trimmedName = lookup.name?.trim();
    if (!lookup.productId && !trimmedName) return null;

    const filters = [
      eq(bills.customerId, customerId),
      eq(bills.status, "completed"),
      lookup.productId
        ? eq(billItems.productId, lookup.productId)
        : sql`lower(${billItems.name}) = lower(${trimmedName as string})`,
    ];

    const [latestItem] = await db
      .select({
        productId: billItems.productId,
        name: billItems.name,
        quantity: billItems.quantity,
        unit: billItems.unit,
        price: billItems.price,
        costPrice: billItems.costPrice,
        billId: billItems.billId,
        billDate: bills.date,
      })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .where(and(...filters))
      .orderBy(desc(bills.date), desc(billItems.id))
      .limit(1);

    if (!latestItem?.billDate) return null;

    return {
      productId: latestItem.productId ?? null,
      name: latestItem.name,
      quantity: Number(latestItem.quantity || 0),
      unit: latestItem.unit || "PCS",
      price: Number(latestItem.price || 0),
      costPrice: Number(latestItem.costPrice || 0),
      billId: latestItem.billId,
      billDate: latestItem.billDate.toISOString(),
    };
  }

  async createBill(data: CreateBillRequest): Promise<Bill> {
    return createBillTransaction(db as any, data);
  }

  async updateBill(id: number, data: UpdateBillRequest): Promise<Bill> {
    return updateBillTransaction(db as any, id, data);
  }

  async deleteBill(id: number): Promise<void> {
    await deleteBillTransaction(db as any, id);
  }

  async getDashboardStats(): Promise<{ todaySales: number; todayProfit: number; mirchiPowderSales: number; mirchiPowderProfit: number; totalDue: number; activeCustomers: number }> {
    const { start: todayStart, end: todayEnd } = this.getDayBounds(new Date());
    const currentCostProfit = this.getCurrentCostProfitExpression();

    const salesRes = await db.select({ value: sum(bills.totalAmount) })
      .from(bills)
      .where(and(eq(bills.status, 'completed'), sql`${bills.date} >= ${todayStart}`, sql`${bills.date} <= ${todayEnd}`));

    const profitRes = await db.select({ value: sum(currentCostProfit) })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(and(eq(bills.status, 'completed'), sql`${bills.date} >= ${todayStart}`, sql`${bills.date} <= ${todayEnd}`));
    const mirchiPowderTotals = await this.getMirchiPowderTotalsForRange(todayStart, todayEnd);

    const customerRows = await db.select({ id: customers.id }).from(customers);
    const customerSummaries = await this.getCustomerListSummaries(customerRows.map((customer) => customer.id));
    const totalDue = Array.from(customerSummaries.values())
      .filter((customer) => Number(customer.balance || 0) > 0)
      .reduce((sum, customer) => sum + Number(customer.balance || 0), 0);

    return {
      todaySales: Number(salesRes[0]?.value || 0) - mirchiPowderTotals.sales,
      todayProfit: Number(profitRes[0]?.value || 0) - mirchiPowderTotals.profit,
      mirchiPowderSales: mirchiPowderTotals.sales,
      mirchiPowderProfit: mirchiPowderTotals.profit,
      totalDue,
      activeCustomers: customerRows.length,
    };
  }

  async adjustStock(productId: number, quantity: number, type: 'purchase' | 'sale' | 'adjustment' | 'damage' | 'return', reason?: string, billId?: number): Promise<StockAdjustment> {
    return adjustStockTransaction(db as any, productId, quantity, type, reason, billId);
  }

  async getStockHistory(productId?: number): Promise<(StockAdjustment & { productName: string })[]> {
    let query = db.select({
      adjustment: stockAdjustments,
      productName: products.name,
    })
      .from(stockAdjustments)
      .innerJoin(products, eq(stockAdjustments.productId, products.id))
      .orderBy(desc(stockAdjustments.date));

    if (productId) {
      query = query.where(eq(stockAdjustments.productId, productId)) as any;
    }

    const results = await query;
    return results.map(r => ({ ...r.adjustment, productName: r.productName }));
  }

  async getLowStockProducts(): Promise<Product[]> {
    return db.select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`${products.stock} <= ${products.lowStockThreshold}`
        )
      )
      .orderBy(products.stock);
  }

  async getTopSellingProducts(limit: number = 10): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>> {
    const rankingQuantity = sql`
      case
        when ${products.secondaryUnit} = 'GRAMS'
          or (${products.secondaryUnit} is null and ${products.primaryUnit} in ('KG', 'GRAMS'))
        then coalesce(${billItems.baseQuantity}, ${billItems.quantity})::numeric / 1000
        else coalesce(${billItems.baseQuantity}, ${billItems.quantity})::numeric
      end
    `;

    const results = await db.select({
      productId: billItems.productId,
      productName: billItems.name,
      totalQuantity: sum(sql`coalesce(${billItems.baseQuantity}, ${billItems.quantity})`),
      totalRevenue: sum(billItems.subtotal),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(eq(bills.status, 'completed'))
      .groupBy(billItems.productId, billItems.name)
      .orderBy(desc(sum(rankingQuantity)))
      .limit(limit);

    return results.map(r => ({
      productId: r.productId,
      productName: r.productName,
      totalQuantity: Number(r.totalQuantity || 0),
      totalRevenue: Number(r.totalRevenue || 0),
    }));
  }

  async getLeastSellingProducts(limit: number = 10): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>> {
    const rankingQuantity = sql`
      case
        when ${products.secondaryUnit} = 'GRAMS'
          or (${products.secondaryUnit} is null and ${products.primaryUnit} in ('KG', 'GRAMS'))
        then coalesce(${billItems.baseQuantity}, ${billItems.quantity})::numeric / 1000
        else coalesce(${billItems.baseQuantity}, ${billItems.quantity})::numeric
      end
    `;

    const results = await db.select({
      productId: billItems.productId,
      productName: billItems.name,
      totalQuantity: sum(sql`coalesce(${billItems.baseQuantity}, ${billItems.quantity})`),
      totalRevenue: sum(billItems.subtotal),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(eq(bills.status, 'completed'))
      .groupBy(billItems.productId, billItems.name)
      .orderBy(sum(rankingQuantity))
      .limit(limit);

    return results.map(r => ({
      productId: r.productId,
      productName: r.productName,
      totalQuantity: Number(r.totalQuantity || 0),
      totalRevenue: Number(r.totalRevenue || 0),
    }));
  }

  async getProfitReport(startDate: Date, endDate: Date): Promise<{
    totalSales: number;
    totalProfit: number;
    totalInvestment: number;
    mirchiPowderSales: number;
    mirchiPowderProfit: number;
    mirchiPowderInvestment: number;
    mirchiPowderCustomers: Array<{
      customerId: number | null;
      customerName: string;
      totalQuantity: number;
      unit: string;
      totalSales: number;
      totalProfit: number;
      details: Array<{
        billId: number;
        date: Date | string;
        quantity: number;
        unit: string;
        rate: number;
        sales: number;
        profit: number;
      }>;
    }>;
  }> {
    const currentCostProfit = this.getCurrentCostProfitExpression();
    const billsInRange = await db
      .select({
        id: bills.id,
        customerId: bills.customerId,
        date: bills.date,
        totalAmount: bills.totalAmount,
      })
      .from(bills)
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`
        )
      );
    const mirchiPowderTotals = await this.getMirchiPowderTotalsForRange(startDate, endDate);
    const [profitRow] = await db
      .select({
        totalProfit: sum(currentCostProfit),
      })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`
        )
      );

    const totalSales = billsInRange.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0) - mirchiPowderTotals.sales;
    const totalProfit = Number(profitRow?.totalProfit || 0) - mirchiPowderTotals.profit;
    
    // Calculate total investment (cost of goods sold)
    // Investment = Total Sales - Total Profit
    const totalInvestment = totalSales - totalProfit;
    const mirchiPowderInvestment = mirchiPowderTotals.sales - mirchiPowderTotals.profit;
    const mirchiPowderCustomers = await db.select({
      customerId: bills.customerId,
      customerName: customers.name,
      totalQuantity: sum(billItems.quantity),
      unit: billItems.unit,
      totalSales: sum(billItems.subtotal),
      totalProfit: sum(currentCostProfit),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .leftJoin(customers, eq(bills.customerId, customers.id))
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`,
          this.getMirchiPowderItemCondition(),
        ),
      )
      .groupBy(bills.customerId, customers.name, billItems.unit)
      .orderBy(desc(sum(billItems.quantity)));

    const mirchiPowderDetails = await db.select({
      customerId: bills.customerId,
      customerName: customers.name,
      billId: bills.id,
      date: bills.date,
      quantity: billItems.quantity,
      unit: billItems.unit,
      rate: billItems.price,
      sales: billItems.subtotal,
      profit: currentCostProfit,
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .leftJoin(customers, eq(bills.customerId, customers.id))
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`,
          this.getMirchiPowderItemCondition(),
        ),
      )
      .orderBy(desc(bills.date), desc(bills.id));

    const mirchiPowderDetailsByCustomer = new Map<string, Array<{
      billId: number;
      date: Date | string;
      quantity: number;
      unit: string;
      rate: number;
      sales: number;
      profit: number;
    }>>();

    for (const row of mirchiPowderDetails) {
      const customerKey = `${row.customerId ?? "walk-in"}::${row.unit || "PCS"}`;
      const existingDetails = mirchiPowderDetailsByCustomer.get(customerKey) ?? [];
      existingDetails.push({
        billId: row.billId,
        date: row.date ?? startDate,
        quantity: Number(row.quantity || 0),
        unit: row.unit || "PCS",
        rate: Number(row.rate || 0),
        sales: Number(row.sales || 0),
        profit: Number(row.profit || 0),
      });
      mirchiPowderDetailsByCustomer.set(customerKey, existingDetails);
    }

    return {
      totalSales,
      totalProfit,
      totalInvestment,
      mirchiPowderSales: mirchiPowderTotals.sales,
      mirchiPowderProfit: mirchiPowderTotals.profit,
      mirchiPowderInvestment,
      mirchiPowderCustomers: mirchiPowderCustomers.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName || "Walk-in Customer",
        totalQuantity: Number(row.totalQuantity || 0),
        unit: row.unit || "PCS",
        totalSales: Number(row.totalSales || 0),
        totalProfit: Number(row.totalProfit || 0),
        details: mirchiPowderDetailsByCustomer.get(`${row.customerId ?? "walk-in"}::${row.unit || "PCS"}`) ?? [],
      })),
    };
  }

  async getCustomerProfitReport(startDate: Date, endDate: Date): Promise<Array<{
    customerId: number | null;
    customerName: string;
    totalSales: number;
    totalProfit: number;
    items: Array<{
      productId: number | null;
      itemName: string;
      quantity: number;
      unit: string;
      totalSales: number;
      totalProfit: number;
    }>;
  }>> {
    const currentCostProfit = this.getCurrentCostProfitExpression();
    const totalsByCustomer = await db.select({
      customerId: bills.customerId,
      customerName: customers.name,
      totalSales: sum(billItems.subtotal),
      totalProfit: sum(currentCostProfit),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .leftJoin(customers, eq(bills.customerId, customers.id))
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`,
          sql`not (${this.getMirchiPowderItemCondition()})`,
        )
      )
      .groupBy(bills.customerId, customers.name)
      .orderBy(desc(sum(currentCostProfit)));

    const itemRows = await db.select({
      customerId: bills.customerId,
      productId: billItems.productId,
      itemName: billItems.name,
      unit: sql<string>`coalesce(${billItems.unit}, 'PCS')`,
      quantity: sum(billItems.quantity),
      totalSales: sum(billItems.subtotal),
      totalProfit: sum(currentCostProfit),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .leftJoin(products, eq(billItems.productId, products.id))
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`,
          sql`not (${this.getMirchiPowderItemCondition()})`,
        )
      )
      .groupBy(bills.customerId, billItems.productId, billItems.name, billItems.unit)
      .orderBy(desc(sum(currentCostProfit)));

    const itemsByCustomer = new Map<string | number, Array<{
      productId: number | null;
      itemName: string;
      quantity: number;
      unit: string;
      totalSales: number;
      totalProfit: number;
    }>>();

    for (const row of itemRows) {
      const key = row.customerId ?? "walk-in";
      const existingItems = itemsByCustomer.get(key) ?? [];
      existingItems.push({
        productId: row.productId,
        itemName: row.itemName,
        quantity: Number(row.quantity || 0),
        unit: row.unit || "PCS",
        totalSales: Number(row.totalSales || 0),
        totalProfit: Number(row.totalProfit || 0),
      });
      itemsByCustomer.set(key, existingItems);
    }

    return totalsByCustomer.map(r => {
      return {
        customerId: r.customerId,
        customerName: r.customerName || 'Walk-in Customer',
        totalSales: Number(r.totalSales || 0),
        totalProfit: Number(r.totalProfit || 0),
        items: itemsByCustomer.get(r.customerId ?? "walk-in") ?? [],
      };
    });
  }
}

export const storage = new DatabaseStorage();
