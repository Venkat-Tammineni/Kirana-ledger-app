import { useBills } from "@/hooks/use-pos";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Bills() {
  const { data: bills, isLoading } = useBills();

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <h1 className="text-3xl font-display font-bold text-foreground mb-8">Bill History</h1>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Bill ID</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold text-right">Total Amount</th>
                <th className="px-6 py-4 font-semibold text-right">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bills?.map((bill) => (
                <tr key={bill.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-4 font-mono font-medium">#{bill.id}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {bill.date ? format(new Date(bill.date), "dd MMM, hh:mm a") : '-'}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {bill.customerName || "Walk-in Customer"}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold">
                    ₹{bill.totalAmount}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                      bill.status === 'completed' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    )}>
                      {bill.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/bills/${bill.id}`}>
                      <button className="text-muted-foreground hover:text-primary transition-colors">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
              {bills?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-10 h-10 opacity-20" />
                      <p>No bills generated yet.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
