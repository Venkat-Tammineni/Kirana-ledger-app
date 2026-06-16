import { useBills, useBill, useDeleteBill, useUpdateBill } from "@/hooks/use-pos";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { CalendarIcon, ChevronRight, FileText, Pencil, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDate, formatDateTime, toISTDateTimeStringForApi } from "@/lib/format";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { parseVoiceDateInput } from "@/lib/voice-commands";
import { getISTDateKey, getISTParts } from "@shared/timezone";
import { formatBillLabel } from "@shared/billing";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getBaseUnit, toBaseQuantity, type UnitOption } from "@shared/units";

type ItemBillSearchResult = {
  id: number;
  customerName: string | null;
  date: string | Date | null;
  totalAmount: string | number;
  status?: string | null;
  matchedItems: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    subtotal: string | number;
  }>;
};

const BILL_HISTORY_SCROLL_KEY = "kirana.billHistory.scrollY";

export default function Bills() {
  const { data: bills, isLoading } = useBills();
  const { mutate: updateBill, isPending: isUpdatingBill } = useUpdateBill();
  const { mutate: deleteBill, isPending: isDeleting } = useDeleteBill();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [billToDelete, setBillToDelete] = useState<{ id: number; customerName: string } | null>(null);
  const [billToChangeDate, setBillToChangeDate] = useState<{ id: number; customerName: string } | null>(null);
  const [selectedBillDate, setSelectedBillDate] = useState<Date | undefined>(undefined);
  const [isBillDatePickerOpen, setIsBillDatePickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("search") || "";
  });
  const { data: billDetails, isLoading: isBillDetailsLoading } = useBill(billToChangeDate?.id ?? 0);
  const trimmedItemSearch = itemSearch.trim();

  const { data: itemBillSearchResults = [], isFetching: isItemSearchLoading } = useQuery({
    queryKey: [api.reporting.itemBills.path, "bill-history", trimmedItemSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: "1900-01-01",
        endDate: "9999-12-31",
        search: trimmedItemSearch,
      });
      const res = await fetch(`${buildUrl(api.reporting.itemBills.path)}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch item bill search results");
      return api.reporting.itemBills.responses[200].parse(await res.json()) as ItemBillSearchResult[];
    },
    enabled: trimmedItemSearch.length > 0,
  });

  const isSearchingItems = trimmedItemSearch.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (trimmedItemSearch) {
      params.set("search", trimmedItemSearch);
    } else {
      params.delete("search");
    }

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, "", nextUrl);
    }
  }, [trimmedItemSearch]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading || isItemSearchLoading) return;

    const savedScrollY = window.sessionStorage.getItem(BILL_HISTORY_SCROLL_KEY);
    if (!savedScrollY) return;

    window.sessionStorage.removeItem(BILL_HISTORY_SCROLL_KEY);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Number(savedScrollY) || 0 });
    });
  }, [bills?.length, isItemSearchLoading, isLoading, itemBillSearchResults.length]);

  const openBill = (id: number, path = `/bills/${id}`) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(BILL_HISTORY_SCROLL_KEY, String(window.scrollY));
      const backHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const separator = path.includes("?") ? "&" : "?";
      setLocation(`${path}${separator}back=${encodeURIComponent(backHref)}`);
      return;
    }
    setLocation(path);
  };

  useEffect(() => {
    if (!billToChangeDate || !billDetails) return;
    setSelectedBillDate(billDetails.date ? new Date(billDetails.date) : new Date());
  }, [billToChangeDate, billDetails]);

  const billVoiceCommands = [
    {
      label: "Open bill by customer and date",
      examples: ["open pulav bill on 04-04-2026", "edit pulav bill on 04-04-2026"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^(open|edit)\s+(.+?)\s+bill\s+on\s+(\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})$/);
        if (!match) return null;
        const action = match[1];
        const customerQuery = match[2].trim();
        const date = parseVoiceDateInput(match[3]);
        if (!date) return "I could not understand that bill date.";

        const matchingBill = (bills || []).find((bill) => {
          const customerName = (bill.customerName || "walk-in customer").toLowerCase();
          return customerName.includes(customerQuery) && bill.date && getISTDateKey(bill.date) === getISTDateKey(date);
        });

        if (!matchingBill) return `I could not find a bill for ${customerQuery} on ${match[3]}.`;
        openBill(matchingBill.id, action === "edit" ? `/bills/${matchingBill.id}/edit` : `/bills/${matchingBill.id}`);
        return `${action === "edit" ? "Opening edit for" : "Opening"} bill ${formatBillLabel(matchingBill)}.`;
      },
    },
  ];

  if (isLoading) {
    return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  }

  const saveBillDateChange = () => {
    if (!billToChangeDate || !billDetails || !selectedBillDate) return;

    updateBill(
      {
        id: billDetails.id,
        bill: {
          customerId: billDetails.customerId ?? undefined,
          paymentAccountId: undefined,
          items: billDetails.items.map((item) => ({
            productId: item.productId ?? undefined,
            name: item.name,
            quantity: Number(item.quantity || 0),
            unit: (item.unit as UnitOption | null) || undefined,
            baseQuantity:
              item.baseQuantity ??
              toBaseQuantity(
                Number(item.quantity || 0),
                {
                  primaryUnit: item.unit || item.baseUnit || "PCS",
                  secondaryUnit:
                    item.baseUnit && item.unit && item.baseUnit !== item.unit ? item.baseUnit : null,
                  unitConversion:
                    item.baseQuantity && item.quantity && Number(item.quantity) > 0
                      ? Math.round(Number(item.baseQuantity) / Number(item.quantity))
                      : null,
                },
                item.unit || undefined,
              ),
            baseUnit: (
              item.baseUnit ||
              getBaseUnit({
                primaryUnit: item.unit || "PCS",
                secondaryUnit: null,
                unitConversion: null,
              })
            ) as UnitOption,
            price: Number(item.price || 0),
            costPrice: Number(item.costPrice || 0),
          })),
          extraCharges: (billDetails.charges || []).map((charge) => ({
            label: charge.label,
            amount: Number(charge.amount || 0),
          })),
          editedBy: billDetails.lastEditedBy || undefined,
          paidAmount: Number(billDetails.billPaidAmount || 0) + Number(billDetails.oldBalancePaidAmount || 0),
          date: toISTDateTimeStringForApi(selectedBillDate),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Bill date updated",
              description: `${formatBillLabel(billDetails)} moved to ${formatDate(selectedBillDate, "dd MMM yyyy")}.`,
          });
          setBillToChangeDate(null);
          setSelectedBillDate(undefined);
        },
        onError: (error: Error) => {
          toast({
            title: "Could not update bill date",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-display font-bold text-foreground">Bill History</h1>
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={itemSearch}
            onChange={(event) => setItemSearch(event.target.value)}
            placeholder="Search item, e.g. pulav"
            className="h-10 pl-9 pr-10"
          />
          {itemSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              onClick={() => setItemSearch("")}
              aria-label="Clear item search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {isItemSearchLoading ? (
          <div className="p-6">
            <Skeleton className="h-72 w-full" />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Bill ID</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Customer</th>
                {isSearchingItems && <th className="px-6 py-4 font-semibold">Matched Items</th>}
                <th className="px-6 py-4 font-semibold text-right">Total Amount</th>
                <th className="px-6 py-4 font-semibold text-right">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(isSearchingItems ? itemBillSearchResults : bills || []).map((bill) => (
                <tr
                  key={bill.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors group"
                  role="link"
                  tabIndex={0}
                  onClick={() => openBill(bill.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openBill(bill.id);
                    }
                  }}
                >
                  <td className="px-6 py-4 font-mono font-medium">{formatBillLabel(bill)}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {bill.date ? formatDateTime(bill.date, "dd MMM, hh:mm a") : '-'}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {bill.customerName || "Walk-in Customer"}
                  </td>
                  {isSearchingItems && (
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {(bill as ItemBillSearchResult).matchedItems.map((item, index) => (
                          <div key={`${bill.id}-${item.name}-${index}`} className="font-medium">
                            {item.name}
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {item.quantity} {item.unit || "PCS"} · {formatCurrencyINR(Number(item.subtotal || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4 text-right font-mono font-bold">
                    {formatCurrencyINR(Number(bill.totalAmount || 0))}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                      bill.status === 'completed' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    )}>
                      {bill.status || "completed"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {bill.status === "completed" && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="Change bill date"
                          onClick={(event) => {
                            event.stopPropagation();
                            setBillToChangeDate({
                              id: bill.id,
                              customerName: bill.customerName || "Walk-in Customer",
                            });
                          }}
                        >
                          <CalendarIcon className="w-4 h-4" />
                        </button>
                      )}
                      {bill.status === "completed" && (
                        <Link
                          href={`/bills/${bill.id}/edit${
                            typeof window !== "undefined"
                              ? `?back=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`)}`
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Edit bill"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (typeof window !== "undefined") {
                                window.sessionStorage.setItem(BILL_HISTORY_SCROLL_KEY, String(window.scrollY));
                              }
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </Link>
                      )}
                      {bill.status === "completed" && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete bill"
                          onClick={(event) => {
                            event.stopPropagation();
                            setBillToDelete({
                              id: bill.id,
                              customerName: bill.customerName || "Walk-in Customer",
                            });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="View bill"
                        onClick={(event) => {
                          event.stopPropagation();
                          openBill(bill.id);
                        }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(isSearchingItems ? itemBillSearchResults.length === 0 : bills?.length === 0) && (
                <tr>
                  <td colSpan={isSearchingItems ? 7 : 6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-10 h-10 opacity-20" />
                      <p>
                        {isSearchingItems
                          ? `No bills found with item "${trimmedItemSearch}".`
                          : "No bills generated yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
      <AlertDialog open={!!billToDelete} onOpenChange={(open) => !open && setBillToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the bill completely. Customer due, stock, sales, and profit will go back to the previous values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBillToDelete(null)}>Keep Bill</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!billToDelete) return;
                deleteBill(billToDelete.id, {
                  onSuccess: () => {
                    toast({
                      title: "Bill deleted",
                        description: `${formatBillLabel(billToDelete.id)} for ${billToDelete.customerName} was reversed successfully.`,
                    });
                    setBillToDelete(null);
                  },
                  onError: (error: Error) => {
                    toast({
                      title: "Delete failed",
                      description: error.message,
                      variant: "destructive",
                    });
                  },
                });
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Bill"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={!!billToChangeDate}
        onOpenChange={(open) => {
          if (!open) {
            setBillToChangeDate(null);
            setSelectedBillDate(undefined);
            setIsBillDatePickerOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Bill Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              {billToChangeDate ? `${formatBillLabel(billToChangeDate.id)} for ${billToChangeDate.customerName}` : ""}
            </div>
            {isBillDetailsLoading || !billDetails ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Popover open={isBillDatePickerOpen} onOpenChange={setIsBillDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedBillDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedBillDate ? formatDate(selectedBillDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedBillDate}
                    onSelect={(date) => {
                      if (!date) return;
                      setSelectedBillDate(date);
                      setIsBillDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
            {billDetails?.date ? (
              <div className="text-xs text-muted-foreground">
                Current date: {formatDateTime(billDetails.date, "dd MMM yyyy, hh:mm a")}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBillToChangeDate(null);
                setSelectedBillDate(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedBillDate || !billDetails || isUpdatingBill}
              onClick={saveBillDateChange}
            >
              {isUpdatingBill ? "Saving..." : "Save Date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VoiceAssistant
        title="Bills Voice Helper"
        subtitle="Open or edit a bill by customer name and date."
        commands={billVoiceCommands}
      />
    </>
  );
}
