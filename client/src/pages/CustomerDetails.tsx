import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useAccounts, useCustomer, useRepayCustomer, useAddCustomerCredit, useDeleteCustomerCredit, useDeleteCustomerPayment, useUpdateCustomerDailyProfit, useUpdateCustomerProfit } from "@/hooks/use-pos";
import { useRoute, Link, useLocation } from "wouter";
import { MetricCard } from "@/components/MetricCard";
import {
  ArrowLeft,
  CalendarIcon,
  Clock3,
  History,
  IndianRupee,
  MessageCircle,
  Receipt,
  Trash2,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDate, formatDateTime, toDateInputString, toISTDateTimeStringForApi } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { parseSpokenAmount, parseVoiceDateInput } from "@/lib/voice-commands";

type EntryMode = "CREDIT" | "PAYMENT" | null;
type ProfitViewMode = "day" | "custom";
const CUSTOMER_SCROLL_RESTORE_KEY = "kirana:customers:scrollRestore";
const CUSTOMER_LAST_SCROLL_KEY = "kirana:customers:lastScroll";

export default function CustomerDetails() {
  const [, params] = useRoute("/customers/:id");
  const [, setLocation] = useLocation();
  const id = Number(params?.id);
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const backHref = searchParams?.get("back") || "/customers";
  const returnScroll = searchParams?.get("returnScroll");
  const [selectedProfitDate, setSelectedProfitDate] = useState<Date>(new Date());
  const [profitViewMode, setProfitViewMode] = useState<ProfitViewMode>("day");
  const [customProfitStartDate, setCustomProfitStartDate] = useState<Date | undefined>(new Date());
  const [customProfitEndDate, setCustomProfitEndDate] = useState<Date | undefined>(new Date());
  const selectedProfitDateKey = toDateInputString(selectedProfitDate);
  const customProfitStartDateKey = customProfitStartDate ? toDateInputString(customProfitStartDate) : undefined;
  const customProfitEndDateKey = customProfitEndDate ? toDateInputString(customProfitEndDate) : undefined;
  const { data: customer, isLoading } = useCustomer(
    id,
    profitViewMode === "custom"
      ? { startDate: customProfitStartDateKey, endDate: customProfitEndDateKey }
      : { profitDate: selectedProfitDateKey },
  );
  const { data: accounts } = useAccounts();
  const { mutate: repayCustomer, isPending: isRepaying } = useRepayCustomer();
  const { mutate: addCustomerCredit, isPending: isAddingCredit } = useAddCustomerCredit();
  const { mutate: deleteCustomerPayment, isPending: isDeletingPayment } = useDeleteCustomerPayment();
  const { mutate: deleteCustomerCredit, isPending: isDeletingCredit } = useDeleteCustomerCredit();
  const { mutate: updateCustomerProfit, isPending: isUpdatingProfit } = useUpdateCustomerProfit();
  const { mutate: updateCustomerDailyProfit, isPending: isUpdatingDailyProfit } = useUpdateCustomerDailyProfit();
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scrollTop = Number(returnScroll);
    if (Number.isFinite(scrollTop) && scrollTop >= 0) {
      window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });

      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("returnScroll");
      const nextSearch = nextParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState(window.history.state, "", nextUrl);
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id, returnScroll]);

  const openBillFromLedger = (billId: number) => {
    if (typeof window === "undefined") return;

    const nextParams = new URLSearchParams(window.location.search);
    nextParams.set("returnScroll", String(window.scrollY));
    const nextSearch = nextParams.toString();
    const backTarget = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;

    setLocation(`/bills/${billId}?back=${encodeURIComponent(backTarget)}`);
  };

  const handleBackToCustomers = (event: MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === "undefined") return;

    event.preventDefault();

    try {
      const backUrl = new URL(backHref, window.location.origin);
      if (backUrl.pathname === "/customers") {
        const restorePayload = JSON.stringify({
          customerId: backUrl.searchParams.get("returnTo"),
          scrollTop: Math.max(0, Math.round(Number(backUrl.searchParams.get("returnScroll")) || 0)),
          search: backUrl.searchParams.get("search") ?? "",
          pending: backUrl.searchParams.get("pending") === "1",
        });
        window.sessionStorage.setItem(CUSTOMER_SCROLL_RESTORE_KEY, restorePayload);
        window.sessionStorage.setItem(CUSTOMER_LAST_SCROLL_KEY, restorePayload);
      }
    } catch {
      // Fall back to normal navigation if the saved back link is not a URL path.
    }

    setLocation(backHref);
  };

  const [entryMode, setEntryMode] = useState<EntryMode>(null);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryDate, setEntryDate] = useState<Date | undefined>(undefined);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [isProfitDialogOpen, setIsProfitDialogOpen] = useState(false);
  const [isDailyProfitDialogOpen, setIsDailyProfitDialogOpen] = useState(false);
  const [profitAmount, setProfitAmount] = useState("");
  const [dailyProfitAmount, setDailyProfitAmount] = useState("");
  const [entryToDelete, setEntryToDelete] = useState<{ id: number; type: "PAYMENT" | "CREDIT"; amount: number } | null>(null);

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
    setPaymentAccountId(null);
  };

  const closeEntryDialog = () => {
    setEntryMode(null);
    setEntryAmount("");
    setEntryNote("");
    setEntryDate(undefined);
    setPaymentAccountId(null);
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
          paymentAccountId: paymentAccountId ?? undefined,
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

  const openDailyProfitDialog = () => {
    if (!customer) return;
    setDailyProfitAmount(String(Number(customer.todayProfit || 0)));
    setIsDailyProfitDialogOpen(true);
  };

  const handleDailyProfitSave = () => {
    if (!customer) return;
    const totalProfit = Number(dailyProfitAmount);
    if (!Number.isFinite(totalProfit)) return;

    updateCustomerDailyProfit(
      {
        customerId: id,
        profitDate: customer.selectedProfitDate,
        totalProfit,
      },
      {
        onSuccess: () => {
          toast({ title: "Day-wise profit updated" });
          setIsDailyProfitDialogOpen(false);
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const customerDetailVoiceCommands = [
    {
      label: "Add payment",
      examples: ["add 5000", "payment 5000"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^(add|payment|add payment)\s+(.+)$/);
        if (!match) return null;
        const amount = parseSpokenAmount(match[2]);
        if (amount == null) return "I could not understand that amount.";
        openEntryDialog("PAYMENT");
        setEntryAmount(String(amount));
        return `Payment amount set to ${amount}. Press save to confirm.`;
      },
    },
    {
      label: "Add credit",
      examples: ["credit 5000"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^credit\s+(.+)$/);
        if (!match) return null;
        const amount = parseSpokenAmount(match[1]);
        if (amount == null) return "I could not understand that amount.";
        openEntryDialog("CREDIT");
        setEntryAmount(String(amount));
        return `Credit amount set to ${amount}. Press save to confirm.`;
      },
    },
    {
      label: "Delete payment",
      examples: ["delete payment 5000"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^delete\s+payment\s+(.+)$/);
        if (!match) return null;
        const amount = parseSpokenAmount(match[1]);
        if (amount == null) return "I could not understand that payment amount.";
        const matches = (customer?.ledger || []).filter(
          (entry) =>
            entry.type === "PAYMENT" &&
            !entry.billId &&
            Number(entry.amount || 0) === amount,
        );
        if (matches.length !== 1) {
          return `I found ${matches.length} matching payments for ${amount}. Please delete it manually if there are multiple.`;
        }
        setEntryToDelete({
          id: matches[0].id,
          type: "PAYMENT",
          amount,
        });
        return `Ready to delete payment ${amount}. Please confirm.`;
      },
    },
    {
      label: "Delete credit",
      examples: ["delete credit 5000"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^delete\s+credit\s+(.+)$/);
        if (!match) return null;
        const amount = parseSpokenAmount(match[1]);
        if (amount == null) return "I could not understand that credit amount.";
        const matches = (customer?.ledger || []).filter(
          (entry) =>
            entry.type === "CREDIT" &&
            !entry.billId &&
            Number(entry.amount || 0) === amount,
        );
        if (matches.length !== 1) {
          return `I found ${matches.length} matching credits for ${amount}. Please delete it manually if there are multiple.`;
        }
        setEntryToDelete({
          id: matches[0].id,
          type: "CREDIT",
          amount,
        });
        return `Ready to delete credit ${amount}. Please confirm.`;
      },
    },
    {
      label: "Set selected day profit",
      examples: ["set day profit to 1200"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^set\s+(day\s+)?profit\s+to\s+(.+)$/);
        if (!match) return null;
        const amount = parseSpokenAmount(match[2]);
        if (amount == null) return "I could not understand that profit amount.";
        setDailyProfitAmount(String(amount));
        setIsDailyProfitDialogOpen(true);
        return `Day profit set to ${amount}. Please save to confirm.`;
      },
    },
    {
      label: "Set profit by date",
      examples: ["set profit on 05-04-2026 to 1200"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^set\s+profit\s+on\s+(.+)\s+to\s+(\d+(?:\.\d+)?)$/);
        if (!match) return null;
        const parsedDate = parseVoiceDateInput(match[1].trim());
        if (!parsedDate) return "I could not understand that profit date.";
        const amount = Number(match[2]);
        if (!Number.isFinite(amount)) return "I could not understand that profit amount.";
        setSelectedProfitDate(parsedDate);
        setDailyProfitAmount(String(amount));
        setIsDailyProfitDialogOpen(true);
        return `Opened day profit for ${formatDate(parsedDate, "dd MMM yyyy")}. Please save to confirm.`;
      },
    },
    {
      label: "Save payment or credit",
      examples: ["save payment now", "save credit now"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        if (!["save payment now", "save credit now", "save now", "confirm payment", "confirm credit"].includes(normalized)) {
          return null;
        }
        if (!entryMode) return "There is no open payment or credit form to save.";
        if (!entryAmount) return "Enter an amount first before saving.";
        handleSubmitEntry();
        return `${entryMode === "PAYMENT" ? "Saving payment" : "Saving credit"} now.`;
      },
    },
    {
      label: "Save profit",
      examples: ["save profit now", "save day profit now"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        if (["save profit now", "save total profit now"].includes(normalized)) {
          if (!isProfitDialogOpen) return "Total profit editor is not open.";
          if (profitAmount === "") return "Enter the profit amount first.";
          handleProfitSave();
          return "Saving total profit now.";
        }
        if (["save day profit now", "save selected day profit now"].includes(normalized)) {
          if (!isDailyProfitDialogOpen) return "Day-wise profit editor is not open.";
          if (dailyProfitAmount === "") return "Enter the day profit amount first.";
          handleDailyProfitSave();
          return "Saving day-wise profit now.";
        }
        return null;
      },
    },
    {
      label: "Confirm delete",
      examples: ["yes delete", "confirm delete"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        if (!["yes delete", "confirm delete", "delete now"].includes(normalized)) return null;
        if (!entryToDelete) return "There is no delete action waiting for confirmation.";
        const onSuccess = () => {
          toast({
            title: `${entryToDelete.type === "PAYMENT" ? "Payment" : "Credit"} deleted`,
            description: `${formatCurrencyINR(entryToDelete.amount)} was reversed successfully.`,
          });
          setEntryToDelete(null);
        };
        const onError = (error: Error) => {
          toast({ title: "Delete failed", description: error.message, variant: "destructive" });
        };

        if (entryToDelete.type === "PAYMENT") {
          deleteCustomerPayment({ customerId: id, paymentId: entryToDelete.id }, { onSuccess, onError });
        } else {
          deleteCustomerCredit({ customerId: id, entryId: entryToDelete.id }, { onSuccess, onError });
        }
        return "Deleting that customer entry now.";
      },
    },
  ];

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
  const receivedEntries = customer.ledger.filter((entry) => entry.type === "PAYMENT");
  const getEntryLabel = (entry: (typeof customer.ledger)[number]) => {
    if (entry.type === "PAYMENT") {
      return `${formatDate(entry.createdAt, "dd MMM yyyy")} - ${formatCurrencyINR(Number(entry.amount || 0))} received`;
    }
    if (entry.billId) return `Bill #${entry.billId}`;
    return "Credit given";
  };
  const getEntryNote = (entry: (typeof customer.ledger)[number]) => {
    if (entry.type === "PAYMENT") {
      if (entry.billId) return `${formatDate(entry.createdAt, "dd MMM yyyy")} payment received during Bill #${entry.billId}`;
      return entry.note || "Payment received";
    }

    if (entry.billId) return "Bill amount added to total";
    return entry.note || "Manual credit added";
  };
  const profitCardTitle =
    profitViewMode === "custom"
      ? `Profit: ${formatDate(customProfitStartDate || new Date(), "dd MMM")} to ${formatDate(customProfitEndDate || new Date(), "dd MMM")}`
      : `Profit for ${formatDate(selectedProfitDate, "dd MMM")}`;
  const profitCardSubValue =
    profitViewMode === "custom"
      ? "Custom date range profit"
      : "Change the date above to view another day";

  return (
    <>
    <div className="mx-auto w-full max-w-7xl space-y-8 p-6 pb-24 md:p-8 md:pb-8">
      <div className="flex flex-col gap-4">
        <Link
          href={backHref}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleBackToCustomers}
        >
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full lg:w-auto lg:shrink-0">
            <Button
              className="h-12 rounded-md text-base bg-red-600 hover:bg-red-700 text-white lg:w-[168px]"
              onClick={() => openEntryDialog("CREDIT")}
            >
              Add Credit
            </Button>
            <Button
              className="h-12 rounded-md text-base bg-green-600 hover:bg-green-700 text-white lg:w-[168px]"
              onClick={() => openEntryDialog("PAYMENT")}
            >
              Add Payment
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-md text-base whitespace-nowrap lg:w-[168px]"
              onClick={handleShare}
            >
              <MessageCircle className="w-4 h-4 mr-2 shrink-0" />
              Share via WhatsApp
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:col-span-2 xl:col-span-5 xl:flex-row xl:items-start xl:justify-start">
          <div className="xl:w-[500px] xl:flex-none xl:pt-2">
            <h3 className="font-semibold">Customer Profit Controls</h3>
            <p className="text-sm text-muted-foreground">Pick a single date or custom range to see this customer's profit, or manually adjust the overall total profit.</p>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[126px_minmax(220px,1fr)_minmax(140px,174px)_minmax(150px,184px)]">
            <div className="flex flex-col gap-2 sm:w-[126px] sm:flex-none">
              <Button className="h-9 w-full" variant={profitViewMode === "day" ? "default" : "outline"} onClick={() => setProfitViewMode("day")}>
                Day
              </Button>
              <Button className="h-9 w-full" variant={profitViewMode === "custom" ? "default" : "outline"} onClick={() => setProfitViewMode("custom")}>
                Custom Range
              </Button>
            </div>
            {profitViewMode === "custom" ? (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-20 w-full justify-start whitespace-normal text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      From: {formatDate(customProfitStartDate || new Date(), "dd MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customProfitStartDate}
                      onSelect={(date) => date && setCustomProfitStartDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-20 w-full justify-start whitespace-normal text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      To: {formatDate(customProfitEndDate || new Date(), "dd MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customProfitEndDate}
                      onSelect={(date) => date && setCustomProfitEndDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-20 w-full justify-start whitespace-normal text-left font-normal">
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
            )}
            <Button className="h-20 w-full whitespace-normal" variant="outline" onClick={openDailyProfitDialog} disabled={profitViewMode === "custom"}>
              Edit Day Profit
            </Button>
            <Button className="h-20 w-full whitespace-normal" variant="outline" onClick={openProfitDialog}>
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
          title={profitCardTitle}
          value={formatCurrencyINR(Number(customer.todayProfit || 0))}
          icon={<CalendarIcon className="w-6 h-6" />}
          subValue={profitCardSubValue}
          titleClassName={profitViewMode === "custom" ? "text-xs leading-tight" : undefined}
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
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h3 className="font-bold text-xl font-display">Money Received</h3>
            <p className="text-sm text-muted-foreground">Every payment is shown clearly by date and amount.</p>
          </div>
          <div className="text-sm font-mono font-semibold text-green-600">
            Total received {formatCurrencyINR(Number(customer.totalReceived || 0))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {receivedEntries.length > 0 ? (
            <div className="divide-y divide-border">
              {receivedEntries.map((entry) => (
                <div key={`${entry.id}-${entry.createdAt}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4">
                  <div>
                    <div className="font-semibold text-green-700">
                      {formatDate(entry.createdAt, "dd MMM yyyy")} - {formatCurrencyINR(Number(entry.amount || 0))} received
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {entry.billId ? `Received during Bill #${entry.billId}` : entry.note || "Manual payment"}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Balance after</div>
                    <div
                      className={cn(
                        "font-mono font-bold",
                        Number(entry.runningBalance) > 0 ? "text-red-600" : Number(entry.runningBalance) < 0 ? "text-green-600" : "text-foreground",
                      )}
                    >
                      {Number(entry.runningBalance) < 0
                        ? `Advance ${formatCurrencyINR(Math.abs(Number(entry.runningBalance || 0)))}`
                        : formatCurrencyINR(Number(entry.runningBalance || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-muted-foreground">
              No payments received yet.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-xl font-display">Customer Ledger</h3>
            <p className="text-sm text-muted-foreground">Bills add to the total. Received money reduces only the running balance.</p>
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
                  <th className="px-6 py-4 font-semibold">Entry</th>
                  <th className="px-6 py-4 font-semibold">Details</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                  <th className="px-6 py-4 font-semibold text-right">Running Balance</th>
                  <th className="px-6 py-4 font-semibold text-right">Action</th>
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
                        {entry.type === "CREDIT" ? "Bill / Credit" : "Received"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{getEntryLabel(entry)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{getEntryNote(entry)}</div>
                      {entry.billId ? (
                        <div className="mt-1">
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline font-mono cursor-pointer"
                            onClick={() => openBillFromLedger(entry.billId!)}
                          >
                            Open Bill #{entry.billId}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-4 text-right font-mono font-medium",
                        entry.type === "CREDIT" ? "text-red-600" : "text-green-600",
                      )}
                    >
                      {entry.type === "CREDIT" ? "+" : "Received "}
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
                    <td className="px-6 py-4 text-right">
                      {!entry.billId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setEntryToDelete({
                              id: entry.id,
                              type: entry.type,
                              amount: Number(entry.amount || 0),
                            })
                          }
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Use bill</span>
                      )}
                    </td>
                  </tr>
                ))}
                {customer.ledger.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
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
                  step="1"
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
                  placeholder={entryMode === "CREDIT" ? "Reason for credit" : "Payment note, not customer name"}
                />
              </div>
              {entryMode === "PAYMENT" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Receive Into Account (optional)</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={paymentAccountId ?? ""}
                    onChange={(e) => setPaymentAccountId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Do not add to account</option>
                    {(accounts || []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                This {entryMode === "CREDIT" ? "credit" : "payment"} will be saved to{" "}
                <span className="font-semibold text-foreground">{customer.name}</span>. The note is only a description.
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
                  step="1"
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
      <Dialog open={isDailyProfitDialogOpen} onOpenChange={setIsDailyProfitDialogOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDailyProfitSave();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit Profit for {formatDate(selectedProfitDate, "dd MMM yyyy")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Day-wise Profit</label>
                <Input
                  autoFocus
                  type="number"
                  step="1"
                  value={dailyProfitAmount}
                  onChange={(e) => setDailyProfitAmount(e.target.value)}
                  placeholder="Enter day-wise profit"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                This changes the profit shown for the selected day and also updates the overall total profit accordingly.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDailyProfitDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdatingDailyProfit || dailyProfitAmount === ""}>
                {isUpdatingDailyProfit ? "Saving..." : "Save Day Profit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the selected manual {entryToDelete?.type === "PAYMENT" ? "payment" : "credit"} entry for this customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEntryToDelete(null)}>Keep It</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!entryToDelete) return;
                const onSuccess = () => {
                  toast({
                    title: `${entryToDelete.type === "PAYMENT" ? "Payment" : "Credit"} deleted`,
                    description: `${formatCurrencyINR(entryToDelete.amount)} was reversed successfully.`,
                  });
                  setEntryToDelete(null);
                };
                const onError = (error: Error) => {
                  toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                };

                if (entryToDelete.type === "PAYMENT") {
                  deleteCustomerPayment({ customerId: id, paymentId: entryToDelete.id }, { onSuccess, onError });
                  return;
                }

                deleteCustomerCredit({ customerId: id, entryId: entryToDelete.id }, { onSuccess, onError });
              }}
              disabled={isDeletingPayment || isDeletingCredit}
            >
              {isDeletingPayment || isDeletingCredit ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
      <VoiceAssistant
        title={`Customer Voice Helper`}
        subtitle="Add or delete payment/credit entries, and set day profit by voice."
        commands={customerDetailVoiceCommands}
      />
    </>
  );
}
