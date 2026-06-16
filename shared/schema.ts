
import { pgTable, text, serial, integer, numeric, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { UNIT_OPTIONS } from "./units";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// === Customers ===
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(), // Unique constraint could be added but might be annoying for quick POS
  createdAt: timestamptz("created_at").defaultNow(),
});

// === Products (Item Memory) ===
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 3 }).default("0"), // Selling price
  costPrice: numeric("cost_price", { precision: 10, scale: 3 }).default("0"), // Purchase/cost price
  primaryUnit: text("primary_unit").default("PCS").notNull(),
  secondaryUnit: text("secondary_unit"),
  unitConversion: integer("unit_conversion"),
  sku: text("sku"),
  isActive: boolean("is_active").default(true),
  stock: numeric("stock", { precision: 12, scale: 3 }).default("0").notNull(), // Current stock quantity
  lowStockThreshold: numeric("low_stock_threshold", { precision: 12, scale: 3 }).default("10"), // Alert when stock falls below this
});

// === Bills ===
export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  date: timestamptz("date").defaultNow(),
  subtotalAmount: numeric("subtotal_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  extraChargesTotal: numeric("extra_charges_total", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  oldBalanceAmount: numeric("old_balance_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  billPaidAmount: numeric("bill_paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  oldBalancePaidAmount: numeric("old_balance_paid_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 10, scale: 2 }).notNull().default("0"),
  totalProfit: numeric("total_profit", { precision: 10, scale: 2 }).default("0"), // Profit = sum((sellingPrice - costPrice) * quantity)
  lastEditedAt: timestamptz("last_edited_at"),
  lastEditedBy: text("last_edited_by"),
  status: text("status").default("completed"), // completed, voided
});

// === Bill Items ===
export const billItems = pgTable("bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => bills.id),
  productId: integer("product_id").references(() => products.id),
  name: text("name").notNull(), // Snapshot of name in case product changes
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").default("PCS"),
  baseQuantity: doublePrecision("base_quantity"),
  baseUnit: text("base_unit"),
  price: numeric("price", { precision: 10, scale: 3 }).notNull(), // Snapshot of selling price
  costPrice: numeric("cost_price", { precision: 10, scale: 3 }).default("0"), // Snapshot of cost price
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
});

export const billCharges = pgTable("bill_charges", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => bills.id),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  position: integer("position").notNull().default(0),
});

// === Quotations ===
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  date: timestamptz("date").defaultNow(),
  subtotalAmount: numeric("subtotal_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  extraChargesTotal: numeric("extra_charges_total", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  convertedBillId: integer("converted_bill_id").references(() => bills.id),
  lastEditedAt: timestamptz("last_edited_at"),
  lastEditedBy: text("last_edited_by"),
});

export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id),
  productId: integer("product_id").references(() => products.id),
  name: text("name").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  unit: text("unit").default("PCS"),
  baseQuantity: doublePrecision("base_quantity"),
  baseUnit: text("base_unit"),
  price: numeric("price", { precision: 10, scale: 3 }).notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 3 }).default("0"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
});

export const quotationCharges = pgTable("quotation_charges", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull().references(() => quotations.id),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  position: integer("position").notNull().default(0),
});

// === Payments (Ledger) ===
// Tracks all money received. Linked to a bill (initial payment) or independent (paying off dues).
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  billId: integer("bill_id").references(() => bills.id), // Optional: if payment is for a specific bill
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamptz("date").defaultNow(),
  note: text("note"),
});

// === Customer Profit Adjustments ===
// Manual adjustment applied on top of calculated bill profit for customer-specific overrides.
export const customerProfitAdjustments = pgTable("customer_profit_adjustments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  profitDate: timestamptz("profit_date"),
  createdAt: timestamptz("created_at").defaultNow(),
});

// === Ledger Entries (Khatabook-style) ===
// Immutable customer ledger that tracks credit issued and payments received.
export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  type: text("type").notNull(), // "CREDIT" | "PAYMENT"
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  billId: integer("bill_id").references(() => bills.id),
  createdAt: timestamptz("created_at").defaultNow(),
});

// === Stock Adjustments (Inventory History) ===
// Tracks all stock changes: purchases, adjustments, sales, damages, etc.
export const stockAdjustments = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: doublePrecision("quantity").notNull(), // Positive = added, Negative = removed
  type: text("type").notNull(), // 'purchase', 'sale', 'adjustment', 'damage', 'return'
  reason: text("reason"), // Optional note explaining the change
  billId: integer("bill_id").references(() => bills.id), // If stock change was from a bill
  date: timestamptz("date").defaultNow(),
});

// === Accounts ===
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  openingBalance: numeric("opening_balance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamptz("created_at").defaultNow(),
});

// === Staff ===
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  salaryType: text("salary_type").notNull(), // daily | monthly
  salaryAmount: numeric("salary_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  overallPaymentAdjustment: numeric("overall_payment_adjustment", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamptz("created_at").defaultNow(),
});

