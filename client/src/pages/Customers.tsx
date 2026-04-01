import { useMemo, useState } from "react";
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from "@/hooks/use-pos";
import { Link } from "wouter";
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

export default function Customers() {
  const [search, setSearch] = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);
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

  return (
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
                href={`/customers/${customer.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 hover:bg-muted/50 transition-colors"
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
              className="bg-card p-4 rounded-xl border border-border hover:border-primary hover:shadow-md transition-all group flex justify-between items-center"
            >
              <Link
                href={`/customers/${customer.id}`}
                className="flex-1 flex items-center gap-4 cursor-pointer"
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
  );
}
