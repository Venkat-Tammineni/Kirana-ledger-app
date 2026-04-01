import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { storage } from "../server/storage";
import {
  accountTransactions,
  accounts,
  customerProfitAdjustments,
  products,
  staffAttendance,
  stockAdjustments,
} from "../shared/schema";

function daysAgo(days: number, hour = 10, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function ensureFreshDatabase() {
  const [productCount, customerCount, billCount] = await Promise.all([
    db.execute(sql`select count(*)::int as count from products`),
    db.execute(sql`select count(*)::int as count from customers`),
    db.execute(sql`select count(*)::int as count from bills`),
  ]);

  const hasData =
    Number(productCount.rows[0]?.count || 0) > 0 ||
    Number(customerCount.rows[0]?.count || 0) > 0 ||
    Number(billCount.rows[0]?.count || 0) > 0;

  if (hasData) {
    throw new Error("Database already has data. Run npm run db:rebuild for a fresh sample dataset.");
  }
}

async function addPurchaseHistory(productId: number, quantity: number, date: Date, reason: string, costPrice?: number) {
  await db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId));
    if (!product) throw new Error(`Product ${productId} not found`);

    const nextStock = Number(product.stock || 0) + quantity;
    const nextCostPrice = costPrice !== undefined ? costPrice.toFixed(2) : product.costPrice;

    await tx
      .update(products)
      .set({
        stock: nextStock,
        ...(nextCostPrice !== undefined ? { costPrice: nextCostPrice } : {}),
      })
      .where(eq(products.id, productId));

    await tx.insert(stockAdjustments).values({
      productId,
      quantity,
      type: "purchase",
      reason,
      date,
    });
  });
}

async function addAccountTransaction(accountId: number, type: "credit" | "spent", amount: number, note: string, date: Date) {
  await db.insert(accountTransactions).values({
    accountId,
    type,
    amount: amount.toFixed(2),
    note,
    date,
  });
}

async function addAttendance(staffId: number, status: "present" | "absent", payment: number, date: Date) {
  await db.insert(staffAttendance).values({
    staffId,
    status,
    payment: payment.toFixed(2),
    date,
  });
}

