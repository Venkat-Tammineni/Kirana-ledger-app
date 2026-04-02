
import { db } from "./db";
import {
  customers, products, bills, billItems, billCharges, quotations, quotationItems, quotationCharges, payments, customerProfitAdjustments, ledgerEntries, stockAdjustments, accounts, staff, staffAttendance, accountTransactions, investmentEntries,
  type Customer, type Product, type Bill, type BillItem, type BillCharge, type Quotation, type QuotationItem, type QuotationCharge, type Payment, type CustomerProfitAdjustment, type LedgerEntry, type StockAdjustment, type Account, type Staff, type StaffAttendance, type AccountTransaction, type InvestmentEntry,
  type CreateBillRequest,
  type UpdateBillRequest,
  type CreateQuotationRequest,
  type UpdateQuotationRequest,
} from "@shared/schema";
import { eq, desc, sql, sum, and, inArray } from "drizzle-orm";
import { createBillTransaction, updateBillTransaction } from "./services/billing-service";
import { adjustStockTransaction } from "./services/inventory-service";
import { getISTDateKey, getISTDayBounds, getISTMonthBounds, parseISTDateTime } from "@shared/timezone";

const LEDGER_TABLE_NAME = "ledger_entries";

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

type InvestmentHistoryEntry = {
  id: number;
  source: "account_spent" | "manual";
  sourceLabel: string;
  amount: number;
  note: string | null;
  date: string;
};

export interface IStorage {
  // Staff
  getStaff(): Promise<(Staff & { presentDays: number; absentDays: number; totalPayment: number; thisMonthPayable: number; todayStatus: "present" | "absent" | null; todayPayment: number })[]>;
  getStaffDetails(id: number): Promise<{ staff: Staff; summary: StaffSummary; attendance: StaffAttendance[] } | undefined>;
  createStaff(data: Omit<Staff, "id" | "createdAt" | "overallPaymentAdjustment">): Promise<Staff>;
  markStaffAttendance(id: number, input: { date?: Date; status: "present" | "absent"; payment?: number }): Promise<StaffAttendance>;
  updateStaffTodayPayment(id: number, payment: number, date?: Date): Promise<StaffAttendance>;
  updateStaffOverallPayment(id: number, totalPayment: number): Promise<{ staffId: number; totalPayment: number; overallAdjustment: number }>;

  // Accounts
  getAccounts(): Promise<(Account & { currentBalance: number; totalSpent: number })[]>;
  getAccount(id: number): Promise<Account | undefined>;
  getAccountDetails(id: number): Promise<{ account: Account; currentBalance: number; totalSpent: number; transactions: AccountTransaction[] } | undefined>;
  createAccount(account: Omit<Account, "id" | "createdAt">): Promise<Account>;
  spendFromAccount(id: number, amount: number, note: string): Promise<AccountTransaction>;
  addToAccount(id: number, amount: number, note: string): Promise<AccountTransaction>;
  deleteAccountSafe(id: number): Promise<void>;
  deleteAccountForce(id: number): Promise<void>;
  getInvestmentDetails(): Promise<{
    totalInvestment: number;
    accountSpentTotal: number;
    manualInvestmentTotal: number;
    entries: InvestmentHistoryEntry[];
  }>;
  createInvestmentEntry(data: { amount: number; note: string; date?: Date }): Promise<InvestmentEntry>;

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
  getCustomerStats(id: number, profitDate?: Date): Promise<CustomerStats>;
  getCustomerHistory(id: number): Promise<{ type: 'bill' | 'payment', date: string, amount: number, id: number }[]>;
  getCustomerLedger(id: number): Promise<CustomerLedgerView[]>;
  createCustomer(customer: Omit<Customer, "id" | "createdAt">): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<Omit<Customer, "id" | "createdAt">>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  createPayment(payment: Omit<Payment, "id" | "date"> & { date?: Date }): Promise<Payment>;
  setCustomerTotalProfit(id: number, totalProfit: number): Promise<{ customerId: number; totalProfit: number; adjustment: number }>;
  createLedgerCredit(entry: {
    customerId: number;
    amount: number;
    note?: string;
    billId?: number | null;
    createdAt?: Date;
  }): Promise<LedgerEntry>;
  