// === Staff Attendance ===
export const staffAttendance = pgTable("staff_attendance", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  date: timestamptz("date").notNull(),
  status: text("status").notNull(), // present | absent
  payment: numeric("payment", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamptz("created_at").defaultNow(),
});

export const staffSalaryPayments = pgTable("staff_salary_payments", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staff.id),
  rangeStart: timestamptz("range_start").notNull(),
  rangeEnd: timestamptz("range_end").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  note: text("note"),
  createdAt: timestamptz("created_at").defaultNow(),
});

// === Account Transactions ===
export const accountTransactions = pgTable("account_transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id),
  type: text("type").notNull(), // 'spent' | 'credit'
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  date: timestamptz("date").defaultNow(),
});

// === Manual Investment Entries ===
// Tracks custom investment amounts entered outside account deductions.
export const investmentEntries = pgTable("investment_entries", {
  id: serial("id").primaryKey(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  date: timestamptz("date").defaultNow(),
});

export const investmentEntryPurchases = pgTable("investment_entry_purchases", {
  id: serial("id").primaryKey(),
  investmentEntryId: integer("investment_entry_id").notNull().references(() => investmentEntries.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: doublePrecision("quantity").notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 3 }),
  previousCostPrice: numeric("previous_cost_price", { precision: 10, scale: 3 }),
  createdAt: timestamptz("created_at").defaultNow(),
});

export const accountTransactionPurchases = pgTable("account_transaction_purchases", {
  id: serial("id").primaryKey(),
  accountTransactionId: integer("account_transaction_id").notNull().references(() => accountTransactions.id),
  productId: integer("product_id").notNull().references(() => products.id),
  quantity: doublePrecision("quantity").notNull(),
  costPrice: numeric("cost_price", { precision: 10, scale: 3 }),
  previousCostPrice: numeric("previous_cost_price", { precision: 10, scale: 3 }),
  createdAt: timestamptz("created_at").defaultNow(),
});

// === RELATIONS ===
export const customersRelations = relations(customers, ({ many }) => ({
  bills: many(bills),
  payments: many(payments),
  ledgerEntries: many(ledgerEntries),
  profitAdjustments: many(customerProfitAdjustments),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  customer: one(customers, {
    fields: [bills.customerId],
    references: [customers.id],
  }),
  items: many(billItems),
  charges: many(billCharges),
  payments: many(payments),
  ledgerEntries: many(ledgerEntries),
}));

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  customer: one(customers, {
    fields: [quotations.customerId],
    references: [customers.id],
  }),
  convertedBill: one(bills, {
    fields: [quotations.convertedBillId],
    references: [bills.id],
  }),
  items: many(quotationItems),
  charges: many(quotationCharges),
}));

export const billItemsRelations = relations(billItems, ({ one }) => ({
  bill: one(bills, {
    fields: [billItems.billId],
    references: [bills.id],
  }),
  product: one(products, {
    fields: [billItems.productId],
    references: [products.id],
  }),
}));

export const billChargesRelations = relations(billCharges, ({ one }) => ({
  bill: one(bills, {
    fields: [billCharges.billId],
    references: [bills.id],
  }),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationItems.quotationId],
    references: [quotations.id],
  }),
  product: one(products, {
    fields: [quotationItems.productId],
    references: [products.id],
  }),
}));

export const quotationChargesRelations = relations(quotationCharges, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationCharges.quotationId],
    references: [quotations.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  bill: one(bills, {
    fields: [payments.billId],
    references: [bills.id],
  }),
}));

export const customerProfitAdjustmentsRelations = relations(customerProfitAdjustments, ({ one }) => ({
  customer: one(customers, {
    fields: [customerProfitAdjustments.customerId],
    references: [customers.id],
  }),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  customer: one(customers, {
    fields: [ledgerEntries.customerId],
    references: [customers.id],
  }),
  bill: one(bills, {
    fields: [ledgerEntries.billId],
    references: [bills.id],
  }),
}));

