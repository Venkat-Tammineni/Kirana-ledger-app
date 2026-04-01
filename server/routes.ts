
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { getCustomerStatement } from "./services/billing-service";
import { bulkAdjustStock, recurringPurchase } from "./services/inventory-service";
import { registerAdvancedReportRoutes } from "./routes/advanced-reports";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { bills, billItems, customers } from "@shared/schema";

function parseDateOnlyInput(value?: string) {
  if (!value) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid date");
  }

  return new Date(year, month - 1, day);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // === Staff ===
  app.get(api.staff.list.path, async (_req, res) => {
    const staff = await storage.getStaff();
    res.json(staff);
  });

  app.get(api.staff.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const details = await storage.getStaffDetails(id);
    if (!details) return res.status(404).json({ message: "Staff member not found" });
    res.json(details);
  });

  app.post(api.staff.create.path, async (req, res) => {
    try {
      const input = api.staff.create.input.parse(req.body);
      const staff = await storage.createStaff({
        name: input.name,
        phone: input.phone,
        salaryType: input.salaryType,
        salaryAmount: input.salaryAmount ?? "0",
      });
      res.status(201).json(staff);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.staff.markAttendance.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.staff.markAttendance.input.parse(req.body);
      const attendance = await storage.markStaffAttendance(id, {
        date: input.date ? parseDateOnlyInput(input.date) : undefined,
        status: input.status,
        payment: input.payment,
      });
      res.status(201).json(attendance);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.staff.updateTodayPayment.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.staff.updateTodayPayment.input.parse(req.body);
      const attendance = await storage.updateStaffTodayPayment(
        id,
        input.payment,
        input.date ? parseDateOnlyInput(input.date) : undefined,
      );
      res.json(attendance);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.staff.updateOverallPayment.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.staff.updateOverallPayment.input.parse(req.body);
      const result = await storage.updateStaffOverallPayment(id, input.totalPayment);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // === Accounts ===
  app.get(api.accounts.list.path, async (_req, res) => {
    const accounts = await storage.getAccounts();
    res.json(accounts);
  });

  app.get(api.accounts.investment.path, async (_req, res) => {
    const details = await storage.getInvestmentDetails();
    res.json(details);
  });

  app.get(api.accounts.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const details = await storage.getAccountDetails(id);
    if (!details) return res.status(404).json({ message: "Account not found" });
    res.json(details);
  });

  app.post(api.accounts.create.path, async (req, res) => {
    try {
      const input = api.accounts.create.input.parse(req.body);
      const account = await storage.createAccount({
        name: input.name,
        openingBalance: input.openingBalance ?? "0",
      });
      res.status(201).json(account);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.accounts.spend.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.accounts.spend.input.parse(req.body);
      const txn = await storage.spendFromAccount(id, input.amount, input.note);
      res.status(201).json(txn);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.accounts.credit.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.accounts.credit.input.parse(req.body);
      const txn = await storage.addToAccount(id, input.amount, input.note);
      res.status(201).json(txn);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.accounts.addInvestment.path, async (req, res) => {
    try {
      const input = api.accounts.addInvestment.input.parse(req.body);
      const entry = await storage.createInvestmentEntry({
        amount: input.amount,
        note: input.note,
        date: input.date ? new Date(input.date) : undefined,
      });
      res.status(201).json({
        id: entry.id,
        amount: Number(entry.amount || 0),
        note: entry.note ?? null,
        date: entry.date?.toISOString() || "",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.delete(api.accounts.deleteSafe.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteAccountSafe(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof Error) {
        const status = err.message === "Account not found" ? 404 : 400;
        res.status(status).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.delete(api.accounts.deleteForce.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteAccountForce(id);
      res.status(204).send();
    } catch (err) {
      if (err instanceof Error) {
        const status = err.message === "Account not found" ? 404 : 400;
        res.status(status).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });
  
  // === Customers ===
  app.get(api.customers.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const customers = await storage.getCustomers(search);
    res.json(customers);
  });

  app.get(api.customers.get.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      
      const profitDate = req.query.profitDate ? parseDateOnlyInput(String(req.query.profitDate)) : undefined;
      const stats = await storage.getCustomerStats(id, profitDate);
      const history = await storage.getCustomerHistory(id);
      const ledger = await storage.getCustomerLedger(id);
      
      res.json({ ...customer, ...stats, history, ledger });
    } catch (err) {
      if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.customers.create.path, async (req, res) => {
    try {
      const input = api.customers.create.input.parse(req.body);
      const customer = await storage.createCustomer(input);
      res.status(201).json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        throw err;
      }
    }
  });

  app.patch(api.customers.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.customers.update.input.parse(req.body);
      const customer = await storage.updateCustomer(id, input);
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.delete(api.customers.delete.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteCustomer(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post(api.customers.repay.path, async (req, res) => {
    try {
      const input = api.customers.repay.input.parse(req.body);
      const payment = await storage.createPayment({
        customerId: input.customerId,
        amount: input.amount.toString(),
        note: input.note || "Manual repayment",
        billId: null,
        date: input.date ? new Date(input.date) : undefined,
      });
      res.status(201).json(payment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.customers.addCredit.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const input = api.customers.addCredit.input.parse(req.body);
      const ledgerEntry = await storage.createLedgerCredit({
        customerId: id,
        amount: input.amount,
        note: input.note || "Manual credit",
        createdAt: input.date ? new Date(input.date) : undefined,
      });
      const ledger = await storage.getCustomerLedger(id);
      const latestEntry = ledger.find((entry) => entry.id === ledgerEntry.id);
      res.status(201).json(
        latestEntry || {
          ...ledgerEntry,
          amount: Number(ledgerEntry.amount || 0),
          createdAt: ledgerEntry.createdAt?.toISOString() || "",
          runningBalance: 0,
        },
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.customers.updateProfit.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const input = api.customers.updateProfit.input.parse(req.body);
      const result = await storage.setCustomerTotalProfit(id, input.totalProfit);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.customers.statement.path, async (req, res) => {
    const customerId = Number(req.params.id);
    const statement = await getCustomerStatement(db as any, customerId);
    if (!statement) return res.status(404).json({ message: "Customer not found" });

    const rows = [
      ["Customer", statement.customer.name],
      ["Phone", statement.customer.phone],
      ["Total Billed", statement.totalBilled.toFixed(2)],
      ["Total Paid", statement.totalPaid.toFixed(2)],
      ["Balance", statement.balance.toFixed(2)],
      [],
      ["Type", "Reference", "Date", "Amount"],
      ...statement.bills.map((bill) => [
        "Bill",
        `#${bill.id}`,
        bill.date?.toISOString() || "",
        Number(bill.totalAmount || 0).toFixed(2),
      ]),
      ...statement.payments.map((payment) => [
        "Payment",
        `#${payment.id}`,
        payment.date?.toISOString() || "",
        Number(payment.amount || 0).toFixed(2),
      ]),
    ];

    const csv = rows.map((row) => row.map((cell = "") => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=customer-${customerId}-statement.csv`);
    return res.status(200).send(csv);
  });

  // === Products ===
  app.get(api.products.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const products = await storage.getProducts(search);
    res.json(products);
  });
  
  app.post(api.products.create.path, async (req, res) => {
    try {
      console.log("POST /products body:", req.body);
  
      const input = api.products.create.input.parse(req.body);

      // `insertProductSchema` can yield optional fields when the DB has defaults.
      // Normalize here so storage always receives a fully-shaped product insert.
      const normalized = {
        name: input.name,
        price: input.price ?? "0",
        costPrice: input.costPrice ?? "0",
        primaryUnit: input.primaryUnit ?? "PCS",
        secondaryUnit: input.secondaryUnit ?? null,
        unitConversion: input.secondaryUnit ? (input.unitConversion ?? null) : null,
        sku: input.sku ?? null,
        isActive: input.isActive ?? true,
        stock: input.stock ?? 0,
        lowStockThreshold: input.lowStockThreshold ?? 10,
      };

      const product = await storage.createProduct(normalized);
  
      res.status(201).json(product);
  
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors
            .map(e => `${e.path.join(".")} ${e.message}`)
            .join(", ")
        });
      }
  
      const message = err instanceof Error ? err.message : String(err);
      console.error("Create product failed:", message);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
  

  app.patch(api.products.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.products.update.input.parse(req.body);
      const normalized = {
        ...input,
        // Ensure DB-compatible defaults/types when partial update includes these fields.
        ...(input.price !== undefined ? { price: input.price ?? "0" } : {}),
        ...(input.costPrice !== undefined ? { costPrice: input.costPrice ?? "0" } : {}),
        ...(input.primaryUnit !== undefined ? { primaryUnit: input.primaryUnit ?? "PCS" } : {}),
        ...(input.secondaryUnit !== undefined ? { secondaryUnit: input.secondaryUnit ?? null } : {}),
        ...(input.unitConversion !== undefined ? { unitConversion: input.secondaryUnit ? (input.unitConversion ?? null) : null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive ?? true } : {}),
        ...(input.sku !== undefined ? { sku: input.sku ?? null } : {}),
        ...(input.stock !== undefined ? { stock: input.stock ?? 0 } : {}),
        ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold ?? 10 } : {}),
      };
      const product = await storage.updateProduct(id, normalized);
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteProduct(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === Bills ===
  app.get(api.bills.list.path, async (req, res) => {
    const bills = await storage.getBills();
    res.json(bills);
  });

  app.get(api.bills.get.path, async (req, res) => {
    const bill = await storage.getBill(Number(req.params.id));
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    res.json(bill);
  });

  app.post(api.bills.create.path, async (req, res) => {
    try {
      const input = api.bills.create.input.parse(req.body);
      const bill = await storage.createBill(input);
      res.status(201).json(bill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.error(err);
        res.status(400).json({ message: "Validation error: " + err.errors.map(e => e.path.join('.') + " " + e.message).join(', ') });
      } else {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.bills.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.bills.update.input.parse(req.body);
      const updatedBill = await storage.updateBill(id, input);
      res.json(updatedBill);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error: " + err.errors.map(e => e.path.join('.') + " " + e.message).join(', ') });
      } else if (err instanceof Error) {
        const status = err.message === "Bill not found" ? 404 : 400;
        res.status(status).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });
  
  app.delete(api.bills.delete.path, async (req, res) => {
    await storage.deleteBill(Number(req.params.id));
    res.status(204).send();
  });

  // === Quotations ===
  app.get(api.quotations.list.path, async (_req, res) => {
    const quotations = await storage.getQuotations();
    res.json(quotations);
  });

  app.get(api.quotations.get.path, async (req, res) => {
    const quotation = await storage.getQuotation(Number(req.params.id));
    if (!quotation) return res.status(404).json({ message: "Quotation not found" });
    res.json(quotation);
  });

  app.post(api.quotations.create.path, async (req, res) => {
    try {
      const input = api.quotations.create.input.parse(req.body);
      const quotation = await storage.createQuotation(input);
      res.status(201).json(quotation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error: " + err.errors.map((e) => e.path.join(".") + " " + e.message).join(", ") });
      } else {
        console.error(err);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.quotations.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.quotations.update.input.parse(req.body);
      const quotation = await storage.updateQuotation(id, input);
      res.json(quotation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error: " + err.errors.map((e) => e.path.join(".") + " " + e.message).join(", ") });
      } else if (err instanceof Error) {
        const status = err.message === "Quotation not found" ? 404 : 400;
        res.status(status).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.quotations.convert.path, async (req, res) => {
    try {
      const result = await storage.convertQuotationToBill(Number(req.params.id));
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const status = err.message === "Quotation not found" ? 404 : 400;
        res.status(status).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.quotations.updateStatus.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.quotations.updateStatus.input.parse(req.body);
      const quotation = await storage.updateQuotationStatus(id, input.status);
      res.json(quotation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error: " + err.errors.map((e) => e.path.join(".") + " " + e.message).join(", ") });
      } else if (err instanceof Error) {
        const status = err.message === "Quotation not found" ? 404 : 400;
        res.status(status).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // === Dashboard ===
  app.get(api.dashboard.stats.path, async (req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  // === Inventory ===
  app.post(api.inventory.adjustStock.path, async (req, res) => {
    try {
      const input = api.inventory.adjustStock.input.parse(req.body);
      const adjustment = await storage.adjustStock(
        input.productId,
        input.quantity,
        input.type,
        input.reason,
        input.billId
      );
      res.status(201).json(adjustment);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.inventory.bulkAdjust.path, async (req, res) => {
    try {
      const input = api.inventory.bulkAdjust.input.parse(req.body);
      const results = await bulkAdjustStock(db as any, input.items);
      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post(api.inventory.recurringPurchase.path, async (req, res) => {
    try {
      const input = api.inventory.recurringPurchase.input.parse(req.body);
      const results = await recurringPurchase(db as any, input.items, input.note);
      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.inventory.history.path, async (req, res) => {
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    const history = await storage.getStockHistory(productId);
    res.json(history);
  });

  app.get(api.inventory.lowStock.path, async (req, res) => {
    const lowStockProducts = await storage.getLowStockProducts();
    res.json(lowStockProducts);
  });

  app.get(api.inventory.topSelling.path, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const topSelling = await storage.getTopSellingProducts(limit);
    res.json(topSelling);
  });

  app.get(api.inventory.leastSelling.path, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const leastSelling = await storage.getLeastSellingProducts(limit);
    res.json(leastSelling);
  });

  // === Reporting ===
  app.get(api.reporting.profit.path, async (req, res) => {
    try {
      const input = api.reporting.profit.input.parse(req.query);
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
      
      const report = await storage.getProfitReport(startDate, endDate);
      res.json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.reporting.customerProfit.path, async (req, res) => {
    try {
      const input = api.reporting.customerProfit.input.parse(req.query);
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
      
      const report = await storage.getCustomerProfitReport(startDate, endDate);
      res.json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.exports.salesCsv.path, async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;

      const filters = [eq(bills.status, "completed")];
      if (startDate) filters.push(gte(bills.date, startDate));
      if (endDate) filters.push(lte(bills.date, endDate));

      const rows = await db
        .select({
          billId: bills.id,
          billDate: bills.date,
          customerName: customers.name,
          itemName: billItems.name,
          quantity: billItems.quantity,
          price: billItems.price,
          subtotal: billItems.subtotal,
          totalAmount: bills.totalAmount,
          totalProfit: bills.totalProfit,
        })
        .from(bills)
        .leftJoin(customers, eq(bills.customerId, customers.id))
        .innerJoin(billItems, eq(bills.id, billItems.billId))
        .where(and(...filters))
        .orderBy(desc(bills.date));

      const csvRows = [
        ["Bill ID", "Date", "Customer", "Item", "Qty", "Price", "Line Total", "Bill Total", "Bill Profit"],
        ...rows.map((row) => [
          row.billId,
          row.billDate?.toISOString() || "",
          row.customerName || "Walk-in Customer",
          row.itemName,
          row.quantity,
          row.price,
          row.subtotal,
          row.totalAmount,
          row.totalProfit,
        ]),
      ];

      const csv = csvRows
        .map((row) => row.map((cell = "") => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=sales-export.csv");
      res.status(200).send(csv);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  registerAdvancedReportRoutes(app);

  return httpServer;
}
