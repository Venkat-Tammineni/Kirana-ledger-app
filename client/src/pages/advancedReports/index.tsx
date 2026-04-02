import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, endOfQuarter, endOfToday, endOfWeek, startOfMonth, startOfQuarter, startOfToday, startOfWeek } from "date-fns";
import { z } from "zod";
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  CreditCard,
  FileBarChart,
  HandCoins,
  PackageSearch,
  TrendingUp,
  Users,
} from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, YAxis, LineChart, Line } from "recharts";
import { api, buildUrl } from "@shared/routes";
import { FiltersBar, type AdvancedGranularity, type AdvancedPreset, type SortDirection } from "@/components/advancedReports/FiltersBar";
import { MetricCard } from "@/components/advancedReports/MetricCard";
import { ReportTable, processReportRows, type ReportColumn } from "@/components/advancedReports/ReportTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyINR, formatDate, toDateInputString } from "@/lib/format";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type AdvancedTab =
  | "landing"
  | "sales"
  | "purchases"
  | "profitLoss"
  | "outstanding"
  | "stockSummary"
  | "cashbook";

type OverviewResponse = z.infer<(typeof api.advancedReports.overview.responses)[200]>;
type SalesResponse = z.infer<(typeof api.advancedReports.sales.responses)[200]>;
type PurchasesResponse = z.infer<(typeof api.advancedReports.purchases.responses)[200]>;
type ProfitLossResponse = z.infer<(typeof api.advancedReports.profitLoss.responses)[200]>;
type OutstandingResponse = z.infer<(typeof api.advancedReports.outstanding.responses)[200]>;
type StockSummaryResponse = z.infer<(typeof api.advancedReports.stockSummary.responses)[200]>;
type CashbookResponse = z.infer<(typeof api.advancedReports.cashbook.responses)[200]>;

const ROWS_PER_PAGE = 20;
const PIE_COLORS = ["#059669", "#0f766e", "#f59e0b", "#dc2626", "#2563eb"];

async function fetchAdvanced<T>(
  path: string,
  params: Record<string, string>,
  parser: { parse: (value: unknown) => T },
) {
  const url = new URL(buildUrl(path), window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), { credentials: "include" });
  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to fetch advanced report");
  }

  return parser.parse(await response.json());
}

function getFinancialYearBounds(now: Date) {
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: new Date(year, 3, 1, 0, 0, 0, 0),
    end: new Date(year + 1, 2, 31, 23, 59, 59, 999),
  };
}

