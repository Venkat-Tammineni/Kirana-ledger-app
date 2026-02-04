
import { z } from 'zod';
import { insertCustomerSchema, insertProductSchema, customers, products, bills, billItems, payments } from './schema';

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
  items: z.array(z.object({
    productId: z.number().optional(),
    name: z.string(),
    quantity: z.number().min(1),
    price: z.number().min(0),
  })).min(1, "Bill must have at least one item"),
  paidAmount: z.number().min(0).default(0),
  date: z.string().optional(),
});

export const api = {
  customers: {
    list: {
      method: 'GET' as const,
      path: '/api/customers',
      input: z.object({
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof customers.$inferSelect & { balance: number }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/customers/:id',
      responses: {
        200: z.custom<typeof customers.$inferSelect & { 
          totalPurchased: number; 
          totalPaid: number; 
          balance: number; 
          history: { type: 'bill' | 'payment', date: string, amount: number, id: number }[]
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
      input: insertProductSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
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
        200: z.custom<typeof bills.$inferSelect & { items: typeof billItems.$inferSelect[], customer: typeof customers.$inferSelect | null }>(),
        404: errorSchemas.notFound,
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
    delete: {
      method: 'DELETE' as const,
      path: '/api/bills/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/dashboard/stats',
      responses: {
        200: z.object({
          todaySales: z.number(),
          totalDue: z.number(),
          activeCustomers: z.number(),
        }),
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
