import { useCustomer } from "@/hooks/use-pos";
import { useRoute } from "wouter";
import { MetricCard } from "@/components/MetricCard";
import { IndianRupee, History, Receipt, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function CustomerDetails() {
  const [, params] = useRoute("/customers/:id");
  const id = Number(params?.id);
  const { data: customer, isLoading } = useCustomer(id);

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!customer) return <div>Customer not found</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex flex-col gap-4">
        <Link href="/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Customers
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-display font-bold">{customer.name}</h1>
            <p className="text-lg text-muted-foreground font-mono mt-1">{customer.phone}</p>
          </div>
          {/* Action buttons could go here (e.g., Settle Dues) */}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Total Purchased"
          value={`₹${customer.totalPurchased}`}
          icon={<Receipt className="w-6 h-6" />}
          className="border-t-4 border-t-primary"
        />
        <MetricCard
          title="Total Paid"
          value={`₹${customer.totalPaid}`}
          icon={<IndianRupee className="w-6 h-6" />}
          className="border-t-4 border-t-green-500"
        />
        <MetricCard
          title="Current Balance"
          value={`₹${customer.balance}`}
          icon={<History className="w-6 h-6" />}
          subValue={Number(customer.balance) > 0 ? "Due Amount" : "Credit"}
          className={cn(
            "border-t-4",
            Number(customer.balance) > 0 ? "border-t-red-500 bg-red-50/50 dark:bg-red-950/10" : "border-t-green-500"
          )}
        />
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-xl font-display">Transaction History</h3>
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Reference</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customer.history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {format(new Date(item.date), "dd MMM yyyy, hh:mm a")}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                        item.type === 'bill' 
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      )}>
                        {item.type === 'bill' ? 'Purchase' : 'Payment'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      #{item.id}
                    </td>
                    <td className={cn(
                      "px-6 py-4 text-right font-mono font-medium",
                      item.type === 'bill' ? "text-foreground" : "text-green-600"
                    )}>
                      {item.type === 'payment' ? '-' : ''}₹{item.amount}
                    </td>
                  </tr>
                ))}
                {customer.history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                      No transaction history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
