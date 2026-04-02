import { useMemo, useState } from "react";
import { useCustomer, useRepayCustomer, useAddCustomerCredit, useUpdateCustomerProfit } from "@/hooks/use-pos";
import { useRoute, Link } from "wouter";
import { MetricCard } from "@/components/MetricCard";
import {
  ArrowLeft,
  CalendarIcon,
  Clock3,
  History,
  IndianRupee,
  MessageCircle,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDate, formatDateTime, toDateInputString, toISTDateTimeStringForApi } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

type EntryMode = "CREDIT" | "PAYMENT" | null;

export default function CustomerDetails() {
  const [, params] = useRoute("/customers/:id");
  const id = Number(params?.id);
  const [selectedProfitDate, setSelectedProfitDate] = useState<Date>(new Date());
  const selectedProfitDateKey = toDateInputString(selectedProfitDate);
  const { data: customer, isLoading } = useCustomer(id, selectedProfitDateKey);
  const { mutate: repayCustomer, isPending: isRepaying } = useRepayCustomer();
  const { mutate: addCustomerCredit, isPending: isAddingCredit } = useAddCustomerCredit();
  const { mutate: updateCustomerProfit, isPending: isUpdatingProfit } = useUpdateCustomerProfit();
  const { toast } = useToast();

  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryDate, setEntryDate] = useState<Date | undefined>(undefined);
  const [isProfitDialogOpen, setIsProfitDialogOpen] = useState(false);
  const [profitAmount, setProfitAmount] = useState("");

  const isSaving = isRepaying || isAddingCredit;

  const shareMessage = useMemo(() => {
    if (!customer) return "";
    const balance = Number(customer.balance || 0);
    const balanceLine =
      balance > 0
        ? `Your pending balance is ${formatCurrencyINR(balance)}. Please pay when possible.`
        : balance < 0
          ? `You currently have an advance balance of ${formatCurrencyINR(Math.abs(balance))}.`
          : "Your account is fully settled. Thank you.";

    return `Hi ${customer.name},\n${balanceLine}\n- Ganesh Kirana Store`;
  }, [customer]);

  const openEntryDialog = (mode: Exclude<EntryMode, null>) => {
    setEntryMode(mode);
    setEntryAmount("");
    setEntryNote("");
    setEntryDate(undefined);
  };

  const closeEntryDialog = () => {
    setEntryMode(null);
    setEntryAmount("");
    setEntryNote("");
    setEntryDate(undefined);
  };

  const handleSubmitEntry = () => {
    const amount = Number(entryAmount);
    if (!amount || amount <= 0) return;

    if (entryMode === "PAYMENT") {
      repayCustomer(
        {
          customerId: id,
          amount,
          note: entryNote || "Manual payment",
          date: entryDate ? toISTDateTimeStringForApi(entryDate) : undefined,
        },
        {
          onSuccess: () => {
            toast({ title: "Payment added" });
            closeEntryDialog();
          },
          onError: (error: Error) => {
            toast({ title: "Failed", description: error.message, variant: "destructive" });
          },
        },
      );
      return;
    }

    addCustomerCredit(
      {
        customerId: id,
        amount,
        note: entryNote || "Manual credit",
        date: entryDate ? toISTDateTimeStringForApi(entryDate) : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Credit added" });
          closeEntryDialog();
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleShare = async () => {
    if (!customer) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${customer.name} Ledger`,
          text: shareMessage,
        });
        return;
      }
    } catch {
      // Fall through to WhatsApp/share link.
    }

    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openProfitDialog = () => {
    if (!customer) return;
    setProfitAmount(String(Number(customer.totalProfit || 0)));
    setIsProfitDialogOpen(true);
  };

  const handleProfitSave = () => {
    const totalProfit = Number(profitAmount);
    if (!Number.isFinite(totalProfit)) return;

    updateCustomerProfit(
      { customerId: id, totalProfit },
      {
        onSuccess: () => {
          toast({ title: "Total profit updated" });
          setIsProfitDialogOpen(false);
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!customer) return <div>Customer not found</div>;

  const balance = Number(customer.balance || 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      <div className="flex flex-col gap-4">
        <Link href="/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Customers
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">{customer.name}</h1>
            <p className="text-lg text-muted-foreground font-mono mt-1">{customer.phone}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 font-medium",
                  balance > 0
                    ? "bg-red-100 text-red-700"
                    : balance < 0
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground",
                )}
              >
                Current Balance: {balance < 0 ? `Advance ${formatCurrencyINR(Math.abs(balance))}` : formatCurrencyINR(balance)}
              </span>
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-muted-foreground">
                Last Payment: {customer.lastPaymentDate ? formatDateTime(customer.lastPaymentDate, "dd MMM yyyy") : "No payment yet"}
              </span>
              <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-muted-foreground">
                Days Since Payment: {customer.daysSinceLastPayment ?? "-"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
            <Button
              className="h-12 text-base bg-red-600 hover:bg-red-700 text-white"
              onClick={() => openEntryDialog("CREDIT")}
            >
              Add Credit
            </Button>
            <Button
              className="h-12 text-base bg-green-600 hover:bg-green-700 text-white"
              onClick={() => openEntryDialog("PAYMENT")}
            >
              Add Payment
            </Button>
            <Button
              variant="outline"
              className="h-12 text-base"
              onClick={handleShare}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Share via WhatsApp
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
        <div className="md:col-span-2 xl:col-span-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <h3 className="font-semibold">Customer Profit Controls</h3>
            <p className="text-sm text-muted-foreground">Pick any date to see that day's profit, or manually adjust this customer's overall total profit.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal min-w-[220px]">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  Profit Date: {formatDate(selectedProfitDate, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedProfitDate}
                  onSelect={(date) => date && setSelectedProfitDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" onClick={openProfitDialog}>
              Edit Total Profit
            </Button>
          </div>
        </div>
        <MetricCard
          title="Total Purchased"
          value={formatCurrencyINR(Number(customer.totalPurchased || 0))}
          icon={<Receipt className="w-6 h-6" />}
          className="border-t-4 border-t-primary"
        />
        <MetricCard
          title="Total Given"
          value={formatCurrencyINR(Number(customer.totalGiven || 0))}
          icon={<History className="w-6 h-6" />}
          subValue="All credit issued"
          className="border-t-4 border-t-orange-500"
        />
        <MetricCard
          title="Total Received"
          value={formatCurrencyINR(Number(customer.totalReceived || 0))}
          icon={<IndianRupee className="w-6 h-6" />}
          subValue="All payments received"
          className="border-t-4 border-t-green-500"
        />
        <MetricCard
          title={`Profit for ${formatDate(selectedProfitDate, "dd MMM")}`}
          value={formatCurrencyINR(Number(customer.todayProfit || 0))}
          icon={<CalendarIcon className="w-6 h-6" />}
          subValue="Change the date above to view another day"
          className="border-t-4 border-t-amber-500"
        />
        <MetricCard
          title="Current Balance"
          value={formatCurrencyINR(balance)}
          icon={<Wallet className="w-6 h-6" />}
          subValue={balance > 0 ? "Customer owes money" : balance < 0 ? "Advance balance" : "Settled"}
          className={cn(
            "border-t-4",
            balance > 0 ? "border-t-red-500 bg-red-50/50 dark:bg-red-950/10" : "border-t-green-500",
          )}
        />
        <MetricCard
          title="Total Profit"
          value={formatCurrencyINR(Number(customer.totalProfit || 0))}
          icon={<TrendingUp className="w-6 h-6" />}
          subValue="Editable manual total for this customer"
          className="border-t-4 border-t-blue-500"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-xl font-display">Customer Ledger</h3>
            <p className="text-sm text-muted-foreground">Newest entries first with running balance after each transaction.</p>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock3 className="w-4 h-4" />
            Immutable ledger entries
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Note</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                  <th className="px-6 py-4 font-semibold text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customer.ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                          entry.type === "CREDIT"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                        )}
                      >
                        {entry.type === "CREDIT" ? "Credit" : "Payment"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{entry.note || (entry.type === "CREDIT" ? "Manual credit" : "Manual payment")}</div>
                      {entry.billId ? (
                        <div className="mt-1">
                          <Link href={`/bills/${entry.billId}`}>
                            <span className="text-xs text-primary hover:underline font-mono cursor-pointer">
                              Open Bill #{entry.billId}
                            </span>
                          </Link>
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-4 text-right font-mono font-medium",
                        entry.type === "CREDIT" ? "text-red-600" : "text-green-600",
                      )}
                    >
                      {entry.type === "CREDIT" ? "+" : "-"}
                      {formatCurrencyINR(Number(entry.amount || 0))}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-4 text-right font-mono font-semibold",
                        Number(entry.runningBalance) > 0 ? "text-red-600" : Number(entry.runningBalance) < 0 ? "text-green-600" : "text-foreground",
                      )}
                    >
                      {formatCurrencyINR(Number(entry.runningBalance || 0))}
                    </td>
                  </tr>
                ))}
                {customer.ledger.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No ledger entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={entryMode !== null} onOpenChange={(open) => !open && closeEntryDialog()}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitEntry();
            }}
          >
            <DialogHeader>
              <DialogTitle>{entryMode === "CREDIT" ? "Add Credit" : "Add Payment"} for {customer.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.01"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  placeholder={entryMode === "CREDIT" ? "Enter credit amount" : "Enter payment amount"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Note (optional)</label>
                <Input
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  placeholder={entryMode === "CREDIT" ? "e.g., Home delivery pending" : "e.g., Cash payment"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date (optional)</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !entryDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {entryDate ? formatDate(entryDate, "PPP") : <span>Pick a date (defaults to today)</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={entryDate}
                      onSelect={setEntryDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEntryDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !entryAmount}
                className={entryMode === "CREDIT" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
              >
                {isSaving ? "Saving..." : entryMode === "CREDIT" ? "Save Credit" : "Save Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isProfitDialogOpen} onOpenChange={setIsProfitDialogOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleProfitSave();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit Total Profit for {customer.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Profit</label>
                <Input
                  autoFocus
                  type="number"
                  step="0.01"
                  value={profitAmount}
                  onChange={(e) => setProfitAmount(e.target.value)}
                  placeholder="Enter total profit"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                This updates the displayed overall profit for this customer without changing past bill rows.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsProfitDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdatingProfit || profitAmount === ""}>
                {isUpdatingProfit ? "Saving..." : "Save Profit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
