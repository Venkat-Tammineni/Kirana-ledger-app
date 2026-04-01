import { useProducts, useDashboardStats } from "@/hooks/use-pos";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Warehouse, TrendingUp, TrendingDown, AlertTriangle, Package, IndianRupee } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR } from "@/lib/format";
import { getBaseUnit } from "@shared/units";

export default function Inventory() {
  const { data: products } = useProducts();
  const { data: dashboardStats } = useDashboardStats();
  
  const { data: lowStockProducts, isLoading: lowStockLoading } = useQuery({
    queryKey: [api.inventory.lowStock.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.lowStock.path);
      if (!res.ok) throw new Error("Failed to fetch low stock products");
      return api.inventory.lowStock.responses[200].parse(await res.json());
    },
  });

  const { data: topSelling, isLoading: topSellingLoading } = useQuery({
    queryKey: [api.inventory.topSelling.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.topSelling.path);
      if (!res.ok) throw new Error("Failed to fetch top selling products");
      return api.inventory.topSelling.responses[200].parse(await res.json());
    },
  });

  const { data: leastSelling, isLoading: leastSellingLoading } = useQuery({
    queryKey: [api.inventory.leastSelling.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.leastSelling.path);
      if (!res.ok) throw new Error("Failed to fetch least selling products");
      return api.inventory.leastSelling.responses[200].parse(await res.json());
    },
  });

  const totalProducts = products?.length || 0;
  const totalStockValue = products?.reduce((sum, p) => {
    const stockValue = (Number(p.stock || 0)) * Number(p.costPrice || 0);
    return sum + stockValue;
  }, 0) || 0;

  const lowStockCount = lowStockProducts?.length || 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Warehouse className="w-8 h-8 text-primary" />
          Inventory Management
        </h1>
        <p className="text-muted-foreground mt-1">Track stock levels, sales performance, and inventory insights.</p>
      </div>

      {/* Inventory Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Products</span>
            <Package className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-display">{totalProducts}</div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Total Stock Value</span>
            <IndianRupee className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold font-display">{formatCurrencyINR(totalStockValue)}</div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Low Stock Items</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-3xl font-bold font-display text-red-500">{lowStockCount}</div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Today's Sales</span>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold font-display text-green-500">{formatCurrencyINR(dashboardStats?.todaySales || 0)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Products */}
        <div className="lg:col-span-1 bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Low Stock Alert
          </h2>
          {lowStockLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : lowStockProducts && lowStockProducts.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="p-3 bg-muted/50 rounded-lg border border-red-200">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Stock:{" "}
                    <span className="font-bold text-red-500">
                      {product.stock || 0} {getBaseUnit(product)}
                    </span>{" "}
                    / Threshold: {product.lowStockThreshold || 10} {getBaseUnit(product)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              All products are well stocked.
            </div>
          )}
        </div>

        {/* Top Selling Products */}
        <div className="lg:col-span-1 bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Top Selling Products
          </h2>
          {topSellingLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : topSelling && topSelling.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {topSelling.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="p-3 bg-muted/50 rounded-lg border border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Sold: <span className="font-bold">{item.totalQuantity}</span> units
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-600">{formatCurrencyINR(item.totalRevenue)}</div>
                      <div className="text-xs text-muted-foreground">Revenue</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sales data available yet.
            </div>
          )}
        </div>

        {/* Least Selling Products */}
        <div className="lg:col-span-1 bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-orange-500" />
            Least Selling Products
          </h2>
          {leastSellingLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : leastSelling && leastSelling.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {leastSelling.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="p-3 bg-muted/50 rounded-lg border border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Sold: <span className="font-bold">{item.totalQuantity}</span> units
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-600">{formatCurrencyINR(item.totalRevenue)}</div>
                      <div className="text-xs text-muted-foreground">Revenue</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sales data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

