import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { formatBillLabel } from "@shared/billing";
import { useBills } from "@/hooks/use-pos";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Users, Calendar, Filter, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrencyINR, formatDate, formatDateTime, toDateInputString } from "@/lib/format";
import { getISTDateKey, getISTDayBounds, getISTMonthBounds } from "@shared/timezone";

type DateRange = 'daily' | 'weekly' | 'monthly' | 'custom';
type MirchiPowderSaleDetail = {
  billId: number;
  date: string | Date;
  quantity: number;
  unit: string;
  rate: number;
  sales: number;
  profit: number;
};

type MirchiPowderCustomerRow = {
  customerId: number | null;
  customerName: string;
  totalQuantity: number;
  unit: string;
  totalSales: number;
  totalProfit: number;
  details: MirchiPowderSaleDetail[];
};

type CustomerProfitItemRow = {
  productId: number | null;
  itemName: string;
  quantity: number;
  unit: string;
  totalSales: number;
  totalProfit: number;
};

type CustomerProfitRow = {
  customerId: number | null;
  customerName: string;
  totalSales: number;
  totalProfit: number;
  items: CustomerProfitItemRow[];
};

type ItemBillSearchResult = {
  id: number;
  customerName: string | null;
  date: string | Date | null;
  totalAmount: string | number;
  totalProfit?: string | number | null;
  matchedItems: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    price: string | number;
    subtotal: string | number;
  }>;
};

