import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Minus, Plus, ReceiptText } from "lucide-react";
import { useAccountDetails, useAddToAccount, useSpendFromAccount } from "@/hooks/use-pos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR, formatDate, formatDateTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

type TransactionTypeFilter = "all" | "credit" | "spent";

export default function AccountDetails() {
  const [, params] = useRoute("/accounts/:id");
  const id = Number(params?.id);
  const { data: details, isLoading } = useAccountDetails(id);
  const { mutate: spendFromAccount, isPending: spending } = useSpendFromAccount();
  const { mutate: addToAccount, isPending: crediting } = useAddToAccount();
  const { toast } = useToast();

  const [entryMode, setEntryMode] = useState<"credit" | "spent" | null>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>("all");

  const filteredTransactions = useMemo(() => {
    if (!details) return [];

    return details.transactions.filter((txn) => {
      const txnDate = txn.date ? new Date(txn.date) : null;
      if (!txnDate) return false;

      if (typeFilter !== "all" && txn.type !== typeFilter) {
        return false;
      }

      if (fromDate) {
        const start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        if (txnDate < start) return false;
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        if (txnDate > end) return false;
      }

      return true;
    });
  }, [details, fromDate, toDate, typeFilter]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, typeof filteredTransactions>();

    filteredTransactions.forEach((txn) => {
      const key = txn.date ? formatDate(txn.date, "yyyy-MM-dd") : "unknown";
      const existing = groups.get(key) || [];
      existing.push(txn);
      groups.set(key, existing);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredTransactions]);

  const closeEntryDialog = () => {
    setEntryMode(null);
    setEntryAmount("");
    setEntryNote("");
  };

  const handleSubmit = () => {
    if (!details) return;

    const amount = Number(entryAmount);
    if (!amount || amount <= 0) return;

    const onSuccess = () => {
      toast({ title: entryMode === "credit" ? "Amount added" : "Amount spent" });
      closeEntryDialog();
    };

    const onError = (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    };

    if (entryMode === "credit") {
      addToAccount(
        { id: details.account.id, amount, note: entryNote || "Manual amount added" },
        { onSuccess, onError },
      );
      return;
    }

    spendFromAccount(
      { id: details.account.id, amount, note: entryNote || "Manual amount spent" },
      { onSuccess, onError },
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
        Account not found
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
            <h1 className="text-3xl font-display font-bold text-foreground">{details.account.name}</h1>
            <p className="text-muted-foreground mt-1">Check full transaction history date-wise.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEntryMode("credit")}>
            <Plus className="w-4 h-4 mr-2" /> Add Amount
          </Button>
          <Button variant="outline" onClick={() => setEntryMode("spent")}>
            <Minus className="w-4 h-4 mr-2" /> Subtract Amount
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Account Balance</div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {formatCurrencyINR(Number(details.currentBalance || 0))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Amount Spent</div>
          <div className="mt-2 text-2xl font-bold font-mono text-red-600">
            {formatCurrencyINR(Number(details.totalSpent || 0))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Transactions</div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {details.transactions.length}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Transaction History</h2>
            <p className="text-sm text-muted-foreground">Filter and review all account entries by date.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredTransactions.length} of {details.transactions.length}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[160px_160px_160px_auto] gap-3">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionTypeFilter)}
          >
            <option value="all">All Transactions</option>
            <option value="credit">Added Amount</option>
            <option value="spent">Spent Amount</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              setFromDate("");
              setToDate("");
              setTypeFilter("all");
            }}
          >
            Clear Filters
          </Button>
        </div>

        <div className="space-y-5">
          {groupedTransactions.map(([dateKey, txns]) => (
            <div key={dateKey} className="space-y-3">
              <div className="sticky top-0 z-10 bg-card/95 backdrop-blur py-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <ReceiptText className="w-3.5 h-3.5" />
                  {formatDate(dateKey, "dd MMM yyyy")}
                </div>
              </div>
              <div className="space-y-3">
                {txns.map((txn) => (
                  <div key={txn.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className={`text-sm font-semibold ${txn.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                          {txn.type === "credit" ? "Added Amount" : "Spent Amount"}
                        </div>
                        <div className="mt-1 text-lg font-bold font-mono">
                          {txn.type === "credit" ? "+" : "-"}
                          {formatCurrencyINR(Number(txn.amount || 0))}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {txn.date ? formatDateTime(txn.date, "dd MMM, hh:mm a") : "-"}
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      {txn.note || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groupedTransactions.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No transactions found for the selected filters.
            </div>
          )}
        </div>
      </div>

      <Dialog open={entryMode !== null} onOpenChange={(open) => !open && closeEntryDialog()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{entryMode === "credit" ? `Add to ${details.account.name}` : `Subtract from ${details.account.name}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Note</label>
                <Input
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder={entryMode === "credit" ? "Reason for adding amount" : "Reason for subtraction"}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={(entryMode === "credit" ? crediting : spending) || !entryAmount}
              >
                {(entryMode === "credit" ? crediting : spending) ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
