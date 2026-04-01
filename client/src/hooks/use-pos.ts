import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateBillInput, type UpdateBillInput, type CreateQuotationInput, type UpdateQuotationInput, type UpdateQuotationStatusInput, type CreateRepaymentInput, type CreateLedgerCreditInput } from "@shared/routes";
import { type Customer, type Product, type Bill } from "@shared/schema";

// --- Staff Hooks ---

export function useStaff() {
  return useQuery({
    queryKey: [api.staff.list.path],
    queryFn: async () => {
      const res = await fetch(api.staff.list.path);
      if (!res.ok) throw new Error("Failed to fetch staff");
      return api.staff.list.responses[200].parse(await res.json());
    },
  });
}

export function useStaffDetails(id: number | null) {
  return useQuery({
    queryKey: [api.staff.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.staff.get.path, { id: id as number });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch staff details");
      return api.staff.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; phone: string; salaryType: "daily" | "monthly"; salaryAmount: number }) => {
      const res = await fetch(api.staff.create.path, {
        method: api.staff.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to create staff member");
      }
      return api.staff.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
    },
  });
}

export function useMarkStaffAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { staffId: number; status: "present" | "absent"; date?: string; payment?: number }) => {
      const url = buildUrl(api.staff.markAttendance.path, { id: data.staffId });
      const res = await fetch(url, {
        method: api.staff.markAttendance.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: data.status,
          date: data.date,
          payment: data.payment,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to mark attendance");
      }
      return api.staff.markAttendance.responses[201].parse(await res.json());
    },
    onSuccess: (_attendance, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.staff.get.path, variables.staffId] });
    },
  });
}

export function useUpdateStaffTodayPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { staffId: number; payment: number; date?: string }) => {
      const url = buildUrl(api.staff.updateTodayPayment.path, { id: data.staffId });
      const res = await fetch(url, {
        method: api.staff.updateTodayPayment.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment: data.payment,
          date: data.date,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to update today's payment");
      }
      return api.staff.updateTodayPayment.responses[200].parse(await res.json());
    },
    onSuccess: (_attendance, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.staff.get.path, variables.staffId] });
    },
  });
}

export function useUpdateStaffOverallPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { staffId: number; totalPayment: number }) => {
      const url = buildUrl(api.staff.updateOverallPayment.path, { id: data.staffId });
      const res = await fetch(url, {
        method: api.staff.updateOverallPayment.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalPayment: data.totalPayment }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to update overall payment");
      }
      return api.staff.updateOverallPayment.responses[200].parse(await res.json());
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.staff.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.staff.get.path, variables.staffId] });
    },
  });
}

// --- Accounts Hooks ---

export function useAccounts() {
  return useQuery({
    queryKey: [api.accounts.list.path],
    queryFn: async () => {
      const res = await fetch(api.accounts.list.path);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return api.accounts.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; openingBalance?: number }) => {
      const res = await fetch(api.accounts.create.path, {
        method: api.accounts.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to create account");
      }
      return api.accounts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
    },
  });
}

export function useAccountDetails(id: number) {
  return useQuery({
    queryKey: [api.accounts.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.accounts.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch account details");
      return api.accounts.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useInvestmentDetails() {
  return useQuery({
    queryKey: [api.accounts.investment.path],
    queryFn: async () => {
      const res = await fetch(api.accounts.investment.path);
      if (!res.ok) throw new Error("Failed to fetch investment details");
      return api.accounts.investment.responses[200].parse(await res.json());
    },
  });
}

export function useSpendFromAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number; amount: number; note: string }) => {
      const url = buildUrl(api.accounts.spend.path, { id: data.id });
      const res = await fetch(url, {
        method: api.accounts.spend.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: data.amount, note: data.note }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to subtract amount");
      }
      return api.accounts.spend.responses[201].parse(await res.json());
    },
    onSuccess: (_txn, vars) => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.accounts.get.path, vars.id] });
      queryClient.invalidateQueries({ queryKey: [api.accounts.investment.path] });
    },
  });
}

export function useAddToAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number; amount: number; note: string }) => {
      const url = buildUrl(api.accounts.credit.path, { id: data.id });
      const res = await fetch(url, {
        method: api.accounts.credit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: data.amount, note: data.note }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to add amount");
      }
      return api.accounts.credit.responses[201].parse(await res.json());
    },
    onSuccess: (_txn, vars) => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.accounts.get.path, vars.id] });
      queryClient.invalidateQueries({ queryKey: [api.accounts.investment.path] });
    },
  });
}

export function useAddInvestment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { amount: number; note: string; date?: string }) => {
      const res = await fetch(api.accounts.addInvestment.path, {
        method: api.accounts.addInvestment.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to add investment");
      }
      return api.accounts.addInvestment.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.investment.path] });
    },
  });
}

export function useDeleteAccountSafe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.accounts.deleteSafe.path, { id });
      const res = await fetch(url, {
        method: api.accounts.deleteSafe.method,
      });
      if (!res.ok && res.status !== 204) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete account");
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      queryClient.removeQueries({ queryKey: [api.accounts.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.accounts.investment.path] });
    },
  });
}