export const stockAdjustmentsRelations = relations(stockAdjustments, ({ one }) => ({
  product: one(products, {
    fields: [stockAdjustments.productId],
    references: [products.id],
  }),
  bill: one(bills, {
    fields: [stockAdjustments.billId],
    references: [bills.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(accountTransactions),
}));

export const staffRelations = relations(staff, ({ many }) => ({
  attendance: many(staffAttendance),
  salaryPayments: many(staffSalaryPayments),
}));

export const staffAttendanceRelations = relations(staffAttendance, ({ one }) => ({
  staff: one(staff, {
    fields: [staffAttendance.staffId],
    references: [staff.id],
  }),
}));

export const staffSalaryPaymentsRelations = relations(staffSalaryPayments, ({ one }) => ({
  staff: one(staff, {
    fields: [staffSalaryPayments.staffId],
    references: [staff.id],
  }),
}));

export const accountTransactionsRelations = relations(accountTransactions, ({ one }) => ({
  account: one(accounts, {
    fields: [accountTransactions.accountId],
    references: [accounts.id],
  }),
}));

export const investmentEntryPurchasesRelations = relations(investmentEntryPurchases, ({ one }) => ({
  investmentEntry: one(investmentEntries, {
    fields: [investmentEntryPurchases.investmentEntryId],
    references: [investmentEntries.id],
  }),
  product: one(products, {
    fields: [investmentEntryPurchases.productId],
    references: [products.id],
  }),
}));

export const accountTransactionPurchasesRelations = relations(accountTransactionPurchases, ({ one }) => ({
  accountTransaction: one(accountTransactions, {
    fields: [accountTransactionPurchases.accountTransactionId],
    references: [accountTransactions.id],
  }),
  product: one(products, {
    fields: [accountTransactionPurchases.productId],
    references: [products.id],
  }),
}));

// === ZOD SCHEMAS ===
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertBillSchema = createInsertSchema(bills).omit({ id: true, date: true });
export const insertBillItemSchema = createInsertSchema(billItems).omit({ id: true, billId: true });
export const insertBillChargeSchema = createInsertSchema(billCharges).omit({ id: true, billId: true });
export const insertQuotationSchema = createInsertSchema(quotations).omit({ id: true, date: true });
export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({ id: true, quotationId: true });
export const insertQuotationChargeSchema = createInsertSchema(quotationCharges).omit({ id: true, quotationId: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, date: true });
export const insertCustomerProfitAdjustmentSchema = createInsertSchema(customerProfitAdjustments).omit({ id: true, createdAt: true });
export const insertLedgerEntrySchema = createInsertSchema(ledgerEntries).omit({ id: true, createdAt: true });
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true, createdAt: true, overallPaymentAdjustment: true });
export const insertStaffAttendanceSchema = createInsertSchema(staffAttendance).omit({ id: true, createdAt: true });
export const insertAccountTransactionSchema = createInsertSchema(accountTransactions).omit({ id: true, date: true });
export const insertInvestmentEntrySchema = createInsertSchema(investmentEntries).omit({ id: true });
export const insertInvestmentEntryPurchaseSchema = createInsertSchema(investmentEntryPurchases).omit({ id: true, createdAt: true });
export const insertAccountTransactionPurchaseSchema = createInsertSchema(accountTransactionPurchases).omit({ id: true, createdAt: true });

// === TYPES ===
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillItem = typeof billItems.$inferSelect;
export type BillCharge = typeof billCharges.$inferSelect;
export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type QuotationCharge = typeof quotationCharges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type CustomerProfitAdjustment = typeof customerProfitAdjustments.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type StaffAttendance = typeof staffAttendance.$inferSelect;
export type StaffSalaryPayment = typeof staffSalaryPayments.$inferSelect;
export type AccountTransaction = typeof accountTransactions.$inferSelect;
export type InvestmentEntry = typeof investmentEntries.$inferSelect;
export type InvestmentEntryPurchase = typeof investmentEntryPurchases.$inferSelect;
export type AccountTransactionPurchase = typeof accountTransactionPurchases.$inferSelect;

export type CreateBillRequest = {
  customerId?: number; // Optional for walk-in
  customerName?: string; // If new or walk-in
  customerPhone?: string; // If new or walk-in
  paymentAccountId?: number;
  items: {
    productId?: number;
    name: string;
    quantity: number;
    unit?: z.infer<typeof unitSchema>;
    baseQuantity?: number;
    baseUnit?: z.infer<typeof unitSchema>;
    price: number; // Selling price
    costPrice?: number; // Cost price (optional, defaults to 0)
  }[];
  extraCharges?: {
    label: string;
    amount: number;
  }[];
  paidAmount: number;
  date?: string; // Allow backdating if needed, or default to now
};

export type UpdateBillRequest = {
  customerId?: number;
  paymentAccountId?: number;
  items: {
    productId?: number;
    name: string;
    quantity: number;
    unit?: z.infer<typeof unitSchema>;
    baseQuantity?: number;
    baseUnit?: z.infer<typeof unitSchema>;
    price: number;
    costPrice?: number;
  }[];
  extraCharges?: {
    label: string;
    amount: number;
  }[];
  editedBy?: string;
  paidAmount: number;
  date?: string;
};

export type CreateQuotationRequest = {
  customerId?: number;
  items: {
    productId?: number;
    name: string;
    quantity: number;
    unit?: z.infer<typeof unitSchema>;
    baseQuantity?: number;
    baseUnit?: z.infer<typeof unitSchema>;
    price: number;
    costPrice?: number;
  }[];
  extraCharges?: {
    label: string;
    amount: number;
  }[];
  notes?: string;
  editedBy?: string;
  date?: string;
};

export type UpdateQuotationRequest = CreateQuotationRequest;

const unitSchema = z.enum(UNIT_OPTIONS);

export type Unit = z.infer<typeof unitSchema>;
