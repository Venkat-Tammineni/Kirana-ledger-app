
import { z } from 'zod';
import { insertCustomerSchema, insertProductSchema, insertAccountSchema, insertStaffSchema, customers, products, bills, billItems, billCharges, quotations, quotationItems, quotationCharges, payments, stockAdjustments, accounts, accountTransactions, staff, staffAttendance } from './schema';
import { UNIT_OPTIONS } from './units';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Custom schema for Creating a Bill (complex transaction)
const createBillSchema = z.object({
  customerId: z.number().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  paymentAccountId: z.number().optional(),
  items: z.array(z.object({
    productId: z.number().optional(),
    name: z.string(),
    quantity: z.number().min(1),
    unit: z.enum(UNIT_OPTIONS).optional(),
    baseQuantity: z.number().min(0.001).optional(),
    baseUnit: z.enum(UNIT_OPTIONS).optional(),
    price: z.number().min(0), // Selling price
    costPrice: z.number().min(0).optional(), // Cost price (optional, defaults to 0)
  })).min(1, "Bill must have at least one item"),
  extraCharges: z.array(z.object({
    label: z.string().trim().min(1, "Charge name is required"),
    amount: z.number(),
  })).default([]),
  paidAmount: z.number().min(0).default(0),
  date: z.string().optional(),
});

const updateBillSchema = z.object({
  customerId: z.number().optional(),
  paymentAccountId: z.number().optional(),
  items: z.array(z.object({
    productId: z.number().optional(),
    name: z.string(),
    quantity: z.number().min(1),
    unit: z.enum(UNIT_OPTIONS).optional(),
    baseQuantity: z.number().min(0.001).optional(),
    baseUnit: z.enum(UNIT_OPTIONS).optional(),
    price: z.number().min(0),
    costPrice: z.number().min(0).optional(),
  })).min(1, "Bill must have at least one item"),
  extraCharges: z.array(z.object({
    label: z.string().trim().min(1, "Charge name is required"),
    amount: z.number(),
  })).default([]),
  editedBy: z.string().trim().min(1).max(80).optional(),
  paidAmount: z.number().min(0).default(0),
  date: z.string().optional(),
});

const billItemMemoryQuerySchema = z.object({
  customerId: z.coerce.number(),
  productId: z.coerce.number().optional(),
  name: z.string().trim().min(1).optional(),
}).refine((value) => value.productId !== undefined || value.name !== undefined, {
  message: "productId or name is required",
});

const previousBillQuerySchema = z.object({
  customerId: z.coerce.number().int().positive(),
});

const billItemMemoryResponseSchema = z.object({
  productId: z.number().nullable(),
  name: z.string(),
  quantity: z.number(),
  unit: z.enum(UNIT_OPTIONS),
  price: z.number(),
  costPrice: z.number(),
  billId: z.number(),
  billDate: z.string(),
});

const previousBillResponseSchema = z.custom<typeof bills.$inferSelect & {
  items: typeof billItems.$inferSelect[];
  charges: typeof billCharges.$inferSelect[];
}>();

const createQuotationSchema = z.object({
  customerId: z.number().optional(),
  items: z.array(z.object({
    productId: z.number().optional(),
    name: z.string(),
    quantity: z.number().min(0),
    unit: z.enum(UNIT_OPTIONS).optional(),
    baseQuantity: z.number().min(0).optional(),
    baseUnit: z.enum(UNIT_OPTIONS).optional(),
    price: z.number().min(0),
    costPrice: z.number().min(0).optional(),
  })).min(1, "Quotation must have at least one item"),
  extraCharges: z.array(z.object({
    label: z.string().trim().min(1, "Charge name is required"),
    amount: z.number().min(0),
  })).default([]),
  notes: z.string().trim().max(500).optional(),
  editedBy: z.string().trim().min(1).max(80).optional(),
  date: z.string().optional(),
});

const updateQuotationSchema = createQuotationSchema;
const updateQuotationStatusSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected"]),
});

// New schema for repayment
const createRepaymentSchema = z.object({
  customerId: z.number(),
  amount: z.number().min(0.01, "Amount must be greater than zero"),
  note: z.string().optional(),
  date: z.string().optional(),
  paymentAccountId: z.number().optional(),
});

const createLedgerCreditSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than zero"),
  note: z.string().optional(),
  date: z.string().optional(),
});

const updateCustomerProfitSchema = z.object({
  totalProfit: z.number(),
});

const updateCustomerDailyProfitSchema = z.object({
  profitDate: z.string(),
  totalProfit: z.number(),
});

const staffAttendanceInputSchema = z.object({
  date: z.string().optional(),
  status: z.enum(["present", "absent"]),
  payment: z.number().min(0).optional(),
});

const updateStaffPaymentSchema = z.object({
  date: z.string().optional(),
  payment: z.number().min(0),
});

const updateStaffOverallPaymentSchema = z.object({
  totalPayment: z.number().min(0),
});

const updateStaffSalaryPaymentSchema = z.object({
  rangeStart: z.string(),
  rangeEnd: z.string(),
  amount: z.number().min(0),
  note: z.string().optional(),
});

const updateStaffSalarySchema = z.object({
  salaryType: z.enum(["daily", "monthly"]),
  salaryAmount: z.number().min(0),
  applyToRange: z.boolean().optional(),
  rangeStart: z.string().optional(),
  rangeEnd: z.string().optional(),
});

const createInvestmentEntrySchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than zero"),
  note: z.string().min(1, "Note is required"),
  date: z.string().optional(),
  purchases: z
    .array(
      z.object({
        productId: z.number(),
        quantity: z.number().min(0.001, "Quantity must be greater than zero"),
        costPrice: z.number().min(0, "Rate cannot be negative").optional(),
      }),
    )
    .default([]),
});

const investmentHistoryEntrySchema = z.object({
  id: z.number(),
  source: z.enum(["account_spent", "manual"]),
  accountId: z.number().nullable().optional(),
  sourceLabel: z.string(),
  amount: z.number(),
  note: z.string().nullable(),
  date: z.string(),
});

const advancedRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  granularity: z.enum(["day", "week", "month"]).optional(),
});

const advancedOverviewCardSchema = z.object({
  label: z.string(),
  value: z.number(),
  secondary: z.string(),
});

const advancedTrendPointSchema = z.object({
  label: z.string(),
  sales: z.number().optional(),
  bills: z.number().optional(),
  purchases: z.number().optional(),
  entries: z.number().optional(),
  revenue: z.number().optional(),
  cost: z.number().optional(),
  profit: z.number().optional(),
  cashIn: z.number().optional(),
  cashOut: z.number().optional(),
  balance: z.number().optional(),
});

const advancedBreakdownSliceSchema = z.object({
  count: z.number(),
  amount: z.number(),
});

const advancedGstSummarySchema = z.object({
  cgst: z.number(),
  sgst: z.number(),
  igst: z.number(),
});

const advancedSalesRowSchema = z.object({
  invoiceNo: z.string(),
  customer: z.string(),
  date: z.string(),
  itemsCount: z.number(),
  subtotal: z.number(),
  gst: z.number(),
  total: z.number(),
  status: z.enum(["paid", "unpaid", "partial"]),
});

const advancedPurchaseRowSchema = z.object({
  invoiceNo: z.string(),
  supplier: z.string(),
  date: z.string(),
  itemsCount: z.number(),
  subtotal: z.number(),
  gst: z.number(),
  total: z.number(),
  status: z.enum(["paid", "unpaid", "partial"]),
});

const advancedTopCustomerSchema = z.object({
  customerId: z.number().nullable(),
  customerName: z.string(),
  revenue: z.number(),
});

const advancedTopProductSchema = z.object({
  productId: z.number().nullable(),
  productName: z.string(),
  amount: z.number(),
});

const advancedExpenseBreakdownSchema = z.object({
  category: z.string(),
  amount: z.number(),
});

const advancedOutstandingRowSchema = z.object({
  customerId: z.number(),
  customer: z.string(),
  phone: z.string(),
  balance: z.number(),
  lastTransaction: z.string().nullable(),
  oldestDue: z.string().nullable(),
  remindText: z.string(),
});

const advancedStockRowSchema = z.object({
  productId: z.number(),
  item: z.string(),
  qty: z.number(),
  buyPrice: z.number(),
  sellPrice: z.number(),
  value: z.number(),
  profit: z.number(),
  marginPct: z.number(),
});