async function runSeed() {
  await ensureFreshDatabase();

  const rice = await storage.createProduct({
    name: "Sona Masoori Rice",
    price: "68.00",
    costPrice: "54.00",
    primaryUnit: "BAG",
    secondaryUnit: "KG",
    unitConversion: 25,
    sku: "RICE-SONA-25",
    isActive: true,
    stock: 250,
    lowStockThreshold: 75,
  });

  const sugar = await storage.createProduct({
    name: "Sugar Premium",
    price: "49.00",
    costPrice: "40.00",
    primaryUnit: "BAG",
    secondaryUnit: "KG",
    unitConversion: 50,
    sku: "SUGAR-50",
    isActive: true,
    stock: 300,
    lowStockThreshold: 100,
  });

  const oil = await storage.createProduct({
    name: "Sunflower Oil",
    price: "165.00",
    costPrice: "132.00",
    primaryUnit: "BOXES",
    secondaryUnit: "BOTTLES",
    unitConversion: 12,
    sku: "OIL-SUN-12",
    isActive: true,
    stock: 96,
    lowStockThreshold: 24,
  });

  const biscuits = await storage.createProduct({
    name: "Marie Biscuit",
    price: "12.00",
    costPrice: "8.00",
    primaryUnit: "BOXES",
    secondaryUnit: "PCS",
    unitConversion: 24,
    sku: "BISC-MARIE",
    isActive: true,
    stock: 240,
    lowStockThreshold: 60,
  });

  const milk = await storage.createProduct({
    name: "Milk Packet",
    price: "32.00",
    costPrice: "25.00",
    primaryUnit: "LITRE",
    secondaryUnit: null,
    unitConversion: null,
    sku: "MILK-1L",
    isActive: true,
    stock: 120,
    lowStockThreshold: 25,
  });

  const cola = await storage.createProduct({
    name: "Cola Can",
    price: "42.00",
    costPrice: "30.00",
    primaryUnit: "BOXES",
    secondaryUnit: "CANS",
    unitConversion: 24,
    sku: "COLA-24",
    isActive: true,
    stock: 144,
    lowStockThreshold: 48,
  });

  const soap = await storage.createProduct({
    name: "Bath Soap",
    price: "28.00",
    costPrice: "19.00",
    primaryUnit: "BOXES",
    secondaryUnit: "PCS",
    unitConversion: 12,
    sku: "SOAP-12",
    isActive: true,
    stock: 180,
    lowStockThreshold: 36,
  });

  const eggs = await storage.createProduct({
    name: "Farm Eggs",
    price: "8.00",
    costPrice: "6.00",
    primaryUnit: "DOZENS",
    secondaryUnit: "PCS",
    unitConversion: 12,
    sku: "EGGS-12",
    isActive: true,
    stock: 144,
    lowStockThreshold: 36,
  });

  const rajesh = await storage.createCustomer({ name: "Rajesh Kumar", phone: "9876543210" });
  const priya = await storage.createCustomer({ name: "Priya Sharma", phone: "9876543211" });
  const lakshmi = await storage.createCustomer({ name: "Lakshmi Devi", phone: "9876543212" });
  const srinivas = await storage.createCustomer({ name: "Srinivas Rao", phone: "9876543213" });
  const anitha = await storage.createCustomer({ name: "Anitha Reddy", phone: "9876543214" });

  const cashCounter = await storage.createAccount({ name: "Cash Counter", openingBalance: "15000.00" });
  const upiWallet = await storage.createAccount({ name: "UPI Wallet", openingBalance: "8000.00" });
  const pettyCash = await storage.createAccount({ name: "Petty Cash", openingBalance: "3000.00" });

  const ramu = await storage.createStaff({ name: "Ramu", phone: "9000000001", salaryType: "daily", salaryAmount: "450.00" });
  const sita = await storage.createStaff({ name: "Sita", phone: "9000000002", salaryType: "daily", salaryAmount: "500.00" });
  const mahesh = await storage.createStaff({ name: "Mahesh", phone: "9000000003", salaryType: "monthly", salaryAmount: "18000.00" });

  await addPurchaseHistory(rice.id, 75, daysAgo(12, 7, 30), "Weekly mandi purchase", 52);
  await addPurchaseHistory(sugar.id, 100, daysAgo(11, 8, 0), "Sugar restock from wholesaler", 39);
  await addPurchaseHistory(oil.id, 36, daysAgo(9, 9, 15), "Oil carton purchase", 128);
  await addPurchaseHistory(biscuits.id, 96, daysAgo(7, 10, 0), "Festival biscuit stock-up", 7.5);
  await addPurchaseHistory(milk.id, 60, daysAgo(3, 6, 0), "Morning dairy receipt", 24.5);
  await addPurchaseHistory(cola.id, 48, daysAgo(2, 11, 0), "Cold drinks restock", 29);

  await storage.createBill({
    customerId: rajesh.id,
    items: [
      { productId: rice.id, name: rice.name, quantity: 1, unit: "BAG", baseQuantity: 25, baseUnit: "KG", price: 1700, costPrice: 1350 },
      { productId: oil.id, name: oil.name, quantity: 4, unit: "BOTTLES", baseQuantity: 4, baseUnit: "BOTTLES", price: 165, costPrice: 132 },
    ],
    paidAmount: 1200,
    date: daysAgo(10, 11, 0).toISOString(),
  });

  await storage.createBill({
    customerId: priya.id,
    items: [
      { productId: biscuits.id, name: biscuits.name, quantity: 10, unit: "PCS", baseQuantity: 10, baseUnit: "PCS", price: 12, costPrice: 8 },
      { productId: milk.id, name: milk.name, quantity: 3, unit: "LITRE", baseQuantity: 3, baseUnit: "LITRE", price: 32, costPrice: 25 },
      { productId: eggs.id, name: eggs.name, quantity: 12, unit: "PCS", baseQuantity: 12, baseUnit: "PCS", price: 8, costPrice: 6 },
    ],
    paidAmount: 312,
    date: daysAgo(8, 19, 0).toISOString(),
  });

  await storage.createBill({
    items: [
      { productId: cola.id, name: cola.name, quantity: 6, unit: "CANS", baseQuantity: 6, baseUnit: "CANS", price: 42, costPrice: 30 },
      { productId: soap.id, name: soap.name, quantity: 4, unit: "PCS", baseQuantity: 4, baseUnit: "PCS", price: 28, costPrice: 19 },
    ],
    paidAmount: 364,
    date: daysAgo(7, 14, 30).toISOString(),
  });

  await storage.createBill({
    customerId: srinivas.id,
    items: [
      { productId: sugar.id, name: sugar.name, quantity: 1, unit: "BAG", baseQuantity: 50, baseUnit: "KG", price: 2450, costPrice: 2000 },
      { productId: milk.id, name: milk.name, quantity: 5, unit: "LITRE", baseQuantity: 5, baseUnit: "LITRE", price: 32, costPrice: 25 },
    ],
    paidAmount: 0,
    date: daysAgo(6, 10, 45).toISOString(),
  });

  await storage.createBill({
    customerId: anitha.id,
    items: [
      { productId: rice.id, name: rice.name, quantity: 5, unit: "KG", baseQuantity: 5, baseUnit: "KG", price: 68, costPrice: 54 },
      { productId: oil.id, name: oil.name, quantity: 2, unit: "BOTTLES", baseQuantity: 2, baseUnit: "BOTTLES", price: 165, costPrice: 132 },
    ],
    paidAmount: 670,
    date: daysAgo(4, 17, 15).toISOString(),
  });

  await storage.createBill({
    customerId: rajesh.id,
    items: [
      { productId: soap.id, name: soap.name, quantity: 8, unit: "PCS", baseQuantity: 8, baseUnit: "PCS", price: 28, costPrice: 19 },
      { productId: biscuits.id, name: biscuits.name, quantity: 12, unit: "PCS", baseQuantity: 12, baseUnit: "PCS", price: 12, costPrice: 8 },
    ],
    paidAmount: 320,
    date: daysAgo(2, 20, 0).toISOString(),
  });

  await storage.createBill({
    customerId: lakshmi.id,
    items: [
      { productId: rice.id, name: rice.name, quantity: 1, unit: "BAG", baseQuantity: 25, baseUnit: "KG", price: 1725, costPrice: 1350 },
      { productId: eggs.id, name: eggs.name, quantity: 18, unit: "PCS", baseQuantity: 18, baseUnit: "PCS", price: 8, costPrice: 6 },
    ],
    paidAmount: 900,
    date: daysAgo(1, 18, 30).toISOString(),
  });

  await storage.createBill({
    items: [
      { productId: milk.id, name: milk.name, quantity: 6, unit: "LITRE", baseQuantity: 6, baseUnit: "LITRE", price: 32, costPrice: 25 },
      { productId: cola.id, name: cola.name, quantity: 3, unit: "CANS", baseQuantity: 3, baseUnit: "CANS", price: 42, costPrice: 30 },
    ],
    paidAmount: 318,
    date: daysAgo(0, 9, 30).toISOString(),
  });

  await storage.createPayment({
    customerId: rajesh.id,
    amount: "700.00",
    note: "UPI repayment",
    billId: null,
    date: daysAgo(1, 20, 30),
  });

  await storage.createPayment({
    customerId: srinivas.id,
    amount: "600.00",
    note: "Part payment in cash",
    billId: null,
    date: daysAgo(3, 19, 0),
  });

  await storage.createLedgerCredit({
    customerId: srinivas.id,
    amount: 350,
    note: "Manual groceries on udhaar",
    createdAt: daysAgo(5, 21, 0),
  });

  await storage.createLedgerCredit({
    customerId: lakshmi.id,
    amount: 220,
    note: "Manual household items",
    createdAt: daysAgo(1, 8, 45),
  });

  await db.insert(customerProfitAdjustments).values({
    customerId: rajesh.id,
    amount: "120.00",
  });

  await addAccountTransaction(cashCounter.id, "credit", 2500, "Morning cash top-up", daysAgo(10, 8, 0));
  await addAccountTransaction(cashCounter.id, "spent", 1800, "Wholesale vegetables", daysAgo(9, 12, 0));
  await addAccountTransaction(upiWallet.id, "credit", 4200, "UPI settlement", daysAgo(7, 18, 0));
  await addAccountTransaction(pettyCash.id, "spent", 650, "Cleaning supplies", daysAgo(6, 16, 30));
  await addAccountTransaction(cashCounter.id, "spent", 950, "Delivery fuel", daysAgo(3, 19, 0));
  await addAccountTransaction(upiWallet.id, "credit", 3100, "Weekend transfer", daysAgo(1, 17, 15));
  await addAccountTransaction(pettyCash.id, "credit", 500, "Cash returned", daysAgo(0, 13, 0));

  const attendanceDates = [6, 5, 4, 3, 2, 1, 0];
  for (const day of attendanceDates) {
    await addAttendance(ramu.id, day === 3 ? "absent" : "present", day === 3 ? 0 : 450, daysAgo(day, 9, 0));
    await addAttendance(sita.id, day === 1 ? "absent" : "present", day === 1 ? 0 : 500, daysAgo(day, 9, 15));
    await addAttendance(mahesh.id, day === 4 ? "absent" : "present", 0, daysAgo(day, 9, 30));
  }

  console.log("Seed complete with rich sample data");
}

runSeed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await pool.end();
    process.exit(1);
  });