  // Products
  getProducts(search?: string): Promise<Product[]>;
  createProduct(product: Omit<Product, "id">): Promise<Product>;
  updateProduct(id: number, product: Partial<Omit<Product, "id">>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Bills
  getBills(): Promise<(Bill & { customerName: string | null })[]>;
  getBill(id: number): Promise<(Bill & { items: BillItem[]; charges: BillCharge[]; customer: Customer | null }) | undefined>;
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
  getDashboardStats(): Promise<{ todaySales: number; todayProfit: number; totalDue: number; activeCustomers: number }>;
  
  // Reporting
  getProfitReport(startDate: Date, endDate: Date): Promise<{ totalSales: number; totalProfit: number; totalInvestment: number }>;
  getCustomerProfitReport(startDate: Date, endDate: Date): Promise<Array<{ customerId: number | null; customerName: string; totalSales: number; totalProfit: number }>>;
  
  // Inventory/Stock
  adjustStock(productId: number, quantity: number, type: 'purchase' | 'sale' | 'adjustment' | 'damage' | 'return', reason?: string, billId?: number): Promise<StockAdjustment>;
  getStockHistory(productId?: number): Promise<(StockAdjustment & { productName: string })[]>;
  getLowStockProducts(): Promise<Product[]>;
  getTopSellingProducts(limit?: number): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>>;
  getLeastSellingProducts(limit?: number): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>>;
}

export class DatabaseStorage implements IStorage {
  private toDateKey(date: Date) {
    return getISTDateKey(date);
  }

