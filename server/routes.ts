
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === Customers ===
  app.get(api.customers.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const customers = await storage.getCustomers(search);
    res.json(customers);
  });

  app.get(api.customers.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const customer = await storage.getCustomer(id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    
    const stats = await storage.getCustomerStats(id);
    const history = await storage.getCustomerHistory(id);
    
    res.json({ ...customer, ...stats, history });
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

  // === Products ===
  app.get(api.products.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const products = await storage.getProducts(search);
    res.json(products);
  });
  
  app.post(api.products.create.path, async (req, res) => {
     const input = api.products.create.input.parse(req.body);
     const product = await storage.createProduct(input);
     res.status(201).json(product);
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
  
  app.delete(api.bills.delete.path, async (req, res) => {
    await storage.deleteBill(Number(req.params.id));
    res.status(204).send();
  });

  // === Dashboard ===
  app.get(api.dashboard.stats.path, async (req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  return httpServer;
}

// Seed Data Helper
async function seedData() {
  const products = await storage.getProducts();
  if (products.length === 0) {
    console.log("Seeding products...");
    await storage.createProduct({ name: "Rice (1kg)", price: "60.00", sku: "RICE01", isActive: true });
    await storage.createProduct({ name: "Sugar (1kg)", price: "45.00", sku: "SUG01", isActive: true });
    await storage.createProduct({ name: "Milk (1L)", price: "32.00", sku: "MILK01", isActive: true });
    await storage.createProduct({ name: "Bread", price: "40.00", sku: "BRD01", isActive: true });
    await storage.createProduct({ name: "Eggs (12)", price: "80.00", sku: "EGG12", isActive: true });
    await storage.createProduct({ name: "Masala Tea Powder", price: "120.00", sku: "TEA01", isActive: true });
  }

  const customers = await storage.getCustomers();
  if (customers.length === 0) {
    console.log("Seeding customers...");
    await storage.createCustomer({ name: "Rajesh Kumar", phone: "9876543210" });
    await storage.createCustomer({ name: "Priya Sharma", phone: "9876543211" });
    await storage.createCustomer({ name: "Amit Patel", phone: "9876543212" });
  }
}

// Run seed asynchronously on startup
seedData().catch(console.error);
