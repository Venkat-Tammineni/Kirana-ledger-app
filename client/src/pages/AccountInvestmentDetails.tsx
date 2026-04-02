import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Landmark, Plus, ReceiptText } from "lucide-react";
import { useAddInvestment, useInvestmentDetails } from "@/hooks/use-pos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR, formatDate, formatDateTime, toISTDateInputValue } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { getISTDateKey, getISTDayBounds, parseISTDateOnly, parseISTDateTime } from "@shared/timezone";

type InvestmentSourceFilter = "all" | "account_spent" | "manual";

export default function AccountInvestmentDetails() {
  const { data: details, isLoading } = useInvestmentDetails();
  const { mutate: addInvestment, isPending: addingInvestment } = useAddInvestment();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState<InvestmentSourceFilter>("all");

  const filteredEntries = useMemo(() => {
    if (!details) return [];

    return details.entries.filter((entry) => {
      const entryDate = entry.date ? parseISTDateTime(entry.date) : null;
      if (!entryDate) return false;

      if (sourceFilter !== "all" && entry.source !== sourceFilter) {
        return false;
      }

      if (fromDate) {
        const start = parseISTDateOnly(fromDate);
        if (entryDate < start) return false;
      }

      if (toDate) {
        const { end } = getISTDayBounds(toDate);
        if (entryDate > end) return false;
      }

      return true;
    });
  }, [details, fromDate, toDate, sourceFilter]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, typeof filteredEntries>();

    filteredEntries.forEach((entry) => {
      const key = entry.date ? getISTDateKey(entry.date) : "unknown";
      const existing = groups.get(key) || [];
      existing.push(entry);
      groups.set(key, existing);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredEntries]);

  const handleAddInvestment = () => {
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0 || !note.trim()) return;

    addInvestment(
      {
        amount: numericAmount,
        note: note.trim(),
        date: date ? toISTDateInputValue(date) : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Investment added" });
          setIsCreateOpen(false);
          setAmount("");
          setNote("");
          setDate("");
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Investment details not found
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto pb-24 md:pb-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Link
            href="/accounts"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Accounts
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Total Investment</h1>
            <p className="text-muted-foreground mt-1">Includes all account deductions plus manual custom investments.</p>
          </div>
        </div>

        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Custom Investment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Total Investment</div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {formatCurrencyINR(details.totalInvestment)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">From Account Deductions</div>
          <div className="mt-2 text-2xl font-bold font-mono text-red-600">
            {formatCurrencyINR(details.accountSpentTotal)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Manual Investments</div>
          <div className="mt-2 text-2xl font-bold font-mono text-primary">
            {formatCurrencyINR(details.manualInvestmentTotal)}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Investment History</h2>
            <p className="text-sm text-muted-foreground">Filter all investment entries date-wise.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredEntries.length} of {details.entries.length}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[160px_160px_200px_auto] gap-3">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as InvestmentSourceFilter)}
          >
            <option value="all">All Sources</option>
            <option value="account_spent">Account Deductions</option>
            <option value="manual">Manual Investments</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setSourceFilter("all");
            }}
          >
            Clear Filters
          </Button>
        </div>

        <div className="space-y-5">
          {groupedEntries.map(([dateKey, entries]) => (
            <div key={dateKey} className="space-y-3">
              <div className="sticky top-0 z-10 bg-card/95 backdrop-blur py-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <ReceiptText className="w-3.5 h-3.5" />
                  {formatDate(dateKey, "dd MMM yyyy")}
                </div>
              </div>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div key={`${entry.source}-${entry.id}`} className="rounded-xl border border-border p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className={`text-sm font-semibold ${entry.source === "manual" ? "text-primary" : "text-red-600"}`}>
                          {entry.source === "manual" ? "Manual Investment" : `Deducted from ${entry.sourceLabel}`}
                        </div>
                        <div className="mt-1 text-lg font-bold font-mono">
                          {formatCurrencyINR(entry.amount)}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {entry.date ? formatDateTime(entry.date, "dd MMM, hh:mm a") : "-"}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Landmark className="w-4 h-4" />
                      <span>{entry.sourceLabel}</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {entry.note || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groupedEntries.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No investment entries found for the selected filters.
            </div>
          )}
        </div>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddInvestment();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add Custom Investment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Note</label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for investment" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date (Optional)</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addingInvestment || !amount || !note.trim()}>
                {addingInvestment ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