  private getDayBounds(date: Date) {
    return getISTDayBounds(date);
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
    const presentDays = attendance.filter((entry) => entry.status === "present").length;
    const absentDays = attendance.filter((entry) => entry.status === "absent").length;
    const attendancePaymentTotal = attendance.reduce((sum, entry) => sum + Number(entry.payment || 0), 0);
    const { start: monthStart, end: monthEnd } = getISTMonthBounds(new Date());
    const currentMonthAttendance = attendance.filter((entry) => {
      const entryDate = new Date(entry.date);
      return entryDate >= monthStart && entryDate <= monthEnd;
    });
    const currentMonthAttendancePayment = currentMonthAttendance.reduce(
      (sum, entry) => sum + Number(entry.payment || 0),
      0,
    );
    const overallAdjustment = Number(staffRecord.overallPaymentAdjustment || 0);
    const totalPayment =
      (staffRecord.salaryType === "monthly"
        ? Number(staffRecord.salaryAmount || 0) + attendancePaymentTotal
        : attendancePaymentTotal) + overallAdjustment;
    const thisMonthPayable =
      staffRecord.salaryType === "monthly"
        ? Number(staffRecord.salaryAmount || 0)
        : currentMonthAttendancePayment;
    const todayAttendance = await this.findAttendanceForDate(staffRecord.id, new Date());

    return {
      presentDays,
      absentDays,
      attendancePaymentTotal,
      overallAdjustment,
      totalPayment,
      thisMonthPayable,
      todayStatus: (todayAttendance?.status as "present" | "absent" | undefined) || null,
      todayPayment: Number(todayAttendance?.payment || 0),
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

  async getStaffDetails(id: number): Promise<{ staff: Staff; summary: StaffSummary; attendance: StaffAttendance[] } | undefined> {
    const [staffRecord] = await db.select().from(staff).where(eq(staff.id, id));
    if (!staffRecord) return undefined;

    const [summary, attendance] = await Promise.all([
      this.getStaffSummaryRecord(staffRecord),
      this.getAttendanceRows(id),
    ]);

    return {
      staff: staffRecord,
      summary,
      attendance,
    };
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
      (input.status === "present" && staffRecord.salaryType === "daily"
        ? Number(staffRecord.salaryAmount || 0)
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

    const baseTotal =
      (details.staff.salaryType === "monthly"
        ? Number(details.staff.salaryAmount || 0) + details.summary.attendancePaymentTotal
        : details.summary.attendancePaymentTotal);
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

  async getAccounts(): Promise<(Account & { currentBalance: number; totalSpent: number })[]> {
    const allAccounts = await db.select().from(accounts).orderBy(desc(accounts.id));
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

  async getAccountDetails(id: number): Promise<{ account: Account; currentBalance: number; totalSpent: number; transactions: AccountTransaction[] } | undefined> {
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

    return {
      account,
      currentBalance: opening + totalCredit - totalSpent,
      totalSpent,
      transactions,
    };
  }

  async createAccount(data: Omit<Account, "id" | "createdAt">): Promise<Account> {
    const [account] = await db.insert(accounts).values({
      name: data.name,
      openingBalance: data.openingBalance?.toString() || "0",
    }).returning();
    return account;
  }

  async spendFromAccount(id: number, amount: number, note: string): Promise<AccountTransaction> {
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
      const currentBalance = opening + totalCredit - totalSpent;

      if (amount > currentBalance) {
        throw new Error("Insufficient account balance");
      }

      const [txn] = await tx.insert(accountTransactions).values({
        accountId: id,
        type: "spent",
        amount: amount.toString(),
        note,
      }).returning();
      return txn;
    });
  }

  async addToAccount(id: number, amount: number, note: string): Promise<AccountTransaction> {
    return db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, id));
      if (!account) throw new Error("Account not found");

      const [txn] = await tx.insert(accountTransactions).values({
        accountId: id,
        type: "credit",
        amount: amount.toString(),
        note,
      }).returning();

      return txn;
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
        sourceLabel: row.accountName,
        amount: Number(row.amount || 0),
        note: row.note ?? null,
        date: row.date?.toISOString() || "",
      })),
      ...manualEntries.map((row) => ({
        id: row.id,
        source: "manual" as const,
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

  async createInvestmentEntry(data: { amount: number; note: string; date?: Date }): Promise<InvestmentEntry> {
    const [entry] = await db
      .insert(investmentEntries)
      .values({
        amount: data.amount.toFixed(2),
        note: data.note,
        date: data.date || new Date(),
      })
      .returning();
    return entry;
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
    
    const results = await Promise.all(allCustomers.map(async (c) => {
      const stats = await this.getCustomerStats(c.id);
      return {
        ...c,
        balance: stats.balance,
        totalProfit: stats.totalProfit,
        totalGiven: stats.totalGiven,
        totalReceived: stats.totalReceived,
        lastPaymentDate: stats.lastPaymentDate,
        daysSinceLastPayment: stats.daysSinceLastPayment,
      };
    }));
    
    return results.sort((a, b) => b.balance - a.balance); 
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async getCustomerStats(id: number, profitDate?: Date): Promise<CustomerStats> {
    const billSum = await db.select({ value: sum(bills.totalAmount) })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));
      
    const paymentSum = await db.select({ value: sum(payments.amount) })
      .from(payments)
      .where(eq(payments.customerId, id));

    const profitSum = await db.select({ value: sum(bills.totalProfit) })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));

    const selectedProfitDate = profitDate ? parseISTDateTime(profitDate) : new Date();
    const { start: profitRangeStart, end: profitRangeEnd } = this.getDayBounds(selectedProfitDate);

    const dailyProfitSum = await db.select({ value: sum(bills.totalProfit) })
      .from(bills)
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
    const totalPaid = Number(paymentSum[0]?.value || 0);
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

    let profitAdjustment = 0;
    try {
      const adjustmentRows: CustomerProfitAdjustment[] = await db.select()
        .from(customerProfitAdjustments)
        .where(eq(customerProfitAdjustments.customerId, id))
        .orderBy(desc(customerProfitAdjustments.createdAt), desc(customerProfitAdjustments.id))
        .limit(1);
      profitAdjustment = Number(adjustmentRows[0]?.amount || 0);
    } catch (error) {
      if (!isMissingTableError(error, "customer_profit_adjustments")) throw error;
    }
    
    return {
      totalPurchased,
      totalPaid,
      balance: totalGiven - totalReceived,
      totalProfit: baseTotalProfit + profitAdjustment,
      todayProfit,
      selectedProfitDate: selectedProfitDate.toISOString(),
      totalGiven,
      totalReceived,
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
      ...customerPayments.map((entry) => ({
        id: entry.id,
        customerId: id,
        type: "PAYMENT" as const,
        amount: Number(entry.amount || 0),
        note: entry.note ?? (entry.billId ? `Bill #${entry.billId}` : "Manual payment"),
        billId: entry.billId,
        createdAt: entry.createdAt?.toISOString() || "",
      })),
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
      return timeDiff !== 0 ? timeDiff : a.id - b.id;
    });

