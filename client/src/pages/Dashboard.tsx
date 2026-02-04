import { useDashboardStats } from "@/hooks/use-pos";
import { MetricCard } from "@/components/MetricCard";
import { IndianRupee, Users, ShoppingBag, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

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
          <p className="text-muted-foreground mt-1">Overview of your shop's performance.</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium hover:bg-muted transition-colors">
          Download Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Today's Sales"
          value={`₹${stats?.todaySales.toLocaleString() || '0'}`}
          icon={<IndianRupee className="w-6 h-6" />}
          trend="+12%"
          trendUp={true}
          className="border-l-4 border-l-primary"
        />
        
        <MetricCard
          title="Total Pending Dues"
          value={`₹${stats?.totalDue.toLocaleString() || '0'}`}
          icon={<Users className="w-6 h-6" />}
          subValue="Amount to collect from customers"
          className="border-l-4 border-l-destructive"
        />
        
        <MetricCard
          title="Active Customers"
          value={stats?.activeCustomers || '0'}
          icon={<ShoppingBag className="w-6 h-6" />}
          trend="+5%"
          trendUp={true}
          className="border-l-4 border-l-accent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-display font-bold text-lg">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <a href="/pos" className="p-4 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-colors flex flex-col items-center justify-center gap-2 group">
              <div className="p-3 bg-primary rounded-full text-primary-foreground group-hover:scale-110 transition-transform">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <span className="font-medium text-primary">New Bill</span>
            </a>
            <a href="/products" className="p-4 rounded-xl bg-accent/5 hover:bg-accent/10 border border-accent/10 transition-colors flex flex-col items-center justify-center gap-2 group">
              <div className="p-3 bg-accent rounded-full text-accent-foreground group-hover:scale-110 transition-transform">
                <Package className="w-6 h-6" /> 
                {/* Fixed: Package is imported now? No, need to import it */}
                <span className="sr-only">Inventory</span>
              </div>
              <span className="font-medium text-accent">Add Product</span>
            </a>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="font-display font-bold text-xl mb-2">Pro Tip</h3>
            <p className="text-gray-300 mb-6 max-w-md">
              Keep your customer phone numbers updated to send WhatsApp receipts automatically in the future.
            </p>
            <a href="/customers" className="inline-flex items-center gap-2 text-white font-medium hover:underline">
              Manage Customers <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        </div>
      </div>
    </div>
  );
}

// Helper needed for the missing icon import
import { Package } from "lucide-react";
