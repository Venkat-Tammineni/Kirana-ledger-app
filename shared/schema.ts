
import { pgTable, text, serial, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// === Customers ===
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(), // Unique constraint could be added but might be annoying for quick POS
  createdAt: timestamp("created_at").defaultNow(),
});

// === Products (Item Memory) ===
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).default("0"),
  sku: text("sku"),
  isActive: boolean("is_active").default(true),
});

// === Bills ===
export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  date: timestamp("date").defaultNow(),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("completed"), // completed, voided
});

// === Bill Items ===
export const billItems = pgTable("bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => bills.id),
  productId: integer("product_id").references(() => products.id),
  name: text("name").notNull(), // Snapshot of name in case product changes
  quantity: integer("quantity").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(), // Snapshot of price
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
});

// === Payments (Ledger) ===
// Tracks all money received. Linked to a bill (initial payment) or independent (paying off dues).
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  billId: integer("bill_id").references(() => bills.id), // Optional: if payment is for a specific bill
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow(),
  note: text("note"),
});

// === RELATIONS ===
export const customersRelations = relations(customers, ({ many }) => ({
  bills: many(bills),
  payments: many(payments),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  customer: one(customers, {
    fields: [bills.customerId],
    references: [customers.id],
  }),
  items: many(billItems),
  payments: many(payments),
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

// === ZOD SCHEMAS ===
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertBillSchema = createInsertSchema(bills).omit({ id: true, date: true });
export const insertBillItemSchema = createInsertSchema(billItems).omit({ id: true, billId: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, date: true });

// === TYPES ===
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type BillItem = typeof billItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;

export type CreateBillRequest = {
  customerId?: number; // Optional for walk-in
  customerName?: string; // If new or walk-in
  customerPhone?: string; // If new or walk-in
  items: {
    productId?: number;
    name: string;
    quantity: number;
    price: number;
  }[];
  paidAmount: number;
  date?: string; // Allow backdating if needed, or default to now
};
