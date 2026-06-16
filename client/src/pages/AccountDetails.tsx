import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Minus, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useAccountDetails, useAddToAccount, useCustomers, useDeleteAccountTransaction, useSpendFromAccount, useUpdateAccountTransaction } from "@/hooks/use-pos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR, formatDate, formatDateTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { CustomerDeductionSelect } from "@/components/CustomerDeductionSelect";
import { getISTDateKey, getISTDayBounds, parseISTDateOnly, parseISTDateTime } from "@shared/timezone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TransactionTypeFilter = "all" | "credit" | "spent";

export default function AccountDetails() {
  const [, params] = useRoute("/accounts/:id");
  const id = Number(params?.id);
  const { data: details, isLoading } = useAccountDetails(id);
  const { data: customers } = useCustomers();
  const { mutate: spendFromAccount, isPending: spending } = useSpendFromAccount();
  const { mutate: addToAccount, isPending: crediting } = useAddToAccount();
  const { mutate: deleteAccountTransaction, isPending: deletingTransaction } = useDeleteAccountTransaction();
  const { mutate: updateAccountTransaction, isPending: updatingTransaction } = useUpdateAccountTransaction();
  const { toast } = useToast();

  const [entryMode, setEntryMode] = useState<"credit" | "spent" | null>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryCustomerId, setEntryCustomerId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>("all");
  const [transactionToDelete, setTransactionToDelete] = useState<{ id: number; type: string; amount: number } | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<{ id: number; type: string; amount: number; note: string; customerId?: number | null } | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null);

  const parseSpokenAmount = (value: string) => {
    const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };

  const transactionBalanceMap = useMemo(() => {
    if (!details) return new Map<number, number>();

    let runningBalance = Number(details.currentBalance || 0);
    const balanceByTransactionId = new Map<number, number>();

    details.transactions.forEach((txn) => {
      balanceByTransactionId.set(txn.id, runningBalance);

      const amount = Number(txn.amount || 0);
      runningBalance -= txn.type === "credit" ? amount : -amount;
    });

    return balanceByTransactionId;
  }, [details]);

  const filteredTransactions = useMemo(() => {
    if (!details) return [];

    return details.transactions.filter((txn) => {
      const txnDate = txn.date ? parseISTDateTime(txn.date) : null;
      if (!txnDate) return false;

      if (typeFilter !== "all" && txn.type !== typeFilter) {
        return false;
      }

      if (fromDate) {
        const start = parseISTDateOnly(fromDate);
        if (txnDate < start) return false;
      }

      if (toDate) {
        const { end } = getISTDayBounds(toDate);
        if (txnDate > end) return false;
      }

      return true;
    });
  }, [details, fromDate, toDate, typeFilter]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, typeof filteredTransactions>();

    filteredTransactions.forEach((txn) => {
      const key = txn.date ? getISTDateKey(txn.date) : "unknown";
      const existing = groups.get(key) || [];
      existing.push(txn);
      groups.set(key, existing);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredTransactions]);

  const accountDetailVoiceCommands = useMemo(
    () => [
      {
        label: "Open add amount",
        examples: ["add amount"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          if (normalized !== "add amount") return null;
          setEntryMode("credit");
          return "Opening Add Amount.";
        },
      },
      {
        label: "Set amount",
        examples: ["amount 5000"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^amount\s+(.+)$/);
          if (!match) return null;
          const amount = parseSpokenAmount(match[1]);
          if (amount == null) return "I could not understand that amount.";
          setEntryAmount(String(amount));
          return `Amount set to ${amount}.`;
        },
      },
      {
        label: "Set note",
        examples: ["note famous payment"],
        run: ({ raw, normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^note\s+(.+)$/);
          if (!match) return null;
          setEntryNote(raw.slice(raw.toLowerCase().indexOf("note") + 4).trim());
          return "Note updated.";
        },
      },
      {
        label: "Choose customer",
        examples: ["customer pulav"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^customer\s+(.+)$/);
          if (!match) return null;
          const matches = (customers || []).filter((customer) =>
            customer.name.toLowerCase().includes(match[1].trim()),
          );
          if (matches.length !== 1) return `I could not uniquely match ${match[1].trim()}. Please choose from the dropdown.`;
          setEntryCustomerId(matches[0].id);
          return `Selected customer ${matches[0].name}.`;
        },
      },
    ],
    [customers],
  );

  const closeEntryDialog = () => {
    setEntryMode(null);
    setEntryAmount("");
    setEntryNote("");
    setEntryCustomerId(null);
  };

  const matchingCustomers = useMemo(() => {
    const query = entryNote.trim().toLowerCase();
    if (!query) return customers || [];
    const matches = (customers || []).filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query),
    );
    return matches.length > 0 ? matches : customers || [];
  }, [customers, entryNote]);

  const matchingEditCustomers = useMemo(() => {
    const query = editNote.trim().toLowerCase();
    if (!query) return customers || [];
    const matches = (customers || []).filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query),
    );
    return matches.length > 0 ? matches : customers || [];
  }, [customers, editNote]);

  const customerNameById = useMemo(() => {
    return new Map((customers || []).map((customer) => [customer.id, customer.name]));
  }, [customers]);

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
        { id: details.account.id, amount, note: entryNote || "Manual amount added", customerId: entryCustomerId || undefined },
        { onSuccess, onError },
      );
      return;
    }

    spendFromAccount(
      { id: details.account.id, amount, note: entryNote || "Manual amount spent" },
      { onSuccess, onError },
    );
  };

  const openEditTransaction = (transaction: { id: number; type: string; amount: number | string; note: string | null; customerId?: number | null }) => {
    setTransactionToEdit({
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount || 0),
      note: transaction.note || "",
      customerId: transaction.customerId,
    });
    setEditAmount(String(Number(transaction.amount || 0)));
    setEditNote(transaction.note || "");
    setEditCustomerId(transaction.customerId || null);
  };

  const closeEditTransaction = () => {
    setTransactionToEdit(null);
    setEditAmount("");
    setEditNote("");
    setEditCustomerId(null);
  };

  const handleEditSubmit = () => {
    if (!details || !transactionToEdit) return;

    const amount = Number(editAmount);
    const note = editNote.trim();
    if (!amount || amount <= 0 || !note) return;

    updateAccountTransaction(
      {
        id: details.account.id,
        transactionId: transactionToEdit.id,
        amount,
        note,
        customerId: transactionToEdit.type === "credit" ? editCustomerId : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Transaction updated" });
          closeEditTransaction();
        },
        onError: (error: Error) => toast({ title: "Failed", description: error.message, variant: "destructive" }),
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
        Account not found
      </div>
    );
  }

  return (
    <>
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
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className={`text-sm font-semibold ${txn.type === "credit" ? "text-green-600" : "text-red-600"}`}>
                          {txn.type === "credit" ? "Added Amount" : "Spent Amount"}
                        </div>
                        <div className="mt-1 text-lg font-bold font-mono">
                          {txn.type === "credit" ? "+" : "-"}
                          {formatCurrencyINR(Number(txn.amount || 0))}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Balance after this entry:{" "}
                          <span className="font-semibold text-foreground">
                            {formatCurrencyINR(transactionBalanceMap.get(txn.id) ?? 0)}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div>{txn.date ? formatDateTime(txn.date, "dd MMM, hh:mm a") : "-"}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => openEditTransaction(txn)}
                          >
                            <Pencil className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive"
                            onClick={() =>
                              setTransactionToDelete({
                                id: txn.id,
                                type: txn.type,
                                amount: Number(txn.amount || 0),
                              })
                            }
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      {txn.note || "-"}
                      {txn.type === "credit" && txn.customerId && (
                        <span className="ml-2 text-xs">
                          Deducted from {customerNameById.get(txn.customerId) || "customer"}
                        </span>
                      )}
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
              {entryMode === "credit" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer to deduct from (Optional)</label>
                  <CustomerDeductionSelect
                    customers={matchingCustomers}
                    value={entryCustomerId}
                    onChange={setEntryCustomerId}
                  />
                  <p className="text-xs text-muted-foreground">
                    Select the customer if this amount is money received from them.
                  </p>
                </div>
              )}
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

      <Dialog open={transactionToEdit !== null} onOpenChange={(open) => !open && closeEditTransaction()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEditSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit {transactionToEdit?.type === "credit" ? "Added Amount" : "Spent Amount"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Note</label>
                <Input
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Payment note"
                />
              </div>
              {transactionToEdit?.type === "credit" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer to deduct from (Optional)</label>
                  <CustomerDeductionSelect
                    customers={matchingEditCustomers}
                    value={editCustomerId}
                    onChange={setEditCustomerId}
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose the customer whose balance should be reduced by this payment.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updatingTransaction || !editAmount || !editNote.trim()}>
                {updatingTransaction ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!transactionToDelete} onOpenChange={(open) => !open && setTransactionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected {transactionToDelete?.type === "credit" ? "added" : "spent"} amount from this account and update the total balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Keep It</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!transactionToDelete) return;
                deleteAccountTransaction(
                  { id: details.account.id, transactionId: transactionToDelete.id },
                  {
                    onSuccess: () => {
                      toast({
                        title: "Transaction deleted",
                        description: `${formatCurrencyINR(transactionToDelete.amount)} was removed from ${details.account.name}.`,
                      });
                      setTransactionToDelete(null);
                    },
                    onError: (error: Error) => {
                      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                    },
                  },
                );
              }}
              disabled={deletingTransaction}
            >
              {deletingTransaction ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

      <VoiceAssistant
        title="Account Voice Helper"
        subtitle="Use voice for add amount, note, amount, and customer selection."
        commands={accountDetailVoiceCommands}
      />
    </>
  );
}