export default function Reporting() {
  const todayBounds = getISTDayBounds(new Date());
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialRange = searchParams?.get("range");

  const [dateRange, setDateRange] = useState<DateRange>(
    initialRange === "weekly" || initialRange === "monthly" || initialRange === "custom" ? initialRange : "daily",
  );
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(todayBounds.start);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(todayBounds.end);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [selectedMirchiCustomer, setSelectedMirchiCustomer] = useState<MirchiPowderCustomerRow | null>(null);
  const [selectedCustomerProfit, setSelectedCustomerProfit] = useState<CustomerProfitRow | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const { data: bills, isLoading: billsLoading } = useBills();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextUrl = `${window.location.pathname}?range=${dateRange}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [dateRange]);

  const getDateRange = () => {
    const today = new Date();
    const todayKey = getISTDateKey(today);

    switch (dateRange) {
      case 'daily':
        return getISTDayBounds(today);
      case 'weekly': {
        const weekStart = new Date(`${todayKey}T00:00:00`);
        const firstDayOfWeek = new Date(weekStart);
        firstDayOfWeek.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);

        return {
          start: getISTDayBounds(toDateInputString(firstDayOfWeek)).start,
          end: getISTDayBounds(toDateInputString(lastDayOfWeek)).end,
        };
      }
      case 'monthly': {
        const monthBounds = getISTMonthBounds(today);
        return {
          start: monthBounds.start,
          end: monthBounds.end,
        };
      }
      case 'custom':
        return {
          start: customStartDate || todayBounds.start,
          end: customEndDate || todayBounds.end,
        };
      default:
        return getISTDayBounds(today);
    }
  };

  const { start, end } = getDateRange();
  const startDateParam = toDateInputString(start);
  const endDateParam = toDateInputString(end);

  const { data: profitReport, isLoading: profitLoading } = useQuery({
    queryKey: [api.reporting.profit.path, startDateParam, endDateParam],
    queryFn: async () => {
      const url = buildUrl(api.reporting.profit.path) + `?startDate=${startDateParam}&endDate=${endDateParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch profit report");
      return api.reporting.profit.responses[200].parse(await res.json());
    },
  });

  const { data: customerProfit, isLoading: customerProfitLoading } = useQuery({
    queryKey: [api.reporting.customerProfit.path, startDateParam, endDateParam],
    queryFn: async () => {
      const url = buildUrl(api.reporting.customerProfit.path) + `?startDate=${startDateParam}&endDate=${endDateParam}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch customer profit report");
      return api.reporting.customerProfit.responses[200].parse(await res.json());
    },
  });

  const trimmedItemSearch = itemSearch.trim();

  const { data: itemBillSearchResults = [], isFetching: itemBillSearchLoading } = useQuery({
    queryKey: [api.reporting.itemBills.path, startDateParam, endDateParam, trimmedItemSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDateParam,
        endDate: endDateParam,
        search: trimmedItemSearch,
      });
      const res = await fetch(`${buildUrl(api.reporting.itemBills.path)}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch item bill search results");
      return api.reporting.itemBills.responses[200].parse(await res.json()) as ItemBillSearchResult[];
    },
    enabled: trimmedItemSearch.length > 0,
  });

  const filteredBills = useMemo(() => {
    return (bills || []).filter((bill) => {
      if (!bill.date) return false;
      const billDate = new Date(bill.date);
      return billDate >= start && billDate <= end;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [bills, end, start]);

  const isSearchingItems = trimmedItemSearch.length > 0;
  const salesRowsLoading = billsLoading || (isSearchingItems && itemBillSearchLoading);
  const hasSalesRows = isSearchingItems ? itemBillSearchResults.length > 0 : filteredBills.length > 0;

  const mirchiPowderTotals = useMemo(() => {
    const quantityByUnit = new Map<string, number>();
    let totalSales = 0;
    let totalProfit = 0;

    for (const customer of profitReport?.mirchiPowderCustomers ?? []) {
      const unit = customer.unit?.trim() || "UNITS";
      quantityByUnit.set(unit, (quantityByUnit.get(unit) ?? 0) + Number(customer.totalQuantity || 0));
      totalSales += Number(customer.totalSales || 0);
      totalProfit += Number(customer.totalProfit || 0);
    }

    const quantityLabel = Array.from(quantityByUnit.entries())
      .map(([unit, totalQuantity]) => `${totalQuantity} ${unit}`)
      .join(", ");

    return {
      quantityLabel,
      totalSales,
      totalProfit,
    };
  }, [profitReport?.mirchiPowderCustomers]);

  useEffect(() => {
    if (!selectedMirchiCustomer || !profitReport?.mirchiPowderCustomers) return;

    const refreshedCustomer = profitReport.mirchiPowderCustomers.find((customer) =>
      customer.customerId === selectedMirchiCustomer.customerId &&
      customer.unit === selectedMirchiCustomer.unit &&
      customer.customerName === selectedMirchiCustomer.customerName,
    );

    setSelectedMirchiCustomer(refreshedCustomer ?? null);
  }, [profitReport?.mirchiPowderCustomers, selectedMirchiCustomer]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-primary" />
          Sales & Profit Reporting
        </h1>
        <p className="text-muted-foreground mt-1">Analyze sales performance, profit margins, and customer profitability.</p>
      </div>

      {/* Date Range Filters */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm mb-8">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">Date Range:</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant={dateRange === 'daily' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange('daily')}
            >
              Daily
            </Button>
            <Button
              variant={dateRange === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange('weekly')}
            >
              Weekly
            </Button>
            <Button
              variant={dateRange === 'monthly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange('monthly')}
            >
              Monthly
            </Button>
            <Button
              variant={dateRange === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange('custom')}
            >
              Custom Range
            </Button>
          </div>

          {dateRange === 'custom' && (
            <div className="flex gap-2 items-center">
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[200px] justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {customStartDate ? formatDate(customStartDate, "PPP") : <span>Start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={customStartDate}
                    onSelect={(date) => {
                      if (!date) return;
                      setCustomStartDate(getISTDayBounds(getISTDateKey(date)).start);
                      setIsStartDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">to</span>
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[200px] justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {customEndDate ? formatDate(customEndDate, "PPP") : <span>End date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={customEndDate}
                    onSelect={(date) => {
                      if (!date) return;
                      setCustomEndDate(getISTDayBounds(getISTDateKey(date)).end);
                      setIsEndDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="ml-auto text-sm text-muted-foreground">
            {formatDate(start, "MMM dd, yyyy")} - {formatDate(end, "MMM dd, yyyy")}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        <div className="min-w-0 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
            <span className="min-w-0 break-words text-sm text-muted-foreground">Total Sales</span>
            <DollarSign className="h-5 w-5 shrink-0 text-blue-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="break-words text-2xl font-bold font-display text-blue-600 sm:text-3xl">
              {formatCurrencyINR(profitReport?.totalSales || 0)}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
            <span className="min-w-0 break-words text-sm text-muted-foreground">Total Profit</span>
            <TrendingUp className="h-5 w-5 shrink-0 text-green-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="break-words text-2xl font-bold font-display text-green-600 sm:text-3xl">
              {formatCurrencyINR(profitReport?.totalProfit || 0)}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
            <span className="min-w-0 break-words text-sm text-muted-foreground">Total Investment</span>
            <TrendingDown className="h-5 w-5 shrink-0 text-orange-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="break-words text-2xl font-bold font-display text-orange-600 sm:text-3xl">
              {formatCurrencyINR(profitReport?.totalInvestment || 0)}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
            <span className="min-w-0 break-words text-sm text-muted-foreground">Mirchi Powder Sales</span>
            <DollarSign className="h-5 w-5 shrink-0 text-amber-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="break-words text-2xl font-bold font-display text-amber-600 sm:text-3xl">
              {formatCurrencyINR(profitReport?.mirchiPowderSales || 0)}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
            <span className="min-w-0 break-words text-sm text-muted-foreground">Mirchi Powder Profit</span>
            <TrendingUp className="h-5 w-5 shrink-0 text-rose-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="break-words text-2xl font-bold font-display text-rose-600 sm:text-3xl">
              {formatCurrencyINR(profitReport?.mirchiPowderProfit || 0)}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-4">
            <span className="min-w-0 break-words text-sm text-muted-foreground">Mirchi Powder Investment</span>
            <TrendingDown className="h-5 w-5 shrink-0 text-red-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="break-words text-2xl font-bold font-display text-red-600 sm:text-3xl">
              {formatCurrencyINR(profitReport?.mirchiPowderInvestment || 0)}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card p-6 rounded-xl border border-border shadow-sm mb-8">
        <h2 className="text-lg font-bold mb-2">Mirchi Powder Handling</h2>
        <p className="text-sm text-muted-foreground">
          The main sales, profit, and investment totals on this page exclude only the item named <span className="font-semibold text-foreground">Mirchi Powder</span>.
          Its sales and profit are shown separately in the cards above.
        </p>
      </div>

      {/* Profit Margin */}
      {profitReport && profitReport.totalSales > 0 && (
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm mb-8">
          <h2 className="text-lg font-bold mb-4">Profit Margin</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(profitReport.totalProfit / profitReport.totalSales) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-lg font-bold">
              {((profitReport.totalProfit / profitReport.totalSales) * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      <div id="sales-breakdown" className="bg-card p-6 rounded-xl border border-border shadow-sm mb-8 scroll-mt-24">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Sales Breakdown
          </h2>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Search item, e.g. pulav"
              className="h-10 pl-9 pr-10"
            />
            {itemSearch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                onClick={() => setItemSearch("")}
                aria-label="Clear item search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {salesRowsLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : hasSalesRows ? (
          <div className="overflow-x-auto">
            {isSearchingItems ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Bill</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Matched Items</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {itemBillSearchResults.map((bill) => (
                    <tr key={bill.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono">{formatBillLabel(bill)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{bill.date ? formatDateTime(bill.date, "dd MMM yyyy, hh:mm a") : "-"}</td>
                      <td className="px-4 py-3">{bill.customerName || "Walk-in Customer"}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {bill.matchedItems.map((item, index) => (
                            <div key={`${bill.id}-${item.name}-${index}`} className="font-medium">
                              {item.name}
                              <span className="ml-2 font-mono text-xs text-muted-foreground">
                                {item.quantity} {item.unit || "PCS"} · {formatCurrencyINR(Number(item.subtotal || 0))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrencyINR(Number(bill.totalAmount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Bill</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono">{formatBillLabel(bill)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{bill.date ? formatDateTime(bill.date, "dd MMM yyyy, hh:mm a") : "-"}</td>
                      <td className="px-4 py-3">{bill.customerName || "Walk-in Customer"}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrencyINR(Number(bill.totalAmount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {isSearchingItems
              ? `No bills found with item "${trimmedItemSearch}" in the selected date range.`
              : "No sales found for the selected date range."}
          </div>
        )}
      </div>

      <div id="profit-breakdown" className="bg-card p-6 rounded-xl border border-border shadow-sm scroll-mt-24">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Customer-wise Profit Analysis
        </h2>
        {customerProfitLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : customerProfit && customerProfit.length > 0 ? (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {customerProfit.map((customer, index) => (
              <button
                key={`${customer.customerId}-${index}`}
                type="button"
                className="w-full p-4 bg-muted/50 rounded-lg border border-border text-left hover:bg-muted/70 transition-colors"
                onClick={() => setSelectedCustomerProfit(customer)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-lg">{customer.customerName}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Total Sales: <span className="font-semibold text-foreground">{formatCurrencyINR(customer.totalSales)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Open to view item-wise profit
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-600">{formatCurrencyINR(customer.totalProfit)}</div>
                    <div className="text-xs text-muted-foreground">Profit</div>
                    {customer.totalSales > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Margin: {((customer.totalProfit / customer.totalSales) * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No sales data available for the selected date range.
          </div>
        )}
      </div>

      <div className="bg-card p-6 rounded-xl border border-border shadow-sm mt-8">
        <h2 className="text-xl font-bold mb-4">Mirchi Powder Customer Quantity</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Tap any customer row to view date-wise Mirchi Powder sales, rate, and totals for the selected date range.
        </p>
        {profitLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : profitReport?.mirchiPowderCustomers && profitReport.mirchiPowderCustomers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                  <th className="px-4 py-3 font-semibold text-right">Sales</th>
                  <th className="px-4 py-3 font-semibold text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profitReport.mirchiPowderCustomers.map((customer, index) => (
                  <tr
                    key={`${customer.customerId ?? "walk-in"}-${customer.unit}-${index}`}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setSelectedMirchiCustomer(customer)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedMirchiCustomer(customer);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${customer.customerName} Mirchi Powder sales`}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{customer.customerName}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {customer.totalQuantity} {customer.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrencyINR(customer.totalSales)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">{formatCurrencyINR(customer.totalProfit)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40 border-t-2 border-border">
                  <td className="px-4 py-3 font-bold">Total</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    {mirchiPowderTotals.quantityLabel}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    {formatCurrencyINR(mirchiPowderTotals.totalSales)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-green-600">
                    {formatCurrencyINR(mirchiPowderTotals.totalProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No Mirchi Powder sales found for the selected date range.
          </div>
        )}
      </div>

      <Dialog open={!!selectedMirchiCustomer} onOpenChange={(open) => !open && setSelectedMirchiCustomer(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMirchiCustomer?.customerName} Mirchi Powder Details
            </DialogTitle>
            <DialogDescription>
              Date-wise Mirchi Powder entries for {dateRange === "custom" ? "your custom range" : `${dateRange} range`} from {formatDate(start)} to {formatDate(end)}.
            </DialogDescription>
          </DialogHeader>

          {selectedMirchiCustomer && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Total Quantity</div>
                  <div className="mt-1 text-2xl font-bold font-mono">
                    {selectedMirchiCustomer.totalQuantity} {selectedMirchiCustomer.unit}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Within the selected range</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Total Sales</div>
                  <div className="mt-1 text-2xl font-bold font-mono">
                    {formatCurrencyINR(selectedMirchiCustomer.totalSales)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">From {formatDate(start)} to {formatDate(end)}</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Total Profit</div>
                  <div className="mt-1 text-2xl font-bold font-mono text-green-600">
                    {formatCurrencyINR(selectedMirchiCustomer.totalProfit)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Selected-range cumulative total</div>
                </div>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-4 py-3">
                  <h3 className="font-semibold">Individual Mirchi Powder Sales</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Bill</th>
                        <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                        <th className="px-4 py-3 font-semibold text-right">Rate</th>
                        <th className="px-4 py-3 font-semibold text-right">Sales</th>
                        <th className="px-4 py-3 font-semibold text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedMirchiCustomer.details.map((detail) => (
                        <tr key={`${detail.billId}-${detail.date}-${detail.quantity}`} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">{formatDateTime(detail.date, "dd MMM yyyy, hh:mm a")}</td>
                          <td className="px-4 py-3 font-mono">#{detail.billId}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {detail.quantity} {detail.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatCurrencyINR(detail.rate)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatCurrencyINR(detail.sales)}</td>
                          <td className="px-4 py-3 text-right font-mono text-green-600">{formatCurrencyINR(detail.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedCustomerProfit} onOpenChange={(open) => !open && setSelectedCustomerProfit(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCustomerProfit?.customerName} Item-wise Profit
            </DialogTitle>
            <DialogDescription>
              Product-wise profit details from {formatDate(start)} to {formatDate(end)}.
            </DialogDescription>
          </DialogHeader>

          {selectedCustomerProfit && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Total Sales</div>
                  <div className="mt-1 text-2xl font-bold font-mono">
                    {formatCurrencyINR(selectedCustomerProfit.totalSales)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Total Profit</div>
                  <div className="mt-1 text-2xl font-bold font-mono text-green-600">
                    {formatCurrencyINR(selectedCustomerProfit.totalProfit)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm text-muted-foreground">Margin</div>
                  <div className="mt-1 text-2xl font-bold font-mono">
                    {selectedCustomerProfit.totalSales > 0
                      ? `${((selectedCustomerProfit.totalProfit / selectedCustomerProfit.totalSales) * 100).toFixed(1)}%`
                      : "0.0%"}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-4 py-3">
                  <h3 className="font-semibold">Item-wise Profit Details</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Item</th>
                        <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                        <th className="px-4 py-3 font-semibold text-right">Sales</th>
                        <th className="px-4 py-3 font-semibold text-right">Profit</th>
                        <th className="px-4 py-3 font-semibold text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedCustomerProfit.items.map((item, index) => (
                        <tr key={`${item.productId ?? item.itemName}-${index}`} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{item.itemName}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatCurrencyINR(item.totalSales)}</td>
                          <td className="px-4 py-3 text-right font-mono text-green-600">{formatCurrencyINR(item.totalProfit)}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.totalSales > 0 ? `${((item.totalProfit / item.totalSales) * 100).toFixed(1)}%` : "0.0%"}
                          </td>
                        </tr>
                      ))}
                      {selectedCustomerProfit.items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                            No item-wise profit rows found for this customer in the selected range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