export function useDeleteAccountForce() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.accounts.deleteForce.path, { id });
      const res = await fetch(url, {
        method: api.accounts.deleteForce.method,
      });
      if (!res.ok && res.status !== 204) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete account permanently");
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      queryClient.removeQueries({ queryKey: [api.accounts.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.accounts.investment.path] });
    },
  });
}

// --- Customers Hooks ---

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: [api.customers.list.path, search],
    queryFn: async () => {
      const url = search 
        ? `${api.customers.list.path}?search=${encodeURIComponent(search)}` 
        : api.customers.list.path;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch customers");
      return api.customers.list.responses[200].parse(await res.json());
    },
  });
}

export function useCustomer(id: number, profitDate?: string) {
  return useQuery({
    queryKey: [api.customers.get.path, id, profitDate],
    queryFn: async () => {
      const url = buildUrl(api.customers.get.path, { id });
      const res = await fetch(
        profitDate ? `${url}?profitDate=${encodeURIComponent(profitDate)}` : url,
      );
      if (!res.ok) throw new Error("Failed to fetch customer");
      return api.customers.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; phone: string }) => {
      const res = await fetch(api.customers.create.path, {
        method: api.customers.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to create customer");
      }
      return api.customers.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number; name?: string; phone?: string }) => {
      const url = buildUrl(api.customers.update.path, { id: data.id });
      const body = { name: data.name, phone: data.phone };
      const res = await fetch(url, {
        method: api.customers.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to update customer");
      }
      return api.customers.update.responses[200].parse(await res.json());
    },
    onSuccess: (_customer, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      queryClient.invalidateQueries({
        queryKey: [api.customers.get.path, variables.id],
      });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.customers.delete.path, { id });
      const res = await fetch(url, {
        method: api.customers.delete.method,
      });
      if (!res.ok && res.status !== 204) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete customer");
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      queryClient.removeQueries({ queryKey: [api.customers.get.path, id] });
    },
  });
}

export function useRepayCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateRepaymentInput) => {
      const url = buildUrl(api.customers.repay.path, { id: data.customerId });
      const res = await fetch(url, {
        method: api.customers.repay.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to record repayment");
      }
      return api.customers.repay.responses[201].parse(await res.json());
    },
    onSuccess: (_payment, variables) => {
      // Refresh customer details, customer list, and dashboard stats
      queryClient.invalidateQueries({
        queryKey: [api.customers.get.path, variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: [api.customers.list.path],
      });
      queryClient.invalidateQueries({
        queryKey: [api.dashboard.stats.path],
      });
    },
  });
}

export function useAddCustomerCredit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLedgerCreditInput & { customerId: number }) => {
      const url = buildUrl(api.customers.addCredit.path, { id: data.customerId });
      const res = await fetch(url, {
        method: api.customers.addCredit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: data.amount,
          note: data.note,
          date: data.date,
        }),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to add credit");
      }
      return api.customers.addCredit.responses[201].parse(await res.json());
    },
    onSuccess: (_ledgerEntry, variables) => {
      queryClient.invalidateQueries({
        queryKey: [api.customers.get.path, variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: [api.customers.list.path],
      });
      queryClient.invalidateQueries({
        queryKey: [api.dashboard.stats.path],
      });
    },
  });
}

export function useUpdateCustomerProfit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { customerId: number; totalProfit: number }) => {
      const url = buildUrl(api.customers.updateProfit.path, { id: data.customerId });
      const res = await fetch(url, {
        method: api.customers.updateProfit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalProfit: data.totalProfit }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to update customer profit");
      }
      return api.customers.updateProfit.responses[200].parse(await res.json());
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: [api.customers.get.path, variables.customerId],
      });
      queryClient.invalidateQueries({
        queryKey: [api.customers.list.path],
      });
      queryClient.invalidateQueries({
        queryKey: [api.dashboard.stats.path],
      });
    },
  });
}

// --- Products Hooks ---

export function useProducts(search?: string) {
  return useQuery({
    queryKey: [api.products.list.path, search],
    queryFn: async () => {
      const url = search 
        ? `${api.products.list.path}?search=${encodeURIComponent(search)}` 
        : api.products.list.path;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch products");
      return api.products.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      price: number;
      costPrice?: number;
      primaryUnit?: string;
      secondaryUnit?: string | null;
      unitConversion?: number | null;
      sku?: string;
      stock?: number;
      lowStockThreshold?: number;
    }) => {
      const res = await fetch(api.products.create.path, {
        method: api.products.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create product");
      return api.products.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: number;
      name?: string;
      price?: number;
      costPrice?: number;
      primaryUnit?: string;
      secondaryUnit?: string | null;
      unitConversion?: number | null;
      sku?: string;
      stock?: number;
      lowStockThreshold?: number;
    }) => {
      const url = buildUrl(api.products.update.path, { id: data.id });
      const res = await fetch(url, {
        method: api.products.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          price: data.price,
          costPrice: data.costPrice,
          primaryUnit: data.primaryUnit,
          secondaryUnit: data.secondaryUnit,
          unitConversion: data.unitConversion,
          sku: data.sku,
          stock: data.stock,
          lowStockThreshold: data.lowStockThreshold,
        }),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to update product");
      }
      return api.products.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      const res = await fetch(url, {
        method: api.products.delete.method,
      });
      if (!res.ok && res.status !== 204) {
        throw new Error("Failed to delete product");
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
    },
  });
}