const advancedCashbookBreakdownSchema = z.object({
  category: z.string(),
  cashIn: z.number(),
  cashOut: z.number(),
});

const advancedCashbookRowSchema = z.object({
  date: z.string(),
  category: z.string(),
  note: z.string(),
  cashIn: z.number(),
  cashOut: z.number(),
  runningBalance: z.number(),
});

const ledgerEntryResponseSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  type: z.enum(["CREDIT", "PAYMENT"]),
  amount: z.number(),
  note: z.string().nullable(),
  billId: z.number().nullable(),
  createdAt: z.string(),
  runningBalance: z.number(),
});

// Accept DB numeric fields as number or string from the client, normalize to string for the server/DB.
const numericString = () =>
  z.preprocess(
    (v) => {
      if (v === undefined || v === null) return v;
      if (typeof v === "number") return v.toString();
      return v;
    },
    z.string()
  );

const productInputSchema = insertProductSchema.extend({
  price: numericString().nullable().optional(),
  costPrice: numericString().nullable().optional(),
  stock: numericString().optional(),
  lowStockThreshold: numericString().nullable().optional(),
  primaryUnit: z.enum(UNIT_OPTIONS).optional(),
  secondaryUnit: z.enum(UNIT_OPTIONS).nullable().optional(),
  unitConversion: z.coerce.number().int().min(2).nullable().optional(),
});

