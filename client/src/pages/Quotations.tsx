import { useQuotations } from "@/hooks/use-pos";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ChevronRight, FileText, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDateTime } from "@/lib/format";

export default function Quotations() {
  const { data: quotations, isLoading } = useQuotations();

  const getStatusClass = (status: string) => {
    switch (status) {
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "accepted":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "converted":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-amber-100 text-amber-800";
    }
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-display font-bold text-foreground">Quotation History</h1>
        <Link href="/quotations/new"><Button><Plus className="w-4 h-4 mr-2" /> New Quotation</Button></Link>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Quotation ID</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Customer</th>
                <th className="px-6 py-4 font-semibold text-right">Total</th>
                <th className="px-6 py-4 font-semibold text-right">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotations?.map((quotation) => (
                <tr key={quotation.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-4 font-mono font-medium">#Q{quotation.id}</td>
                  <td className="px-6 py-4 text-muted-foreground">{quotation.date ? formatDateTime(quotation.date, "dd MMM, hh:mm a") : "-"}</td>
                  <td className="px-6 py-4 font-medium">{quotation.customerName || "Walk-in Customer"}</td>
                  <td className="px-6 py-4 text-right font-mono font-bold">{formatCurrencyINR(Number(quotation.totalAmount || 0))}</td>
                  <td className="px-6 py-4 text-right"><span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize", getStatusClass(quotation.status))}>{quotation.status}</span></td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {quotation.status !== "converted" && <Link href={`/quotations/${quotation.id}/edit`}><button type="button" className="text-muted-foreground hover:text-primary transition-colors" title="Edit quotation"><Pencil className="w-4 h-4" /></button></Link>}
                      <Link href={`/quotations/${quotation.id}`}><button type="button" className="text-muted-foreground hover:text-primary transition-colors" title="View quotation"><ChevronRight className="w-5 h-5" /></button></Link>
                    </div>
                  </td>
                </tr>
              ))}
              {quotations?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground"><div className="flex flex-col items-center gap-2"><FileText className="w-10 h-10 opacity-20" /><p>No quotations created yet.</p></div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
