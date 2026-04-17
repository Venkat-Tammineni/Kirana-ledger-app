import { Link } from "wouter";
import { useDashboardStats, useCustomers } from "@/hooks/use-pos";
import { MetricCard } from "@/components/MetricCard";
import { IndianRupee, Users, ShoppingBag, ArrowUpRight, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR } from "@/lib/format";

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: customers } = useCustomers();
  const pendingCustomers = (customers || [])
    .filter((customer) => Number(customer.balance) > 0)
    .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your shop&apos;s performance.</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium hover:bg-muted transition-colors">
          Download Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <a href="/reporting?range=daily#sales-breakdown" className="block">
          <MetricCard
            title="Today's Sales"
            value={formatCurrencyINR(stats?.todaySales || 0)}
            icon={<IndianRupee className="w-6 h-6" />}
            trend="+12%"
            trendUp={true}
            subValue="Tap to see today's bill-wise sales"
            className="border-l-4 border-l-primary"
            clickable
          />
        </a>

        <a href="/reporting?range=daily#profit-breakdown" className="block">
          <MetricCard
            title="Today's Profit"
            value={formatCurrencyINR(stats?.todayProfit || 0)}
            icon={<TrendingUp className="w-6 h-6" />}
            subValue="Tap to see individual customer profits"
            className="border-l-4 border-l-green-500"
            clickable
          />
        </a>

        <MetricCard
          title="Total Pending Dues"
          value={formatCurrencyINR(stats?.totalDue || 0)}
          icon={<Users className="w-6 h-6" />}
          subValue="Amount to collect from customers"
          className="border-l-4 border-l-destructive"
        />

        <MetricCard
          title="Active Customers"
          value={stats?.activeCustomers || "0"}
          icon={<ShoppingBag className="w-6 h-6" />}
          trend="+5%"
          trendUp={true}
          className="border-l-4 border-l-accent"
        />
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-lg">Mirchi Powder Separate Totals</h3>
            <p className="text-sm text-muted-foreground">These values are excluded from the main sales and profit cards above.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricCard
            title="Today's Mirchi Powder Sales"
            value={formatCurrencyINR(stats?.mirchiPowderSales || 0)}
            icon={<IndianRupee className="w-6 h-6" />}
            subValue="Separated from today's total sales"
            className="border-l-4 border-l-orange-500"
          />
          <MetricCard
            title="Today's Mirchi Powder Profit"
            value={formatCurrencyINR(stats?.mirchiPowderProfit || 0)}
            icon={<TrendingUp className="w-6 h-6" />}
            subValue="Separated from today's total profit"
            className="border-l-4 border-l-amber-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-display font-bold text-lg">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <a
              href="/pos"
              className="p-4 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-colors flex flex-col items-center justify-center gap-2 group"
            >
              <div className="p-3 bg-primary rounded-full text-primary-foreground group-hover:scale-110 transition-transform">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <span className="font-medium text-primary">New Bill</span>
            </a>
            <a
              href="/products"
              className="p-4 rounded-xl bg-accent/5 hover:bg-accent/10 border border-accent/10 transition-colors flex flex-col items-center justify-center gap-2 group"
            >
              <div className="p-3 bg-accent rounded-full text-accent-foreground group-hover:scale-110 transition-transform">
                <Package className="w-6 h-6" />
                <span className="sr-only">Inventory</span>
              </div>
              <span className="font-medium text-accent">Add Product</span>
            </a>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="font-display font-bold text-xl mb-2">Pro Tip</h3>
            <p className="text-gray-300 mb-6 max-w-md">Customer count is not automatic. Keep customer records updated daily.</p>
            <a href="/customers" className="inline-flex items-center gap-2 text-white font-medium hover:underline">
              Manage Customers <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="font-display font-bold text-lg">Pending Customers</h3>
          </div>
          <Link href="/customers" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {pendingCustomers.length > 0 ? (
          <div className="space-y-3">
            {pendingCustomers.slice(0, 5).map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-sm text-muted-foreground">{customer.phone}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-red-600">
                    {formatCurrencyINR(Number(customer.balance || 0))}
                  </div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No customers currently have pending dues.</div>
        )}
      </div>
    </div>
  );
}