export const api = {
  staff: {
    list: {
      method: "GET" as const,
      path: "/api/staff",
      responses: {
        200: z.array(
          z.custom<
            typeof staff.$inferSelect & {
              presentDays: number;
              absentDays: number;
              totalPayment: number;
              thisMonthPayable: number;
              todayStatus: "present" | "absent" | null;
              todayPayment: number;
            }
          >(),
        ),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/staff/:id",
      responses: {
        200: z.custom<{
          staff: typeof staff.$inferSelect;
          summary: {
            presentDays: number;
            absentDays: number;
            attendancePaymentTotal: number;
            overallAdjustment: number;
            totalPayment: number;
            thisMonthPayable: number;
            todayStatus: "present" | "absent" | null;
            todayPayment: number;
          };
          attendance: typeof staffAttendance.$inferSelect[];
          payments: Array<{
            id: number;
            staffId: number;
            rangeStart: string;
            rangeEnd: string;
            amount: number;
            note: string | null;
          }>;
        }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/staff",
      input: insertStaffSchema.extend({
        salaryAmount: numericString(),
        salaryType: z.enum(["daily", "monthly"]),
      }),
      responses: {
        201: z.custom<typeof staff.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    markAttendance: {
      method: "POST" as const,
      path: "/api/staff/:id/attendance",
      input: staffAttendanceInputSchema,
      responses: {
        201: z.custom<typeof staffAttendance.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateTodayPayment: {
      method: "PATCH" as const,
      path: "/api/staff/:id/payment/today",
      input: updateStaffPaymentSchema,
      responses: {
        200: z.custom<typeof staffAttendance.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateOverallPayment: {
      method: "PATCH" as const,
      path: "/api/staff/:id/payment/overall",
      input: updateStaffOverallPaymentSchema,
      responses: {
        200: z.object({
          staffId: z.number(),
          totalPayment: z.number(),
          overallAdjustment: z.number(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateSalary: {
      method: "PATCH" as const,
      path: "/api/staff/:id/salary",
      input: updateStaffSalarySchema,
      responses: {
        200: z.custom<typeof staff.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateSalaryPayment: {
      method: "POST" as const,
      path: "/api/staff/:id/salary-payment",
      input: updateStaffSalaryPaymentSchema,
      responses: {
        200: z.object({
          id: z.number(),
          staffId: z.number(),
          rangeStart: z.string(),
          rangeEnd: z.string(),
          amount: z.number(),
          note: z.string().nullable(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  accounts: {
    list: {
      method: 'GET' as const,
      path: '/api/accounts',
      responses: {
        200: z.array(z.custom<typeof accounts.$inferSelect & { currentBalance: number; totalSpent: number }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/accounts/:id',
      responses: {
        200: z.custom<{
          account: typeof accounts.$inferSelect;
          currentBalance: number;
          totalSpent: number;
          transactions: Array<typeof accountTransactions.$inferSelect & { customerId?: number | null }>;
        }>(),
        404: errorSchemas.notFound,
      },
    },
    investment: {
      method: 'GET' as const,
      path: '/api/accounts/investment',
      responses: {
        200: z.object({
          totalInvestment: z.number(),
          accountSpentTotal: z.number(),
          manualInvestmentTotal: z.number(),
          entries: z.array(investmentHistoryEntrySchema),
        }),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/accounts',
      input: insertAccountSchema.extend({
        openingBalance: numericString().nullable().optional(),
      }),
      responses: {
        201: z.custom<typeof accounts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    spend: {
      method: 'POST' as const,
      path: '/api/accounts/:id/spend',
      input: z.object({
        amount: z.number().min(0.01),
        note: z.string().min(1, "Note is required"),
        date: z.string().optional(),
        purchases: z
          .array(
            z.object({
              productId: z.number(),
              quantity: z.number().min(0.001, "Quantity must be greater than zero"),
              costPrice: z.number().min(0, "Rate cannot be negative").optional(),
            }),
          )
          .default([]),
      }),
      responses: {
        201: z.custom<typeof accountTransactions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    credit: {
      method: 'POST' as const,
      path: '/api/accounts/:id/credit',
      input: z.object({
        amount: z.number().min(0.01),
        note: z.string().min(1, "Note is required"),
        customerId: z.number().optional(),
      }),
      responses: {
        201: z.custom<typeof accountTransactions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    deleteTransaction: {
      method: 'DELETE' as const,
      path: '/api/accounts/:id/transactions/:transactionId',
      responses: {
        204: z.void(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateTransaction: {
      method: 'PATCH' as const,
      path: '/api/accounts/:id/transactions/:transactionId',
      input: z.object({
        amount: z.number().min(0.01),
        note: z.string().min(1, "Note is required"),
        customerId: z.number().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof accountTransactions.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    addInvestment: {
      method: 'POST' as const,
      path: '/api/accounts/investment',
      input: createInvestmentEntrySchema,
      responses: {
        201: z.object({
          id: z.number(),
          amount: z.number(),
          note: z.string().nullable(),
          date: z.union([z.string(), z.date()]),
        }),
        400: errorSchemas.validation,
      },
    },
    deleteInvestment: {
      method: 'DELETE' as const,
      path: '/api/accounts/investment/:id',
      responses: {
        204: z.void(),
        400: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    deleteSafe: {
      method: 'DELETE' as const,
      path: '/api/accounts/:id',
      responses: {
        204: z.void(),
        400: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    deleteForce: {
      method: 'DELETE' as const,
      path: '/api/accounts/:id/force',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  customers: {
    list: {
      method: 'GET' as const,
      path: '/api/customers',
      input: z.object({
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof customers.$inferSelect & {
          balance: number;
          totalProfit?: number;
          totalGiven: number;
          totalReceived: number;
          lastPaymentDate: string | null;
          daysSinceLastPayment: number | null;
        }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/customers/:id',
      input: z.object({
        profitDate: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
        responses: {
          200: z.custom<typeof customers.$inferSelect & { 
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
            history: { type: 'bill' | 'payment', date: string, amount: number, id: number }[];
            ledger: Array<z.infer<typeof ledgerEntryResponseSchema>>;
          }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/customers',
      input: insertCustomerSchema,
      responses: {
        201: z.custom<typeof customers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/customers/:id',
      input: insertCustomerSchema.partial(),
      responses: {
        200: z.custom<typeof customers.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/customers/:id',
      responses: {
        204: z.void(),
        400: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    repay: {
      method: 'POST' as const,
      path: '/api/customers/:id/repay',
      input: createRepaymentSchema,
      responses: {
        201: z.custom<typeof payments.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    deleteRepayment: {
      method: 'DELETE' as const,
      path: '/api/customers/:id/repay/:paymentId',
      responses: {
        204: z.void(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    addCredit: {
      method: 'POST' as const,
      path: '/api/customers/:id/ledger/credit',
      input: createLedgerCreditSchema,
      responses: {
        201: ledgerEntryResponseSchema.extend({
          createdAt: z.union([z.string(), z.date()]),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    deleteCredit: {
      method: 'DELETE' as const,
      path: '/api/customers/:id/ledger/:entryId',
      responses: {
        204: z.void(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateProfit: {
      method: 'PATCH' as const,
      path: '/api/customers/:id/profit',
      input: updateCustomerProfitSchema,
      responses: {
        200: z.object({
          customerId: z.number(),
          totalProfit: z.number(),
          adjustment: z.number(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateDailyProfit: {
      method: 'PATCH' as const,
      path: '/api/customers/:id/profit/day',
      input: updateCustomerDailyProfitSchema,
      responses: {
        200: z.object({
          customerId: z.number(),
          profitDate: z.string(),
          totalProfit: z.number(),
          adjustment: z.number(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    statement: {
      method: 'GET' as const,
      path: '/api/customers/:id/statement.csv',
      responses: {
        200: z.string(),
        404: errorSchemas.notFound,
      },
    }
  },
  products: {
    list: {
      method: 'GET' as const,
      path: '/api/products',
      input: z.object({
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/products',
      input: productInputSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/products/:id',
      input: productInputSchema.partial(),
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/products/:id',
      responses: {
        204: z.void(),
        400: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  bills: {
    list: {
      method: 'GET' as const,
      path: '/api/bills',
      responses: {
        200: z.array(z.custom<typeof bills.$inferSelect & { customerName: string | null }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/bills/:id',
      responses: {
        200: z.custom<typeof bills.$inferSelect & {
          items: typeof billItems.$inferSelect[];
          charges: typeof billCharges.$inferSelect[];
          customer: typeof customers.$inferSelect | null;
        }>(),
        404: errorSchemas.notFound,
      },
    },
    itemMemory: {
      method: 'GET' as const,
      path: '/api/bills/item-memory',
      input: billItemMemoryQuerySchema,
      responses: {
        200: billItemMemoryResponseSchema.nullable(),
        400: errorSchemas.validation,
      },
    },
    previous: {
      method: 'GET' as const,
      path: '/api/bills/previous',
      input: previousBillQuerySchema,
      responses: {
        200: previousBillResponseSchema.nullable(),
        400: errorSchemas.validation,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bills',
      input: createBillSchema,
      responses: {
        201: z.custom<typeof bills.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/bills/:id',
      input: updateBillSchema,
      responses: {
        200: z.custom<typeof bills.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/bills/:id',
      responses: {
        204: z.void(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    }
  },
  quotations: {
    list: {
      method: 'GET' as const,
      path: '/api/quotations',
      responses: {
        200: z.array(z.custom<typeof quotations.$inferSelect & { customerName: string | null }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/quotations/:id',
      responses: {
        200: z.custom<typeof quotations.$inferSelect & {
          items: typeof quotationItems.$inferSelect[];
          charges: typeof quotationCharges.$inferSelect[];
          customer: typeof customers.$inferSelect | null;
          convertedBill: typeof bills.$inferSelect | null;
        }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/quotations',
      input: createQuotationSchema,
      responses: {
        201: z.custom<typeof quotations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/quotations/:id',
      input: updateQuotationSchema,
      responses: {
        200: z.custom<typeof quotations.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    convert: {
      method: 'POST' as const,
      path: '/api/quotations/:id/convert',
      responses: {
        201: z.object({
          quotation: z.custom<typeof quotations.$inferSelect>(),
          bill: z.custom<typeof bills.$inferSelect>(),
        }),
        400: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/quotations/:id/status',
      input: updateQuotationStatusSchema,
      responses: {
        200: z.custom<typeof quotations.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/dashboard/stats',
        responses: {
          200: z.object({
            todaySales: z.number(),
            todayProfit: z.number(),
            mirchiPowderSales: z.number(),
            mirchiPowderProfit: z.number(),
            totalDue: z.number(),
            activeCustomers: z.number(),
          }),
        },
    },
  },
  inventory: {
    adjustStock: {
      method: 'POST' as const,
      path: '/api/inventory/adjust',
      input: z.object({
        productId: z.number(),
        quantity: z.number(),
        type: z.enum(['purchase', 'sale', 'adjustment', 'damage', 'return']),
        reason: z.string().optional(),
        billId: z.number().optional(),
      }),
      responses: {
        201: z.custom<typeof stockAdjustments.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    bulkAdjust: {
      method: 'POST' as const,
      path: '/api/inventory/bulk-adjust',
      input: z.object({
        items: z.array(
          z.object({
            productId: z.number(),
            quantity: z.number(),
            type: z.enum(['purchase', 'sale', 'adjustment', 'damage', 'return']),
            reason: z.string().optional(),
          }),
        ).min(1),
      }),
      responses: {
        201: z.array(z.custom<typeof stockAdjustments.$inferSelect>()),
        400: errorSchemas.validation,
      },
    },
    recurringPurchase: {
      method: 'POST' as const,
      path: '/api/inventory/recurring-purchase',
      input: z.object({
        note: z.string().optional(),
        items: z.array(
          z.object({
            productId: z.number(),
            quantity: z.number().min(1),
            costPrice: z.number().min(0).optional(),
          }),
        ).min(1),
      }),
      responses: {
        201: z.array(z.custom<typeof stockAdjustments.$inferSelect>()),
        400: errorSchemas.validation,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/inventory/history',
      input: z.object({
        productId: z.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof stockAdjustments.$inferSelect & { productName: string }>()),
      },
    },
    lowStock: {
      method: 'GET' as const,
      path: '/api/inventory/low-stock',
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      },
    },
    topSelling: {
      method: 'GET' as const,
      path: '/api/inventory/top-selling',
      input: z.object({
        limit: z.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          productId: z.number().nullable(),
          productName: z.string(),
          totalQuantity: z.number(),
          totalRevenue: z.number(),
        })),
      },
    },
    leastSelling: {
      method: 'GET' as const,
      path: '/api/inventory/least-selling',
      input: z.object({
        limit: z.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          productId: z.number().nullable(),
          productName: z.string(),
          totalQuantity: z.number(),
          totalRevenue: z.number(),
        })),
      },
    },
  },
  reporting: {
    profit: {
      method: 'GET' as const,
      path: '/api/reporting/profit',
      input: z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
      responses: {
        200: z.object({
          totalSales: z.number(),
          totalProfit: z.number(),
          totalInvestment: z.number(),
          mirchiPowderSales: z.number(),
          mirchiPowderProfit: z.number(),
          mirchiPowderInvestment: z.number(),
          mirchiPowderCustomers: z.array(z.object({
            customerId: z.number().nullable(),
            customerName: z.string(),
            totalQuantity: z.number(),
            unit: z.string(),
            totalSales: z.number(),
            totalProfit: z.number(),
            details: z.array(z.object({
              billId: z.number(),
              date: z.union([z.string(), z.date()]),
              quantity: z.number(),
              unit: z.string(),
              rate: z.number(),
              sales: z.number(),
              profit: z.number(),
            })),
          })),
        }),
      },
    },
    customerProfit: {
      method: 'GET' as const,
      path: '/api/reporting/customer-profit',
      input: z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
      responses: {
        200: z.array(z.object({
          customerId: z.number().nullable(),
          customerName: z.string(),
          totalSales: z.number(),
          totalProfit: z.number(),
          items: z.array(z.object({
            productId: z.number().nullable(),
            itemName: z.string(),
            quantity: z.number(),
            unit: z.string(),
            totalSales: z.number(),
            totalProfit: z.number(),
          })),
        })),
      },
    },
    itemBills: {
      method: 'GET' as const,
      path: '/api/reporting/item-bills',
      input: z.object({
        startDate: z.string(),
        endDate: z.string(),
        search: z.string().trim().min(1),
      }),
      responses: {
        200: z.array(z.object({
          id: z.number(),
          billNumber: z.number().nullable().optional(),
          customerName: z.string().nullable(),
          date: z.union([z.string(), z.date()]).nullable(),
          status: z.string().nullable().optional(),
          totalAmount: z.union([z.string(), z.number()]),
          totalProfit: z.union([z.string(), z.number()]).nullable().optional(),
          matchedItems: z.array(z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string().nullable(),
            price: z.union([z.string(), z.number()]),
            subtotal: z.union([z.string(), z.number()]),
          })),
        })),
      },
    },
  },
  exports: {
    salesCsv: {
      method: 'GET' as const,
      path: '/api/export/sales.csv',
      responses: {
        200: z.string(),
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type UpdateQuotationStatusInput = z.infer<typeof updateQuotationStatusSchema>;
export type CreateRepaymentInput = z.infer<typeof createRepaymentSchema>;
export type CreateLedgerCreditInput = z.infer<typeof createLedgerCreditSchema>;
