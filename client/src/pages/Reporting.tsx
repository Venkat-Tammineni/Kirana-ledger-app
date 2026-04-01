import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Users, Calendar, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR } from "@/lib/format";

type DateRange = 'daily' | 'weekly' | 'monthly' | 'custom';

export default function Reporting() {
  const [dateRange, setDateRange] = useState<DateRange>('daily');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(startOfDay(new Date()));
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(endOfDay(new Date()));

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'daily':
        return {
          start: startOfDay(now),
          end: endOfDay(now),
        };
      case 'weekly':
        return {
          start: startOfDay(startOfWeek(now, { weekStartsOn: 1 })),
          end: endOfDay(endOfWeek(now, { weekStartsOn: 1 })),
        };
      case 'monthly':
        return {
          start: startOfDay(startOfMonth(now)),
          end: endOfDay(endOfMonth(now)),
        };
      case 'custom':
        return {
          start: customStartDate || startOfDay(now),
          end: customEndDate || endOfDay(now),
        };
      default:
        return {
          start: startOfDay(now),
          end: endOfDay(now),
        };
    }
  };

  const { start, end } = getDateRange();

  const { data: profitReport, isLoading: profitLoading } = useQuery({
    queryKey: [api.reporting.profit.path, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const url = buildUrl(api.reporting.profit.path) + `?startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch profit report");
      return api.reporting.profit.responses[200].parse(await res.json());
    },
  });

  const { data: customerProfit, isLoading: customerProfitLoading } = useQuery({
    queryKey: [api.reporting.customerProfit.path, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const url = buildUrl(api.reporting.customerProfit.path) + `?startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch customer profit report");
      return api.reporting.customerProfit.responses[200].parse(await res.json());
    },
  });

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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[200px] justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {customStartDate ? format(customStartDate, "PPP") : <span>Start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={customStartDate}
                    onSelect={(date) => setCustomStartDate(date ? startOfDay(date) : undefined)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[200px] justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {customEndDate ? format(customEndDate, "PPP") : <span>End date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={customEndDate}
                    onSelect={(date) => setCustomEndDate(date ? endOfDay(date) : undefined)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="ml-auto text-sm text-muted-foreground">
            {format(start, "MMM dd, yyyy")} - {format(end, "MMM dd, yyyy")}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Sales</span>
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="text-3xl font-bold font-display text-blue-600">
              {formatCurrencyINR(profitReport?.totalSales || 0)}
            </div>
          )}
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Profit</span>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="text-3xl font-bold font-display text-green-600">
              {formatCurrencyINR(profitReport?.totalProfit || 0)}
            </div>
          )}
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Investment</span>
            <TrendingDown className="w-5 h-5 text-orange-500" />
          </div>
          {profitLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="text-3xl font-bold font-display text-orange-600">
              {formatCurrencyINR(profitReport?.totalInvestment || 0)}
            </div>
          )}
        </div>
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

      {/* Customer-wise Profit */}
      <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
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
              <div key={`${customer.customerId}-${index}`} className="p-4 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-lg">{customer.customerName}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Total Sales: <span className="font-semibold text-foreground">{formatCurrencyINR(customer.totalSales)}</span>
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
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No sales data available for the selected date range.
          </div>
        )}
      </div>
    </div>
  );
}