// --- Bills Hooks ---

export function useBills() {
  return useQuery({
    queryKey: [api.bills.list.path],
    queryFn: async () => {
      const res = await fetch(api.bills.list.path);
      if (!res.ok) throw new Error("Failed to fetch bills");
      return api.bills.list.responses[200].parse(await res.json());
    },
  });
}

export function useBill(id: number) {
  return useQuery({
    queryKey: [api.bills.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.bills.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch bill");
      return api.bills.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateBillInput) => {
      const res = await fetch(api.bills.create.path, {
        method: api.bills.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to create bill");
      }
      return api.bills.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] }); // Refresh products to show updated stock
    },
  });
}

export function useUpdateBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number; bill: UpdateBillInput }) => {
      const url = buildUrl(api.bills.update.path, { id: data.id });
      const res = await fetch(url, {
        method: api.bills.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.bill),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 404) {
          const error = await res.json().catch(() => null);
          throw new Error(error?.message || "Failed to update bill");
        }
        throw new Error("Failed to update bill");
      }
      return api.bills.update.responses[200].parse(await res.json());
    },
    onSuccess: (_bill, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bills.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
    },
  });
}

export function useQuotations() {
  return useQuery({
    queryKey: [api.quotations.list.path],
    queryFn: async () => {
      const res = await fetch(api.quotations.list.path);
      if (!res.ok) throw new Error("Failed to fetch quotations");
      return api.quotations.list.responses[200].parse(await res.json());
    },
  });
}

export function useQuotation(id: number) {
  return useQuery({
    queryKey: [api.quotations.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.quotations.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch quotation");
      return api.quotations.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateQuotationInput) => {
      const res = await fetch(api.quotations.create.path, {
        method: api.quotations.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json().catch(() => null);
          throw new Error(error?.message || "Validation failed");
        }
        throw new Error("Failed to create quotation");
      }
      return api.quotations.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.quotations.list.path] });
    },
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number; quotation: UpdateQuotationInput }) => {
      const url = buildUrl(api.quotations.update.path, { id: data.id });
      const res = await fetch(url, {
        method: api.quotations.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.quotation),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 404) {
          const error = await res.json().catch(() => null);
          throw new Error(error?.message || "Failed to update quotation");
        }
        throw new Error("Failed to update quotation");
      }
      return api.quotations.update.responses[200].parse(await res.json());
    },
    onSuccess: (_quotation, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.quotations.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.quotations.get.path, variables.id] });
    },
  });
}

export function useConvertQuotationToBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.quotations.convert.path, { id });
      const res = await fetch(url, {
        method: api.quotations.convert.method,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to convert quotation");
      }
      return api.quotations.convert.responses[201].parse(await res.json());
    },
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: [api.quotations.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.quotations.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.bills.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bills.get.path, result.bill.id] });
      queryClient.invalidateQueries({ queryKey: [api.customers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
    },
  });
}

export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: number; status: UpdateQuotationStatusInput["status"] }) => {
      const url = buildUrl(api.quotations.updateStatus.path, { id: data.id });
      const res = await fetch(url, {
        method: api.quotations.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: data.status }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to update quotation status");
      }
      return api.quotations.updateStatus.responses[200].parse(await res.json());
    },
    onSuccess: (quotation) => {
      queryClient.invalidateQueries({ queryKey: [api.quotations.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.quotations.get.path, quotation.id] });
    },
  });
}

// --- Dashboard Hooks ---

export function useDashboardStats() {
  return useQuery({
    queryKey: [api.dashboard.stats.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.stats.path);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return api.dashboard.stats.responses[200].parse(await res.json());
    },
    // Refresh stats more frequently for POS environment
    refetchInterval: 30000, 
  });
}

// --- Ops Hooks ---

export function useBulkAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { items: Array<{ productId: number; quantity: number; type: 'purchase' | 'sale' | 'adjustment' | 'damage' | 'return'; reason?: string }> }) => {
      const res = await fetch(api.inventory.bulkAdjust.path, {
        method: api.inventory.bulkAdjust.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to apply bulk stock update");
      }
      return api.inventory.bulkAdjust.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.inventory.lowStock.path] });
      queryClient.invalidateQueries({ queryKey: [api.inventory.history.path] });
    },
  });
}

export function useRecurringPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { note?: string; items: Array<{ productId: number; quantity: number; costPrice?: number }> }) => {
      const res = await fetch(api.inventory.recurringPurchase.path, {
        method: api.inventory.recurringPurchase.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to apply recurring purchase");
      }
      return api.inventory.recurringPurchase.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.inventory.lowStock.path] });
      queryClient.invalidateQueries({ queryKey: [api.inventory.history.path] });
    },
  });
}