function resolveRange(preset: AdvancedPreset, customStart: string, customEnd: string) {
  const now = new Date();

  if (preset === "week") {
    return {
      start: startOfWeek(now, { weekStartsOn: 1 }),
      end: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }

  if (preset === "month") {
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }

  if (preset === "quarter") {
    return {
      start: startOfQuarter(now),
      end: endOfQuarter(now),
    };
  }

  if (preset === "financialYear") {
    return getFinancialYearBounds(now);
  }

  if (preset === "custom") {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfToday();
    const end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : endOfToday();
    return { start, end };
  }

  return {
    start: startOfToday(),
    end: endOfToday(),
  };
}

function getBucketLabel(dateValue: string, granularity: AdvancedGranularity) {
  const date = new Date(dateValue);
  if (granularity === "month") return formatDate(date, "MMM yyyy");
  if (granularity === "week") return `${formatDate(startOfWeek(date, { weekStartsOn: 1 }), "dd MMM")} week`;
  return formatDate(date, "dd MMM");
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(columns: Array<{ label: string; key: string }>, rows: Array<Record<string, unknown>>) {
  const csvRows = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => row[column.key] ?? "")),
  ];

  return csvRows
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default function AdvancedReports() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdvancedTab>("landing");
  const [preset, setPreset] = useState<AdvancedPreset>("today");
  const [granularity, setGranularity] = useState<AdvancedGranularity>("day");
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState(toDateInputString(new Date()));
  const [customEnd, setCustomEnd] = useState(toDateInputString(new Date()));
  const [seriesVisible, setSeriesVisible] = useState({
    revenue: true,
    cost: true,
    profit: true,
  });

  const range = useMemo(() => resolveRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const queryParams = useMemo(
    () => ({
      startDate: toDateInputString(range.start),
      endDate: toDateInputString(range.end),
      granularity,
    }),
    [range, granularity],
  );

  const overviewQuery = useQuery({
    queryKey: [api.advancedReports.overview.path, queryParams.startDate, queryParams.endDate, queryParams.granularity],
    queryFn: () => fetchAdvanced<OverviewResponse>(api.advancedReports.overview.path, queryParams, api.advancedReports.overview.responses[200]),
  });
  const salesQuery = useQuery({
    queryKey: [api.advancedReports.sales.path, queryParams.startDate, queryParams.endDate, queryParams.granularity],
    queryFn: () => fetchAdvanced<SalesResponse>(api.advancedReports.sales.path, queryParams, api.advancedReports.sales.responses[200]),
  });
  const purchasesQuery = useQuery({
    queryKey: [api.advancedReports.purchases.path, queryParams.startDate, queryParams.endDate, queryParams.granularity],
    queryFn: () => fetchAdvanced<PurchasesResponse>(api.advancedReports.purchases.path, queryParams, api.advancedReports.purchases.responses[200]),
  });
  const profitLossQuery = useQuery({
    queryKey: [api.advancedReports.profitLoss.path, queryParams.startDate, queryParams.endDate, queryParams.granularity],
    queryFn: () => fetchAdvanced<ProfitLossResponse>(api.advancedReports.profitLoss.path, queryParams, api.advancedReports.profitLoss.responses[200]),
  });
  const outstandingQuery = useQuery({
    queryKey: [api.advancedReports.outstanding.path],
    queryFn: () => fetchAdvanced<OutstandingResponse>(api.advancedReports.outstanding.path, {}, api.advancedReports.outstanding.responses[200]),
  });
  const stockQuery = useQuery({
    queryKey: [api.advancedReports.stockSummary.path],
    queryFn: () => fetchAdvanced<StockSummaryResponse>(api.advancedReports.stockSummary.path, {}, api.advancedReports.stockSummary.responses[200]),
  });
  const cashbookQuery = useQuery({
    queryKey: [api.advancedReports.cashbook.path, queryParams.startDate, queryParams.endDate, queryParams.granularity],
    queryFn: () => fetchAdvanced<CashbookResponse>(api.advancedReports.cashbook.path, queryParams, api.advancedReports.cashbook.responses[200]),
  });

  const queryErrors = [
    overviewQuery.error,
    salesQuery.error,
    purchasesQuery.error,
    profitLossQuery.error,
    outstandingQuery.error,
    stockQuery.error,
    cashbookQuery.error,
  ].filter(Boolean) as Error[];
  const primaryError = queryErrors[0] ?? null;

  useEffect(() => {
    setPage(1);
    setSelectedBucket(null);
  }, [activeTab, search, sortDirection, preset, granularity, customStart, customEnd]);

  const salesRows = useMemo(() => {
    const rows = salesQuery.data?.table ?? [];
    return selectedBucket ? rows.filter((row) => getBucketLabel(row.date, granularity) === selectedBucket) : rows;
  }, [salesQuery.data, selectedBucket, granularity]);

  const purchaseRows = useMemo(() => {
    const rows = purchasesQuery.data?.table ?? [];
    return selectedBucket ? rows.filter((row) => getBucketLabel(row.date, granularity) === selectedBucket) : rows;
  }, [purchasesQuery.data, selectedBucket, granularity]);

  const cashbookRows = useMemo(() => {
    const rows = cashbookQuery.data?.table ?? [];
    return selectedBucket ? rows.filter((row) => getBucketLabel(row.date, granularity) === selectedBucket) : rows;
  }, [cashbookQuery.data, selectedBucket, granularity]);

  const processedSales = useMemo(
    () => processReportRows(salesRows, search, sortDirection, "total", ["invoiceNo", "customer", "status"], page, ROWS_PER_PAGE),
    [salesRows, search, sortDirection, page],
  );
  const processedPurchases = useMemo(
    () => processReportRows(purchaseRows, search, sortDirection, "total", ["invoiceNo", "supplier", "status"], page, ROWS_PER_PAGE),
    [purchaseRows, search, sortDirection, page],
  );
  const processedOutstanding = useMemo(
    () => processReportRows(outstandingQuery.data?.table ?? [], search, sortDirection, "balance", ["customer", "phone"], page, ROWS_PER_PAGE),
    [outstandingQuery.data, search, sortDirection, page],
  );
  const processedStock = useMemo(
    () => processReportRows(stockQuery.data?.table ?? [], search, sortDirection, "value", ["item"], page, ROWS_PER_PAGE),
    [stockQuery.data, search, sortDirection, page],
  );
  const processedCashbook = useMemo(
    () => processReportRows(cashbookRows, search, sortDirection, "runningBalance", ["category", "note"], page, ROWS_PER_PAGE),
    [cashbookRows, search, sortDirection, page],
  );

  const salesColumns: Array<ReportColumn<SalesResponse["table"][number]>> = [
    { key: "invoiceNo", label: "Invoice" },
    { key: "customer", label: "Customer" },
    { key: "date", label: "Date", render: (row) => formatDate(row.date) },
    { key: "itemsCount", label: "Items" },
    { key: "subtotal", label: "Subtotal", render: (row) => formatCurrencyINR(row.subtotal) },
    { key: "gst", label: "GST", render: (row) => formatCurrencyINR(row.gst) },
    { key: "total", label: "Total", render: (row) => formatCurrencyINR(row.total) },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge variant={row.status === "paid" ? "default" : row.status === "partial" ? "secondary" : "destructive"}>{row.status}</Badge>,
    },
  ];

  const purchaseColumns: Array<ReportColumn<PurchasesResponse["table"][number]>> = [
    { key: "invoiceNo", label: "Entry" },
    { key: "supplier", label: "Supplier / Note" },
    { key: "date", label: "Date", render: (row) => formatDate(row.date) },
    { key: "itemsCount", label: "Items" },
    { key: "subtotal", label: "Subtotal", render: (row) => formatCurrencyINR(row.subtotal) },
    { key: "gst", label: "GST", render: (row) => formatCurrencyINR(row.gst) },
    { key: "total", label: "Total", render: (row) => formatCurrencyINR(row.total) },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge>{row.status}</Badge>,
    },
  ];

  const outstandingColumns: Array<ReportColumn<OutstandingResponse["table"][number]>> = [
    { key: "customer", label: "Customer" },
    { key: "phone", label: "Phone" },
    { key: "balance", label: "Balance", render: (row) => formatCurrencyINR(row.balance) },
    { key: "lastTransaction", label: "Last Transaction", render: (row) => (row.lastTransaction ? formatDate(row.lastTransaction) : "NA") },
    { key: "oldestDue", label: "Oldest Due", render: (row) => (row.oldestDue ? formatDate(row.oldestDue) : "NA") },
    {
      key: "remind",
      label: "Action",
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(row.remindText);
              toast({ title: "Reminder copied", description: `WhatsApp text copied for ${row.customer}.` });
            } catch {
              toast({ title: "Reminder ready", description: row.remindText });
            }
          }}
        >
          Remind
        </Button>
      ),
    },
  ];

  const stockColumns: Array<ReportColumn<StockSummaryResponse["table"][number]>> = [
    { key: "item", label: "Item" },
    { key: "qty", label: "Qty" },
    { key: "buyPrice", label: "Buy Price", render: (row) => formatCurrencyINR(row.buyPrice) },
    { key: "sellPrice", label: "Sell Price", render: (row) => formatCurrencyINR(row.sellPrice) },
    { key: "value", label: "Value", render: (row) => formatCurrencyINR(row.value) },
    { key: "profit", label: "Profit", render: (row) => formatCurrencyINR(row.profit) },
    { key: "marginPct", label: "Margin", render: (row) => `${row.marginPct.toFixed(1)}%` },
  ];

  const cashbookColumns: Array<ReportColumn<CashbookResponse["table"][number]>> = [
    { key: "date", label: "Date", render: (row) => formatDate(row.date) },
    { key: "category", label: "Category" },
    { key: "note", label: "Note" },
    { key: "cashIn", label: "Cash In", render: (row) => formatCurrencyINR(row.cashIn) },
    { key: "cashOut", label: "Cash Out", render: (row) => formatCurrencyINR(row.cashOut) },
    { key: "runningBalance", label: "Running Balance", render: (row) => formatCurrencyINR(row.runningBalance) },
  ];

  const activeExport = useMemo(() => {
    switch (activeTab) {
      case "sales":
        return {
          title: "advanced-sales-report",
          columns: salesColumns.map((column) => ({ label: column.label, key: String(column.key) })),
          rows: processedSales.allRows as Array<Record<string, unknown>>,
        };
      case "purchases":
        return {
          title: "advanced-purchase-report",
          columns: purchaseColumns.map((column) => ({ label: column.label, key: String(column.key) })),
          rows: processedPurchases.allRows as Array<Record<string, unknown>>,
        };
      case "outstanding":
        return {
          title: "advanced-outstanding-report",
          columns: outstandingColumns.filter((column) => String(column.key) !== "remind").map((column) => ({ label: column.label, key: String(column.key) })),
          rows: processedOutstanding.allRows as Array<Record<string, unknown>>,
        };
      case "stockSummary":
        return {
          title: "advanced-stock-summary",
          columns: stockColumns.map((column) => ({ label: column.label, key: String(column.key) })),
          rows: processedStock.allRows as Array<Record<string, unknown>>,
        };
      case "cashbook":
        return {
          title: "advanced-cashbook-report",
          columns: cashbookColumns.map((column) => ({ label: column.label, key: String(column.key) })),
          rows: processedCashbook.allRows as Array<Record<string, unknown>>,
        };
      default:
        return {
          title: "advanced-report-overview",
          columns: [
            { label: "Card", key: "label" },
            { label: "Value", key: "value" },
            { label: "Secondary", key: "secondary" },
          ],
          rows: overviewQuery.data
            ? Object.values(overviewQuery.data.cards).map((card) => ({
                label: card.label,
                value: card.value,
                secondary: card.secondary,
              }))
            : [],
        };
    }
  }, [
    activeTab,
    cashbookColumns,
    overviewQuery.data,
    outstandingColumns,
    processedCashbook.allRows,
    processedOutstanding.allRows,
    processedPurchases.allRows,
    processedSales.allRows,
    processedStock.allRows,
    purchaseColumns,
    salesColumns,
    stockColumns,
  ]);

  const exportCsv = () => {
    downloadFile(`${activeExport.title}.csv`, toCsv(activeExport.columns, activeExport.rows), "text/csv;charset=utf-8");
  };

  const exportPdf = () => {
    const popup = window.open("", "_blank", "width=1200,height=800");
    if (!popup) {
      toast({ title: "Popup blocked", description: "Allow popups to export PDF.", variant: "destructive" });
      return;
    }

    popup.document.write(`
      <html>
        <head>
          <title>${activeExport.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>${activeExport.title}</h1>
          <table>
            <thead>
              <tr>${activeExport.columns.map((column) => `<th>${column.label}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${activeExport.rows
                .map((row) => {
                  const rowRecord = row as Record<string, unknown>;
                  return `<tr>${activeExport.columns.map((column) => `<td>${String(rowRecord[column.key] ?? "")}</td>`).join("")}</tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const shareReport = async () => {
    const summary = `${activeExport.title.replace(/-/g, " ")} for ${formatDate(range.start, "dd MMM yyyy")} to ${formatDate(range.end, "dd MMM yyyy")} is ready.`;
    try {
      await navigator.clipboard.writeText(summary);
      toast({ title: "Share text copied", description: "WhatsApp-ready summary copied to clipboard." });
    } catch {
      toast({ title: "Share text", description: summary });
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pb-24 md:p-8 md:pb-8">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-3 text-3xl font-bold font-display">
          <FileBarChart className="h-8 w-8 text-primary" />
          Advanced Reports
        </h1>
        <p className="text-muted-foreground">
          Parallel analytics dashboard for deep sales, purchase, cashbook, stock, and outstanding insights.
        </p>
      </div>

      <FiltersBar
        preset={preset}
        onPresetChange={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        granularity={granularity}
        onGranularityChange={setGranularity}
        search={search}
        onSearchChange={setSearch}
        sortDirection={sortDirection}
        onSortDirectionChange={setSortDirection}
        onExportCsv={exportCsv}
        onExportPdf={exportPdf}
        onShare={shareReport}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Range: {formatDate(range.start, "dd MMM yyyy")} - {formatDate(range.end, "dd MMM yyyy")}
        </p>
        {selectedBucket ? (
          <Button variant="outline" size="sm" onClick={() => setSelectedBucket(null)}>
            Clear chart filter: {selectedBucket}
          </Button>
        ) : null}
      </div>

      {primaryError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4">
            <p className="font-medium text-destructive">Advanced Reports could not load.</p>
            <p className="mt-1 text-sm text-muted-foreground">{primaryError.message}</p>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdvancedTab)} className="space-y-6">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="landing">Dashboard</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="profitLoss">Profit & Loss</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="stockSummary">Stock Summary</TabsTrigger>
          <TabsTrigger value="cashbook">Cashbook</TabsTrigger>
        </TabsList>

        <TabsContent value="landing" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Sales Report"
              value={overviewQuery.data?.cards.sales.value ?? 0}
              subtitle={overviewQuery.data?.cards.sales.secondary}
              icon={CircleDollarSign}
              onClick={() => setActiveTab("sales")}
            />
            <MetricCard
              title="Purchase Report"
              value={overviewQuery.data?.cards.purchases.value ?? 0}
              subtitle={overviewQuery.data?.cards.purchases.secondary}
              icon={Boxes}
              onClick={() => setActiveTab("purchases")}
            />
            <MetricCard
              title="Profit & Loss"
              value={overviewQuery.data?.cards.profitLoss.value ?? 0}
              subtitle={overviewQuery.data?.cards.profitLoss.secondary}
              icon={TrendingUp}
              tone="positive"
              onClick={() => setActiveTab("profitLoss")}
            />
            <MetricCard
              title="Outstanding Balances"
              value={overviewQuery.data?.cards.outstanding.value ?? 0}
              subtitle={overviewQuery.data?.cards.outstanding.secondary}
              icon={Users}
              tone="warning"
              onClick={() => setActiveTab("outstanding")}
            />
            <MetricCard
              title="Stock Summary"
              value={overviewQuery.data?.cards.stockSummary.value ?? 0}
              subtitle={overviewQuery.data?.cards.stockSummary.secondary}
              icon={PackageSearch}
              onClick={() => setActiveTab("stockSummary")}
            />
            <MetricCard
              title="Cashbook Report"
              value={overviewQuery.data?.cards.cashbook.value ?? 0}
              subtitle={overviewQuery.data?.cards.cashbook.secondary}
              icon={HandCoins}
              onClick={() => setActiveTab("cashbook")}
            />
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Total Sales" value={salesQuery.data?.metrics.totalSales ?? 0} icon={CircleDollarSign} />
            <MetricCard title="Bill Count" value={salesQuery.data?.metrics.billCount ?? 0} subtitle="Invoices in range" icon={BarChart3} />
            <MetricCard title="Avg Bill Value" value={salesQuery.data?.metrics.avgBillValue ?? 0} icon={TrendingUp} />
            <MetricCard title="GST Collected" value={salesQuery.data?.metrics.gstCollected ?? 0} icon={CreditCard} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    sales: { label: "Sales", color: "#2563eb" },
                    bills: { label: "Bills", color: "#059669" },
                  }}
                >
                  <BarChart
                    data={salesQuery.data?.trend ?? []}
                    onClick={(state: any) => state?.activeLabel && setSelectedBucket(String(state.activeLabel))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="sales" fill="var(--color-sales)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="bills" fill="var(--color-bills)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {salesQuery.data ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                      <span>Paid</span>
                      <span>{salesQuery.data.breakdown.paid.count} / {formatCurrencyINR(salesQuery.data.breakdown.paid.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                      <span>Partial</span>
                      <span>{salesQuery.data.breakdown.partial.count} / {formatCurrencyINR(salesQuery.data.breakdown.partial.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                      <span>Unpaid</span>
                      <span>{salesQuery.data.breakdown.unpaid.count} / {formatCurrencyINR(salesQuery.data.breakdown.unpaid.amount)}</span>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Customers</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(salesQuery.data?.topCustomers ?? []).slice(0, 6).map((customer) => (
                <div key={`${customer.customerId}-${customer.customerName}`} className="rounded-xl border p-4">
                  <p className="font-medium">{customer.customerName}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Revenue</p>
                  <p className="text-lg font-semibold">{formatCurrencyINR(customer.revenue)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <ReportTable
            title="Sales Table"
            columns={salesColumns}
            rows={processedSales.rows}
            emptyMessage="No invoices match the current filters."
            page={processedSales.currentPage}
            totalPages={processedSales.totalPages}
            totalRows={processedSales.totalRows}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="purchases" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Total Purchases" value={purchasesQuery.data?.metrics.totalPurchases ?? 0} icon={Boxes} />
            <MetricCard title="Entries" value={purchasesQuery.data?.metrics.billCount ?? 0} subtitle="Purchase adjustments" icon={BarChart3} />
            <MetricCard title="Avg Purchase" value={purchasesQuery.data?.metrics.avgBillValue ?? 0} icon={TrendingUp} />
            <MetricCard title="Net GST Payable" value={purchasesQuery.data?.gstSummary.netPayable ?? 0} icon={CreditCard} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Purchase Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    purchases: { label: "Purchases", color: "#f59e0b" },
                    entries: { label: "Entries", color: "#0f766e" },
                  }}
                >
                  <BarChart
                    data={purchasesQuery.data?.trend ?? []}
                    onClick={(state: any) => state?.activeLabel && setSelectedBucket(String(state.activeLabel))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="purchases" fill="var(--color-purchases)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="entries" fill="var(--color-entries)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>GST Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                  <span>GST Input</span>
                  <span>{formatCurrencyINR(purchasesQuery.data?.gstSummary.input ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                  <span>GST Output</span>
                  <span>{formatCurrencyINR(purchasesQuery.data?.gstSummary.output ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
                  <span>Net Payable</span>
                  <span>{formatCurrencyINR(purchasesQuery.data?.gstSummary.netPayable ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <ReportTable
            title="Purchase Table"
            columns={purchaseColumns}
            rows={processedPurchases.rows}
            emptyMessage="No purchase entries match the current filters."
            page={processedPurchases.currentPage}
            totalPages={processedPurchases.totalPages}
            totalRows={processedPurchases.totalRows}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="profitLoss" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard title="Net Revenue" value={profitLossQuery.data?.metrics.netRevenue ?? 0} />
            <MetricCard title="COGS" value={profitLossQuery.data?.metrics.cogs ?? 0} />
            <MetricCard title="Gross Profit" value={profitLossQuery.data?.metrics.grossProfit ?? 0} tone="positive" />
            <MetricCard title="Expenses" value={profitLossQuery.data?.metrics.expenses ?? 0} tone="warning" />
            <MetricCard title="Net Profit" value={profitLossQuery.data?.metrics.netProfit ?? 0} tone="positive" />
            <MetricCard title="Net Margin %" value={profitLossQuery.data?.metrics.netMarginPct ?? 0} subtitle={`${(profitLossQuery.data?.metrics.grossMarginPct ?? 0).toFixed(1)}% gross`} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Revenue vs Cost vs Profit</CardTitle>
              <div className="flex gap-2">
                {(["revenue", "cost", "profit"] as const).map((key) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={seriesVisible[key] ? "default" : "outline"}
                    onClick={() => setSeriesVisible((current) => ({ ...current, [key]: !current[key] }))}
                  >
                    {key}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: "#2563eb" },
                  cost: { label: "Cost", color: "#f59e0b" },
                  profit: { label: "Profit", color: "#059669" },
                }}
              >
                <LineChart data={profitLossQuery.data?.trend ?? []}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {seriesVisible.revenue ? <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} /> : null}
                  {seriesVisible.cost ? <Line type="monotone" dataKey="cost" stroke="var(--color-cost)" strokeWidth={2} /> : null}
                  {seriesVisible.profit ? <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={2} /> : null}
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expense Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <ChartContainer config={{ amount: { label: "Amount", color: "#dc2626" } }}>
                <PieChart>
                  <Pie data={profitLossQuery.data?.expenseBreakdown ?? []} dataKey="amount" nameKey="category" outerRadius={110}>
                    {(profitLossQuery.data?.expenseBreakdown ?? []).map((_, index) => (
                      <Cell key={`expense-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent nameKey="category" />} />
                </PieChart>
              </ChartContainer>
              <div className="space-y-3">
                {(profitLossQuery.data?.expenseBreakdown ?? []).map((item) => (
                  <div key={item.category} className="flex items-center justify-between rounded-xl border p-3">
                    <span>{item.category}</span>
                    <span className="font-medium">{formatCurrencyINR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outstanding" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="Total Outstanding" value={outstandingQuery.data?.metrics.totalOutstanding ?? 0} tone="warning" />
            <MetricCard title="Customers" value={outstandingQuery.data?.metrics.customerCount ?? 0} />
            <MetricCard title="0-7 Days" value={outstandingQuery.data?.aging.bucket0To7 ?? 0} />
            <MetricCard title="8-30 Days" value={outstandingQuery.data?.aging.bucket8To30 ?? 0} />
            <MetricCard title="31-60 Days" value={outstandingQuery.data?.aging.bucket31To60 ?? 0} />
            <MetricCard title="60+ Days" value={outstandingQuery.data?.aging.bucket60Plus ?? 0} tone="warning" />
          </div>

          <ReportTable
            title="Outstanding Customers"
            columns={outstandingColumns}
            rows={processedOutstanding.rows}
            emptyMessage="No outstanding customers match the current filters."
            page={processedOutstanding.currentPage}
            totalPages={processedOutstanding.totalPages}
            totalRows={processedOutstanding.totalRows}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="stockSummary" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard title="Total Items" value={stockQuery.data?.metrics.totalItems ?? 0} icon={PackageSearch} />
            <MetricCard title="Stock Value" value={stockQuery.data?.metrics.stockValue ?? 0} icon={CircleDollarSign} />
            <MetricCard title="Potential Profit" value={stockQuery.data?.metrics.potentialProfit ?? 0} tone="positive" icon={TrendingUp} />
          </div>

          <ReportTable
            title="Stock Summary"
            columns={stockColumns}
            rows={processedStock.rows}
            emptyMessage="No stock rows match the current filters."
            page={processedStock.currentPage}
            totalPages={processedStock.totalPages}
            totalRows={processedStock.totalRows}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="cashbook" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Opening Balance" value={cashbookQuery.data?.metrics.openingBalance ?? 0} />
            <MetricCard title="Total Cash In" value={cashbookQuery.data?.metrics.totalCashIn ?? 0} tone="positive" />
            <MetricCard title="Total Cash Out" value={cashbookQuery.data?.metrics.totalCashOut ?? 0} tone="warning" />
            <MetricCard title="Balance" value={cashbookQuery.data?.metrics.balance ?? 0} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Cash Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    cashIn: { label: "Cash In", color: "#059669" },
                    cashOut: { label: "Cash Out", color: "#dc2626" },
                    balance: { label: "Balance", color: "#2563eb" },
                  }}
                >
                  <LineChart
                    data={cashbookQuery.data?.trend ?? []}
                    onClick={(state: any) => state?.activeLabel && setSelectedBucket(String(state.activeLabel))}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line type="monotone" dataKey="cashIn" stroke="var(--color-cashIn)" strokeWidth={2} />
                    <Line type="monotone" dataKey="cashOut" stroke="var(--color-cashOut)" strokeWidth={2} />
                    <Line type="monotone" dataKey="balance" stroke="var(--color-balance)" strokeWidth={2} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(cashbookQuery.data?.breakdown ?? []).map((item) => (
                  <div key={item.category} className="rounded-xl border p-3">
                    <p className="font-medium">{item.category}</p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">In</span>
                      <span>{formatCurrencyINR(item.cashIn)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Out</span>
                      <span>{formatCurrencyINR(item.cashOut)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <ReportTable
            title="Cashbook Table"
            columns={cashbookColumns}
            rows={processedCashbook.rows}
            emptyMessage="No cashbook rows match the current filters."
            page={processedCashbook.currentPage}
            totalPages={processedCashbook.totalPages}
            totalRows={processedCashbook.totalRows}
            onPageChange={setPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
