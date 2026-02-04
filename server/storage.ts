
import { db } from "./db";
import {
  customers, products, bills, billItems, payments,
  type Customer, type Product, type Bill, type BillItem, type Payment,
  type CreateBillRequest
} from "@shared/schema";
import { eq, desc, sql, sum, and } from "drizzle-orm";

export interface IStorage {
  // Customers
  getCustomers(search?: string): Promise<(Customer & { balance: number })[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerStats(id: number): Promise<{ totalPurchased: number; totalPaid: number; balance: number }>;
  getCustomerHistory(id: number): Promise<{ type: 'bill' | 'payment', date: string, amount: number, id: number }[]>;
  createCustomer(customer: Omit<Customer, "id" | "createdAt">): Promise<Customer>;
  
  // Products
  getProducts(search?: string): Promise<Product[]>;
  createProduct(product: Omit<Product, "id">): Promise<Product>;
  
  // Bills
  getBills(): Promise<(Bill & { customerName: string | null })[]>;
  getBill(id: number): Promise<(Bill & { items: BillItem[], customer: Customer | null }) | undefined>;
  createBill(data: CreateBillRequest): Promise<Bill>;
  deleteBill(id: number): Promise<void>;
  
  // Dashboard
  getDashboardStats(): Promise<{ todaySales: number; totalDue: number; activeCustomers: number }>;
}

export class DatabaseStorage implements IStorage {
  async getCustomers(search?: string): Promise<(Customer & { balance: number })[]> {
    // This requires aggregation. For simplicity/speed in MVP, we might just fetch and compute, 
    // or better, write a raw query. Let's use a raw query for balance.
    // Balance = Sum(Bills) - Sum(Payments)
    
    const whereClause = search ? sql`name ILIKE ${`%${search}%`} OR phone ILIKE ${`%${search}%`}` : undefined;
    
    // We can join tables but Drizzle query builder is easier if we keep it simple.
    // Let's just return customers for now and maybe compute balance for "Pending Dues" page separately?
    // Or simpler:
    const allCustomers = await db.select().from(customers).where(whereClause);
    
    // Calculate balances (N+1 problem but fine for small POS)
    // Optimization: GroupBy query is better.
    const results = await Promise.all(allCustomers.map(async (c) => {
      const stats = await this.getCustomerStats(c.id);
      return { ...c, balance: stats.balance };
    }));
    
    return results.sort((a, b) => b.balance - a.balance); // Show high dues first
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async getCustomerStats(id: number): Promise<{ totalPurchased: number; totalPaid: number; balance: number }> {
    const billSum = await db.select({ value: sum(bills.totalAmount) })
      .from(bills)
      .where(and(eq(bills.customerId, id), eq(bills.status, 'completed')));
      
    const paymentSum = await db.select({ value: sum(payments.amount) })
      .from(payments)
      .where(eq(payments.customerId, id));

    const totalPurchased = Number(billSum[0]?.value || 0);
    const totalPaid = Number(paymentSum[0]?.value || 0);
    
    return {
      totalPurchased,
      totalPaid,
      balance: totalPurchased - totalPaid
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

  async createCustomer(data: Omit<Customer, "id" | "createdAt">): Promise<Customer> {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }

  async getProducts(search?: string): Promise<Product[]> {
    if (search) {
      return db.select().from(products).where(sql`name ILIKE ${`%${search}%`}`);
    }
    return db.select().from(products).limit(50); // Recent items
  }

  async createProduct(data: Omit<Product, "id">): Promise<Product> {
    const [product] = await db.insert(products).values({
      ...data,
      price: data.price?.toString()
    }).returning();
    return product;
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

  async getBill(id: number): Promise<(Bill & { items: BillItem[], customer: Customer | null }) | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, id));
    if (!bill) return undefined;

    const items = await db.select().from(billItems).where(eq(billItems.billId, id));
    let customer = null;
    if (bill.customerId) {
      [customer] = await db.select().from(customers).where(eq(customers.id, bill.customerId));
    }

    return { ...bill, items, customer: customer || null };
  }

  async createBill(data: CreateBillRequest): Promise<Bill> {
    return await db.transaction(async (tx) => {
      // 1. Handle Customer
      let customerId = data.customerId;
      if (!customerId && data.customerName) {
        const [newCustomer] = await tx.insert(customers).values({
          name: data.customerName,
          phone: data.customerPhone || "",
        }).returning();
        customerId = newCustomer.id;
      }

      // 2. Calculate Total
      const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

      // 3. Create Bill
      const [bill] = await tx.insert(bills).values({
        customerId,
        totalAmount: totalAmount.toFixed(2),
        date: data.date ? new Date(data.date) : new Date(),
        status: 'completed'
      }).returning();

      // 4. Create Bill Items and optionally Products
      for (const item of data.items) {
        let productId = item.productId;
        
        // Auto-create product if it doesn't exist (Searchable item memory)
        if (!productId) {
           // check if exists by name to avoid dupes?
           // For MVP, if no ID provided, just treat as ad-hoc or create new?
           // The prompt says "Searchable item memory".
           // Let's check if name exists, if so use it, else create.
           const [existing] = await tx.select().from(products).where(eq(products.name, item.name));
           if (existing) {
             productId = existing.id;
           } else {
             const [newProduct] = await tx.insert(products).values({
               name: item.name,
               price: item.price.toString()
             }).returning();
             productId = newProduct.id;
           }
        }

        await tx.insert(billItems).values({
          billId: bill.id,
          productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price.toString(),
          subtotal: (item.quantity * item.price).toFixed(2),
        });
      }

      // 5. Record Payment
      if (data.paidAmount > 0 && customerId) {
        await tx.insert(payments).values({
          customerId,
          billId: bill.id,
          amount: data.paidAmount.toString(),
          date: data.date ? new Date(data.date) : new Date(),
          note: "Paid at time of bill"
        });
      }

      return bill;
    });
  }

  async deleteBill(id: number): Promise<void> {
    await db.update(bills).set({ status: 'voided' }).where(eq(bills.id, id));
  }

  async getDashboardStats(): Promise<{ todaySales: number; totalDue: number; activeCustomers: number }> {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const salesRes = await db.select({ value: sum(bills.totalAmount) })
      .from(bills)
      .where(and(eq(bills.status, 'completed'), sql`date >= ${today}`));

    const totalBill = await db.select({ value: sum(bills.totalAmount) }).from(bills).where(eq(bills.status, 'completed'));
    const totalPaid = await db.select({ value: sum(payments.amount) }).from(payments);
    
    const customersCount = await db.select({ count: sql<number>`count(*)` }).from(customers);

    return {
      todaySales: Number(salesRes[0]?.value || 0),
      totalDue: Number(totalBill[0]?.value || 0) - Number(totalPaid[0]?.value || 0),
      activeCustomers: Number(customersCount[0]?.count || 0)
    };
  }
}

export const storage = new DatabaseStorage();
