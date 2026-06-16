import { useEffect, useMemo, useRef, useState } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@/hooks/use-pos";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, User, Pencil, Trash2, AlertTriangle, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { customerFormSchema } from "@/lib/form-schemas";
import { CustomerFormFields } from "@/components/forms/CustomerFormFields";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyINR } from "@/lib/format";
import { VoiceAssistant } from "@/components/VoiceAssistant";

const CUSTOMER_SCROLL_RESTORE_KEY = "kirana:customers:scrollRestore";
const CUSTOMER_LAST_SCROLL_KEY = "kirana:customers:lastScroll";

export default function Customers() {
  const [, setLocation] = useLocation();
  const hasRestoredScrollRef = useRef(false);
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialSearch = searchParams?.get("search") ?? "";
  const initialShowPendingOnly = searchParams?.get("pending") === "1";
  const returnToCustomerId = searchParams?.get("returnTo");
  const returnScroll = searchParams?.get("returnScroll");

  const [search, setSearch] = useState(initialSearch);
  const [showPendingOnly, setShowPendingOnly] = useState(initialShowPendingOnly);
  const { data: customers, isLoading } = useCustomers(search);
  const { mutate: createCustomer, isPending } = useCreateCustomer();
  const { mutate: updateCustomer, isPending: isUpdating } = useUpdateCustomer();
  const { mutate: deleteCustomer, isPending: isDeleting } = useDeleteCustomer();
  const [isOpen, setIsOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [editingCustomer, setEditingCustomer] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { toast } = useToast();

  const pendingCustomers = useMemo(
    () =>
      (customers || [])
        .filter((customer) => Number(customer.balance) > 0)
        .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0)),
    [customers],
  );

  const visibleCustomers = useMemo(
    () => (showPendingOnly ? pendingCustomers : customers || []),
    [customers, pendingCustomers, showPendingOnly],
  );

  const totalPending = pendingCustomers.reduce(
    (sum, customer) => sum + Number(customer.balance || 0),
    0,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextParams = new URLSearchParams(window.location.search);
    if (search) {
      nextParams.set("search", search);
    } else {
      nextParams.delete("search");
    }

    if (showPendingOnly) {
      nextParams.set("pending", "1");
    } else {
      nextParams.delete("pending");
    }

    const nextSearch = nextParams.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [search, showPendingOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saveLastScroll = () => {
      window.sessionStorage.setItem(
        CUSTOMER_LAST_SCROLL_KEY,
        JSON.stringify({
          scrollTop: Math.max(0, Math.round(window.scrollY)),
          search,
          pending: showPendingOnly,
        }),
      );
    };

    window.addEventListener("scroll", saveLastScroll, { passive: true });
    return () => window.removeEventListener("scroll", saveLastScroll);
  }, [search, showPendingOnly]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading) return;

    const highlightCustomer = (customerElement: HTMLElement | null) => {
      customerElement?.classList.add("ring-2", "ring-primary", "ring-offset-2");
      window.setTimeout(() => {
        customerElement?.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 1800);
    };

    const scrollToCustomer = (customerId?: string | null) => {
      if (!customerId) return false;

      const customerElement = document.querySelector<HTMLElement>(`[data-customer-id="${customerId}"]`);
      if (!customerElement) return false;

      customerElement.scrollIntoView({ behavior: "auto", block: "center" });
      highlightCustomer(customerElement);
      return true;
    };

    const restoreCustomerWhenReady = (customerId?: string | null) => {
      if (!customerId) return;

      const tryRestore = () => {
        scrollToCustomer(customerId);
      };

      tryRestore();
      window.requestAnimationFrame(tryRestore);
      [80, 180, 350, 700, 1200].forEach((delay) => window.setTimeout(tryRestore, delay));
    };

    const restoreScroll = (scrollTop: number, customerId?: string | null) => {
      const shouldUseCustomerAnchor = Boolean(customerId) && scrollTop <= 8;
      const applyScroll = () => {
        if (shouldUseCustomerAnchor) {
          restoreCustomerWhenReady(customerId);
          return;
        }
        window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
      };

      applyScroll();
      window.requestAnimationFrame(() => {
        applyScroll();
        if (!customerId) return;

        const customerElement = document.querySelector<HTMLElement>(`[data-customer-id="${customerId}"]`);
        highlightCustomer(customerElement);
      });
      [80, 180, 350].forEach((delay) => window.setTimeout(applyScroll, delay));
    };

    const clearReturnParams = () => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("returnScroll");
      nextParams.delete("returnTo");
      const nextSearch = nextParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    };

    const scrollTop = Number(returnScroll);
    if (Number.isFinite(scrollTop) && scrollTop >= 0) {
      restoreScroll(scrollTop, returnToCustomerId);
      hasRestoredScrollRef.current = true;
      clearReturnParams();
      return;
    }

    const storedRestore = window.sessionStorage.getItem(CUSTOMER_SCROLL_RESTORE_KEY);
    if (storedRestore) {
      try {
        const parsed = JSON.parse(storedRestore) as {
          scrollTop?: number;
          customerId?: number;
          search?: string;
          pending?: boolean;
        };
        const storedScrollTop = Number(parsed.scrollTop);
        const matchesCurrentView =
          (parsed.search ?? "") === search &&
          Boolean(parsed.pending) === showPendingOnly;

      if (Number.isFinite(storedScrollTop) && storedScrollTop >= 0 && matchesCurrentView) {
          restoreScroll(storedScrollTop, parsed.customerId ? String(parsed.customerId) : null);
          if (parsed.customerId) {
            restoreCustomerWhenReady(String(parsed.customerId));
          }
          hasRestoredScrollRef.current = true;
          return;
        }
      } catch {
        // Ignore invalid restore data.
      }
    }

    const storedLastScroll = window.sessionStorage.getItem(CUSTOMER_LAST_SCROLL_KEY);
    if (!hasRestoredScrollRef.current && storedLastScroll) {
      try {
        const parsed = JSON.parse(storedLastScroll) as {
          scrollTop?: number;
          search?: string;
          pending?: boolean;
        };
        const storedScrollTop = Number(parsed.scrollTop);
        const matchesCurrentView =
          (parsed.search ?? "") === search &&
          Boolean(parsed.pending) === showPendingOnly;

      if (Number.isFinite(storedScrollTop) && storedScrollTop > 0 && matchesCurrentView) {
          restoreScroll(storedScrollTop);
          hasRestoredScrollRef.current = true;
          return;
        }
      } catch {
        // Ignore invalid restore data.
      }
    }

    if (!returnToCustomerId) return;

    const restoreToCustomer = () => {
      if (!scrollToCustomer(returnToCustomerId)) return false;

      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("returnScroll");
      nextParams.delete("returnTo");
      const nextSearch = nextParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      window.history.replaceState(window.history.state, "", nextUrl);

      return true;
    };

    restoreCustomerWhenReady(returnToCustomerId);
    if (restoreToCustomer()) return;

    const timeoutIds = [150, 350, 700, 1200].map((delay) => window.setTimeout(restoreToCustomer, delay));
    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [isLoading, returnScroll, returnToCustomerId, search, showPendingOnly, visibleCustomers]);

  const buildCustomerHref = (customerId: number, scrollTop = 0) => {
    const backParams = new URLSearchParams();
    backParams.set("returnTo", String(customerId));
    backParams.set("returnScroll", String(Math.max(0, Math.round(scrollTop))));
    if (search) backParams.set("search", search);
    if (showPendingOnly) backParams.set("pending", "1");

    return `/customers/${customerId}?back=${encodeURIComponent(`/customers?${backParams.toString()}`)}`;
  };

  const saveCustomerListPosition = (customerId?: number) => {
    const currentScroll = typeof window !== "undefined" ? window.scrollY : 0;
    if (typeof window !== "undefined") {
      const restorePayload = JSON.stringify({
        customerId,
        scrollTop: Math.max(0, Math.round(currentScroll)),
        search,
        pending: showPendingOnly,
      });
      window.sessionStorage.setItem(CUSTOMER_SCROLL_RESTORE_KEY, restorePayload);
      window.sessionStorage.setItem(CUSTOMER_LAST_SCROLL_KEY, restorePayload);
    }
    return currentScroll;
  };

  const openCustomer = (customerId: number) => {
    const currentScroll = saveCustomerListPosition(customerId);
    if (typeof window !== "undefined") {
      const returnParams = new URLSearchParams(window.location.search);
      returnParams.set("returnTo", String(customerId));
      returnParams.set("returnScroll", String(Math.max(0, Math.round(currentScroll))));
      if (search) {
        returnParams.set("search", search);
      } else {
        returnParams.delete("search");
      }
      if (showPendingOnly) {
        returnParams.set("pending", "1");
      } else {
        returnParams.delete("pending");
      }
      const nextSearch = returnParams.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`,
      );
    }
    setLocation(buildCustomerHref(customerId, currentScroll));
  };

  const handleCreate = () => {
    const parsed = customerFormSchema.safeParse(newCustomer);
    if (!parsed.success) {
      toast({ title: "Validation error", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    createCustomer(parsed.data, {
      onSuccess: () => {
        setIsOpen(false);
        setNewCustomer({ name: "", phone: "" });
      }
    });
  };

  const handleEditSave = () => {
    if (!editingCustomer) return;
    saveCustomerListPosition(editingCustomer.id);
    const parsed = customerFormSchema.safeParse({
      name: editingCustomer.name,
      phone: editingCustomer.phone,
    });
    if (!parsed.success) {
      toast({ title: "Validation error", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    updateCustomer(
      {
        id: editingCustomer.id,
        name: parsed.data.name,
        phone: parsed.data.phone,
      },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingCustomer(null);
        },
      },
    );
  };

  const customerVoiceCommands = [
    {
      label: "Open customer",
      examples: ["open pulav", "open famous"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^open\s+(.+)$/);
        if (!match) return null;
        const matches = (customers || []).filter((customer) =>
          customer.name.toLowerCase().includes(match[1].trim()),
        );
        if (matches.length !== 1) return `I could not uniquely match ${match[1].trim()}. Please search once manually.`;
        openCustomer(matches[0].id);
        return `Opening ${matches[0].name}.`;
      },
    },
  ];

  return (
    <>
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage customer profiles and view ledgers.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4 mr-2" /> Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
            >
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
              </DialogHeader>
              <CustomerFormFields value={newCustomer} onChange={setNewCustomer} />
              <DialogFooter>
                <Button type="submit" disabled={isPending || !newCustomer.name}>
                  {isPending ? "Creating..." : "Create Customer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit customer dialog */}
        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setEditingCustomer(null);
        }}>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEditSave();
              }}
            >
              <DialogHeader>
                <DialogTitle>Edit Customer</DialogTitle>
              </DialogHeader>
              {editingCustomer && (
                <CustomerFormFields
                  value={{ name: editingCustomer.name, phone: editingCustomer.phone }}
                  onChange={(next) => setEditingCustomer({ ...editingCustomer, ...next })}
                />
              )}
              <DialogFooter>
                <Button type="submit" disabled={isUpdating || !editingCustomer?.name}>
                  {isUpdating ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input 
          className="pl-10 h-12 bg-card border-border shadow-sm text-base"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Pending Customers</p>
          <p className="text-3xl font-display font-bold mt-2">{pendingCustomers.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Total Pending</p>
          <p className="text-3xl font-display font-bold mt-2 text-red-600">{formatCurrencyINR(totalPending)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">View Mode</p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={showPendingOnly ? "outline" : "default"}
              onClick={() => setShowPendingOnly(false)}
            >
              All Customers
            </Button>
            <Button
              size="sm"
              variant={showPendingOnly ? "default" : "outline"}
              onClick={() => setShowPendingOnly(true)}
            >
              Pending Only
            </Button>
          </div>
        </div>
      </div>

      {pendingCustomers.length > 0 && !showPendingOnly && (
        <div className="mb-8 bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="font-semibold text-lg">Pending Customers Dashboard</h2>
          </div>
          <div className="space-y-3">
            {pendingCustomers.map((customer) => (
              <Link
                key={`pending-${customer.id}`}
                data-customer-id={customer.id}
                href={buildCustomerHref(customer.id)}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 hover:bg-muted/50 transition-colors"
                onClick={(event) => {
                  event.preventDefault();
                  openCustomer(customer.id);
                }}
              >
                <div>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-sm text-muted-foreground">{customer.phone}</div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    "font-mono font-bold",
                    Number(customer.balance || 0) >= 1000 ? "text-red-600" : "text-red-500",
                  )}>
                    {formatCurrencyINR(Number(customer.balance || 0))}
                  </div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3">
          {visibleCustomers?.map((customer) => (
            <div
              key={customer.id}
              data-customer-id={customer.id}
              className="bg-card p-4 rounded-xl border border-border hover:border-primary hover:shadow-md transition-all group flex justify-between items-center"
            >
              <Link
                href={buildCustomerHref(customer.id)}
                className="flex-1 flex items-center gap-4 cursor-pointer"
                onClick={(event) => {
                  event.preventDefault();
                  openCustomer(customer.id);
                }}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold group-hover:text-primary transition-colors">
                    {customer.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{customer.phone}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                      <Wallet className="w-3 h-3" />
                      Given {formatCurrencyINR(Number(customer.totalGiven || 0))}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                      Received {formatCurrencyINR(Number(customer.totalReceived || 0))}
                    </span>
                    {customer.lastPaymentDate ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                        Last payment {customer.daysSinceLastPayment ?? 0}d ago
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-3">
                <div className="text-right mr-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Balance
                  </p>
                  <p
                    className={cn(
                      "font-mono font-bold",
                      Number(customer.balance) > 0 ? "text-red-500" : "text-green-600",
                    )}
                  >
                    {formatCurrencyINR(Number(customer.balance || 0))}
                  </p>
                  {customer.totalProfit !== undefined && (
                    <>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-2">
                        Profit
                      </p>
                      <p className="font-mono font-bold text-green-600">
                        {formatCurrencyINR(Number(customer.totalProfit || 0))}
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-muted text-muted-foreground"
                  onClick={() => {
                    saveCustomerListPosition(customer.id);
                    setEditingCustomer({
                      id: customer.id,
                      name: customer.name,
                      phone: customer.phone,
                    });
                    setIsEditOpen(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-red-50 text-red-500"
                  disabled={isDeleting}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to delete this customer? This cannot be undone.",
                      )
                    ) {
                      saveCustomerListPosition(customer.id);
                      deleteCustomer(customer.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {visibleCustomers?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
              <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{showPendingOnly ? "No pending customers found." : `No customers found matching "${search}"`}</p>
            </div>
          )}
        </div>
      )}
    </div>
      <VoiceAssistant
        title="Customers Voice Helper"
        subtitle="Open a customer by voice."
        commands={customerVoiceCommands}
      />
    </>
  );
}
