import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../../shared/routes";

test("customers.create input contract", () => {
  const ok = api.customers.create.input.safeParse({
    name: "Sample User",
    phone: "9876543210",
  });
  assert.equal(ok.success, true);

  const bad = api.customers.create.input.safeParse({
    name: "",
  });
  assert.equal(bad.success, false);
});

test("products.create input contract accepts number and string price", () => {
  const numberInput = api.products.create.input.safeParse({
    name: "Test Product",
    price: 10,
    costPrice: 5,
    stock: 2,
    lowStockThreshold: 1,
  });
  assert.equal(numberInput.success, true);

  const stringInput = api.products.create.input.safeParse({
    name: "Test Product",
    price: "10.00",
    costPrice: "5.00",
  });
  assert.equal(stringInput.success, true);
});

test("products.update input contract accepts numeric stock fields", () => {
  const ok = api.products.update.input.safeParse({
    price: 130,
    costPrice: 103,
    stock: 150,
    lowStockThreshold: 50,
  });
  assert.equal(ok.success, true);
});

test("bills.create input contract", () => {
  const ok = api.bills.create.input.safeParse({
    items: [{ name: "Rice", quantity: 2, baseQuantity: 1.5, price: 60, costPrice: 45 }],
    extraCharges: [{ label: "Transport", amount: 25 }],
    paidAmount: 100,
  });
  assert.equal(ok.success, true);

  const bad = api.bills.create.input.safeParse({
    items: [],
    paidAmount: 0,
  });
  assert.equal(bad.success, false);
});

test("bills.update input contract", () => {
  const ok = api.bills.update.input.safeParse({
    customerId: 4,
    items: [{ productId: 2, name: "Rice", quantity: 3, baseQuantity: 2.5, price: 62, costPrice: 45 }],
    extraCharges: [{ label: "Transport", amount: 40 }],
    editedBy: "Venkat",
    paidAmount: 150,
    date: new Date().toISOString(),
  });
  assert.equal(ok.success, true);

  const bad = api.bills.update.input.safeParse({
    items: [],
    paidAmount: -1,
  });
  assert.equal(bad.success, false);
});

test("quotations.create input contract", () => {
  const ok = api.quotations.create.input.safeParse({
    customerId: 2,
    items: [{ productId: 1, name: "Rice", quantity: 2, baseQuantity: 1.25, price: 60, costPrice: 45 }],
    extraCharges: [{ label: "Transport", amount: 30 }],
    notes: "Valid for 7 days",
    editedBy: "Venkat",
    date: new Date().toISOString(),
  });
  assert.equal(ok.success, true);

  const bad = api.quotations.create.input.safeParse({
    items: [],
  });
  assert.equal(bad.success, false);
});

test("quotations.update input contract", () => {
  const ok = api.quotations.update.input.safeParse({
    items: [{ name: "Oil", quantity: 1, baseQuantity: 0.5, price: 120 }],
    notes: "Updated quote",
  });
  assert.equal(ok.success, true);

  const bad = api.quotations.update.input.safeParse({
    items: [{ name: "Oil", quantity: 0, price: 120 }],
  });
  assert.equal(bad.success, false);
});

test("quotations.updateStatus input contract", () => {
  const ok = api.quotations.updateStatus.input.safeParse({
    status: "sent",
  });
  assert.equal(ok.success, true);

  const bad = api.quotations.updateStatus.input.safeParse({
    status: "converted",
  });
  assert.equal(bad.success, false);
});

test("inventory.adjustStock input contract", () => {
  const ok = api.inventory.adjustStock.input.safeParse({
    productId: 1,
    quantity: 10,
    type: "purchase",
  });
  assert.equal(ok.success, true);

  const bad = api.inventory.adjustStock.input.safeParse({
    productId: 1,
    quantity: 10,
    type: "invalid-type",
  });
  assert.equal(bad.success, false);
});

test("reporting.profit query contract", () => {
  const ok = api.reporting.profit.input.safeParse({
    startDate: new Date().toISOString(),
    endDate: new Date().toISOString(),
  });
  assert.equal(ok.success, true);

  const bad = api.reporting.profit.input.safeParse({
    startDate: new Date().toISOString(),
  });
  assert.equal(bad.success, false);
});

test("customers.addCredit input contract", () => {
  const ok = api.customers.addCredit.input.safeParse({
    amount: 120,
    note: "Notebook entry",
    date: new Date().toISOString(),
  });
  assert.equal(ok.success, true);

  const bad = api.customers.addCredit.input.safeParse({
    amount: 0,
  });
  assert.equal(bad.success, false);
});

test("accounts.addInvestment input contract", () => {
  const ok = api.accounts.addInvestment.input.safeParse({
    amount: 500,
    note: "Initial capital",
    date: new Date().toISOString(),
  });
  assert.equal(ok.success, true);

  const bad = api.accounts.addInvestment.input.safeParse({
    amount: 0,
    note: "",
  });
  assert.equal(bad.success, false);
});
