import { useBill } from "@/hooks/use-pos";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BillDetails() {
  const [, params] = useRoute("/bills/:id");
  const id = Number(params?.id);
  const { data: bill, isLoading } = useBill(id);

  if (isLoading) return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  if (!bill) return <div>Bill not found</div>;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6 pb-24 md:pb-8">
      <div className="flex justify-between items-center print:hidden">
        <Link href="/bills" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Bills
        </Link>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Print Bill
        </Button>
      </div>

      <div className="bg-card border border-border shadow-sm rounded-xl p-8 print:shadow-none print:border-none">
        <div className="text-center border-b border-border/50 pb-6 mb-6">
          <h1 className="text-2xl font-display font-bold uppercase tracking-wider">Kirana Store</h1>
          <p className="text-muted-foreground text-sm mt-1">123 Market Street, City Name</p>
          <p className="text-muted-foreground text-sm">Phone: 987-654-3210</p>
        </div>

        <div className="flex justify-between text-sm mb-8">
          <div className="space-y-1">
            <p className="text-muted-foreground">Billed To:</p>
            <p className="font-bold text-foreground">{bill.customer?.name || "Walk-in Customer"}</p>
            {bill.customer?.phone && <p>{bill.customer.phone}</p>}
          </div>
          <div className="text-right space-y-1">
            <p><span className="text-muted-foreground">Bill No:</span> <span className="font-mono font-bold">#{bill.id}</span></p>
            <p><span className="text-muted-foreground">Date:</span> {bill.date ? format(new Date(bill.date), "dd/MM/yyyy") : "-"}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b-2 border-border text-left">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {bill.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-3 font-medium">{item.name}</td>
                <td className="py-3 text-right">{item.quantity}</td>
                <td className="py-3 text-right">₹{item.price}</td>
                <td className="py-3 text-right font-mono">₹{item.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end border-t-2 border-border pt-4">
          <div className="w-1/2 space-y-2">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Total Amount</span>
              <span>₹{bill.totalAmount}</span>
            </div>
            <div className="text-xs text-right text-muted-foreground mt-4">
              Thank you for shopping with us!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