    let runningBalance = 0;
    const rows = entries.map((entry) => {
      runningBalance += entry.type === "CREDIT" ? entry.amount : -entry.amount;
      return {
        ...entry,
        note: entry.note ?? null,
        billId: entry.billId ?? null,
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

  async createPayment(data: Omit<Payment, "id" | "date"> & { date?: Date }): Promise<Payment> {
    return db.transaction(async (tx) => {
      const paymentDate = data.date || new Date();
      const [payment] = await tx.insert(payments).values({
        customerId: data.customerId,
        billId: data.billId ?? null,
        amount: data.amount.toString(),
        note: data.note ?? null,
        date: paymentDate,
      }).returning();

      try {
        await tx.insert(ledgerEntries).values({
          customerId: data.customerId,
          type: "PAYMENT",
          amount: data.amount.toString(),
          note: data.note ?? null,
          billId: data.billId ?? null,
          createdAt: paymentDate,
        });
      } catch (error) {
        if (!isMissingLedgerTableError(error)) throw error;
      }

      return payment;
    });
  }

  async setCustomerTotalProfit(id: number, totalProfit: number): Promise<{ customerId: number; totalProfit: number; adjustment: number }> {
    const profitSum = await db.select({ value: sum(bills.totalProfit) })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));

    const baseTotalProfit = Number(profitSum[0]?.value || 0);
    const adjustment = totalProfit - baseTotalProfit;

    try {
      await db.transaction(async (tx) => {
        await tx.delete(customerProfitAdjustments).where(eq(customerProfitAdjustments.customerId, id));
        await tx.insert(customerProfitAdjustments).values({
          customerId: id,
          amount: adjustment.toFixed(2),
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

  async getProducts(search?: string): Promise<Product[]> {
    if (search) {
      return db
        .select()
        .from(products)
        .where(and(eq(products.isActive, true), sql`name ILIKE ${`%${search}%`}`));
    }
    return db.select().from(products).where(eq(products.isActive, true)).limit(50);
  }

  async createProduct(data: Omit<Product, "id">): Promise<Product> {
    const [product] = await db.insert(products).values({
      ...data,
      price: data.price?.toString(),
      costPrice: data.costPrice?.toString() || "0",
      primaryUnit: data.primaryUnit || "PCS",
      secondaryUnit: data.secondaryUnit ?? null,
      unitConversion: data.unitConversion ?? null,
      stock: data.stock ?? 0,
      lowStockThreshold: data.lowStockThreshold ?? 10,
    }).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<Omit<Product, "id">>): Promise<Product> {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    // `Product.price` / `costPrice` are `string | null` in the inferred select type.
    // Guard against null before calling `.toString()`.
    if (data.price != null) updateData.price = data.price.toString();
    if (data.costPrice != null) updateData.costPrice = data.costPrice.toString();
    if (data.primaryUnit !== undefined) updateData.primaryUnit = data.primaryUnit;
    if (data.secondaryUnit !== undefined) updateData.secondaryUnit = data.secondaryUnit ?? null;
    if (data.unitConversion !== undefined) updateData.unitConversion = data.unitConversion ?? null;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.stock !== undefined) updateData.stock = data.stock;
    if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = data.lowStockThreshold;
    
    const [product] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
    return product;
  }

  async deleteProduct(id: number): Promise<void> {
    // Soft-delete so historical bills referencing this product remain valid.
    await db.update(products).set({ isActive: false }).where(eq(products.id, id));
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
    .orderBy(desc(bills.date));

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

  async createBill(data: CreateBillRequest): Promise<Bill> {
    return createBillTransaction(db as any, data);
  }

  async updateBill(id: number, data: UpdateBillRequest): Promise<Bill> {
    return updateBillTransaction(db as any, id, data);
  }

  async deleteBill(id: number): Promise<void> {
    await db.update(bills).set({ status: 'voided' }).where(eq(bills.id, id));
  }

  async getDashboardStats(): Promise<{ todaySales: number; todayProfit: number; totalDue: number; activeCustomers: number }> {
    const { start: today } = this.getDayBounds(new Date());
    
    const salesRes = await db.select({ value: sum(bills.totalAmount) })
      .from(bills)
      .where(and(eq(bills.status, 'completed'), sql`date >= ${today}`));

    const profitRes = await db.select({ value: sum(bills.totalProfit) })
      .from(bills)
      .where(and(eq(bills.status, 'completed'), sql`date >= ${today}`));

    const customerSummaries = await this.getCustomers();
    const customersCount = await db.select({ count: sql<number>`count(*)` }).from(customers);

    return {
      todaySales: Number(salesRes[0]?.value || 0),
      todayProfit: Number(profitRes[0]?.value || 0),
      totalDue: customerSummaries
        .filter((customer) => Number(customer.balance || 0) > 0)
        .reduce((sum, customer) => sum + Number(customer.balance || 0), 0),
      activeCustomers: Number(customersCount[0]?.count || 0)
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
    const results = await db.select({
      productId: billItems.productId,
      productName: billItems.name,
      totalQuantity: sum(sql`coalesce(${billItems.baseQuantity}, ${billItems.quantity})`),
      totalRevenue: sum(billItems.subtotal),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .where(eq(bills.status, 'completed'))
      .groupBy(billItems.productId, billItems.name)
      .orderBy(desc(sum(sql`coalesce(${billItems.baseQuantity}, ${billItems.quantity})`)))
      .limit(limit);

    return results.map(r => ({
      productId: r.productId,
      productName: r.productName,
      totalQuantity: Number(r.totalQuantity || 0),
      totalRevenue: Number(r.totalRevenue || 0),
    }));
  }

  async getLeastSellingProducts(limit: number = 10): Promise<Array<{ productId: number | null; productName: string; totalQuantity: number; totalRevenue: number }>> {
    const results = await db.select({
      productId: billItems.productId,
      productName: billItems.name,
      totalQuantity: sum(sql`coalesce(${billItems.baseQuantity}, ${billItems.quantity})`),
      totalRevenue: sum(billItems.subtotal),
    })
      .from(billItems)
      .innerJoin(bills, eq(billItems.billId, bills.id))
      .where(eq(bills.status, 'completed'))
      .groupBy(billItems.productId, billItems.name)
      .orderBy(sum(sql`coalesce(${billItems.baseQuantity}, ${billItems.quantity})`))
      .limit(limit);

    return results.map(r => ({
      productId: r.productId,
      productName: r.productName,
      totalQuantity: Number(r.totalQuantity || 0),
      totalRevenue: Number(r.totalRevenue || 0),
    }));
  }

  async getProfitReport(startDate: Date, endDate: Date): Promise<{ totalSales: number; totalProfit: number; totalInvestment: number }> {
    // Get all completed bills in date range
    const billsInRange = await db.select()
      .from(bills)
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`
        )
      );

    const totalSales = billsInRange.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
    const totalProfit = billsInRange.reduce((sum, bill) => sum + Number(bill.totalProfit || 0), 0);
    
    // Calculate total investment (cost of goods sold)
    // Investment = Total Sales - Total Profit
    const totalInvestment = totalSales - totalProfit;

    return {
      totalSales,
      totalProfit,
      totalInvestment,
    };
  }

  async getCustomerProfitReport(startDate: Date, endDate: Date): Promise<Array<{ customerId: number | null; customerName: string; totalSales: number; totalProfit: number }>> {
    const results = await db.select({
      customerId: bills.customerId,
      customerName: customers.name,
      totalSales: sum(bills.totalAmount),
      totalProfit: sum(bills.totalProfit),
    })
      .from(bills)
      .leftJoin(customers, eq(bills.customerId, customers.id))
      .where(
        and(
          eq(bills.status, 'completed'),
          sql`${bills.date} >= ${startDate}`,
          sql`${bills.date} <= ${endDate}`
        )
      )
      .groupBy(bills.customerId, customers.name)
      .orderBy(desc(sum(bills.totalProfit)));

    return results.map(r => ({
      customerId: r.customerId,
      customerName: r.customerName || 'Walk-in Customer',
      totalSales: Number(r.totalSales || 0),
      totalProfit: Number(r.totalProfit || 0),
    }));
  }
}

export const storage = new DatabaseStorage();
