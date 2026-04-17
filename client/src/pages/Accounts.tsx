import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocation } from "wouter";
import {
  useAccounts,
  useCreateAccount,
  useSpendFromAccount,
  useAddToAccount,
  useCustomers,
  useDeleteAccountSafe,
  useDeleteAccountForce,
  useInvestmentDetails,
} from "@/hooks/use-pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, CircleHelp, Landmark, Minus, Plus, Trash2, Wallet } from "lucide-react";
import { formatCurrencyINR } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { VoiceAssistant } from "@/components/VoiceAssistant";

type AccountSummary = { id: number; name: string; currentBalance: number; totalSpent: number };

function InvestmentCard({
  totalInvestment,
  accountSpentTotal,
  manualInvestmentTotal,
  openDetails,
}: {
  totalInvestment: number;
  accountSpentTotal: number;
  manualInvestmentTotal: number;
  openDetails: () => void;
}) {
  return (
    <div
      className="bg-card p-5 rounded-xl border border-primary/30 shadow-sm transition-all hover:shadow-md hover:border-primary/50 cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg">Total Investment</h3>
          <p className="text-xs text-muted-foreground mt-1">Account deductions plus custom manual investments.</p>
        </div>
        <Landmark className="w-5 h-5 text-primary shrink-0" />
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Total Investment: <span className="font-semibold text-foreground">{formatCurrencyINR(totalInvestment)}</span>
        </p>
        <p className="text-muted-foreground">
          From Accounts: <span className="font-semibold text-red-600">{formatCurrencyINR(accountSpentTotal)}</span>
        </p>
        <p className="text-muted-foreground">
          Custom Investment: <span className="font-semibold text-primary">{formatCurrencyINR(manualInvestmentTotal)}</span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-primary font-medium">
        <span>Open Investment History</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </div>
  );
}

function AccountCard({
  account,
  spendAccountId,
  setSpendAccountId,
  creditAccountId,
  setCreditAccountId,
  forceDeleteAccountId,
  setForceDeleteAccountId,
  spendAmount,
  setSpendAmount,
  spendNote,
  setSpendNote,
  creditAmount,
  setCreditAmount,
  creditNote,
  setCreditNote,
  creditCustomerId,
  setCreditCustomerId,
  customers,
  spending,
  crediting,
  deletingSafe,
  deletingForce,
  spendFromAccount,
  addToAccount,
  deleteAccountSafe,
  deleteAccountForce,
  toast,
  openDetails,
}: {
  account: AccountSummary;
  spendAccountId: number | null;
  setSpendAccountId: (id: number | null) => void;
  creditAccountId: number | null;
  setCreditAccountId: (id: number | null) => void;
  forceDeleteAccountId: number | null;
  setForceDeleteAccountId: (id: number | null) => void;
  spendAmount: string;
  setSpendAmount: (value: string) => void;
  spendNote: string;
  setSpendNote: (value: string) => void;
  creditAmount: string;
  setCreditAmount: (value: string) => void;
  creditNote: string;
  setCreditNote: (value: string) => void;
  creditCustomerId: number | null;
  setCreditCustomerId: (value: number | null) => void;
  customers: Array<{ id: number; name: string; phone: string }> | undefined;
  spending: boolean;
  crediting: boolean;
  deletingSafe: boolean;
  deletingForce: boolean;
  spendFromAccount: (data: { id: number; amount: number; note: string }, options: any) => void;
  addToAccount: (data: { id: number; amount: number; note: string; customerId?: number }, options: any) => void;
  deleteAccountSafe: (id: number, options: any) => void;
  deleteAccountForce: (id: number, options: any) => void;
  toast: any;
  openDetails: (id: number) => void;
}) {
  const stopCardClick = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
  };

  const matchingCustomers = useMemo(() => {
    const query = creditNote.trim().toLowerCase();
    if (!query) return customers || [];
    const matches = (customers || []).filter(
      (customer: { id: number; name: string; phone: string }) =>
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query),
    );
    return matches.length > 0 ? matches : customers || [];
  }, [creditNote, customers]);

  return (
    <div
      className="bg-card p-5 rounded-xl border border-border shadow-sm transition-all hover:shadow-md hover:border-primary/30 cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => openDetails(account.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails(account.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg">{account.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">Open to view full date-wise history.</p>
        </div>
        <Wallet className="w-5 h-5 text-primary shrink-0" />
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Account Balance: <span className="font-semibold text-foreground">{formatCurrencyINR(Number(account.currentBalance || 0))}</span>
        </p>
        <p className="text-muted-foreground">
          Amount Spent: <span className="font-semibold text-red-600">{formatCurrencyINR(Number(account.totalSpent || 0))}</span>
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-primary font-medium">
        <span>Open Account History</span>
        <ArrowRight className="w-4 h-4" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3" onClick={stopCardClick}>
        <Dialog open={creditAccountId === account.id} onOpenChange={(open) => !open && setCreditAccountId(null)}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={() => setCreditAccountId(account.id)}>
              <Plus className="w-4 h-4 mr-2" /> Add Amount
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addToAccount(
                  { id: account.id, amount: Number(creditAmount || 0), note: creditNote, customerId: creditCustomerId || undefined },
                  {
                    onSuccess: () => {
                      setCreditAccountId(null);
                      setCreditAmount("");
                      setCreditNote("");
                      setCreditCustomerId(null);
                    },
                    onError: (error: Error) => toast({ title: "Failed", description: error.message, variant: "destructive" }),
                  },
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>Add to {account.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <Input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Note (Required)</label>
                  <Input value={creditNote} onChange={(e) => setCreditNote(e.target.value)} placeholder="Reason for adding amount" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer to deduct from (Optional)</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={creditCustomerId || ""}
                    onChange={(e) => setCreditCustomerId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Do not deduct customer balance</option>
                    {matchingCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} ({customer.phone})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    If you select a customer here, the same amount will be recorded as their payment too.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={crediting || !creditAmount || !creditNote.trim()}
                >
                  {crediting ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={spendAccountId === account.id} onOpenChange={(open) => !open && setSpendAccountId(null)}>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={() => setSpendAccountId(account.id)}>
              <Minus className="w-4 h-4 mr-2" /> Subtract Amount
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                spendFromAccount(
                  { id: account.id, amount: Number(spendAmount || 0), note: spendNote },
                  {
                    onSuccess: () => {
                      setSpendAccountId(null);
                      setSpendAmount("");
                      setSpendNote("");
                    },
                    onError: (error: Error) => toast({ title: "Failed", description: error.message, variant: "destructive" }),
                  },
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>Subtract from {account.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <Input type="number" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Note (Required)</label>
                  <Input value={spendNote} onChange={(e) => setSpendNote(e.target.value)} placeholder="Reason for subtraction" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={spending || !spendAmount || !spendNote.trim()}
                >
                  {spending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-3 items-center" onClick={stopCardClick}>
        <Button
          variant="outline"
          className="justify-start"
          onClick={() =>
            deleteAccountSafe(account.id, {
              onSuccess: () => toast({ title: "Account deleted safely" }),
              onError: (error: Error) => toast({ title: "Safe delete failed", description: error.message, variant: "destructive" }),
            })
          }
          disabled={deletingSafe || deletingForce}
        >
          Safe Delete
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              onClick={stopCardClick}
            >
              <CircleHelp className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Safe delete works only if the account has no transaction history.
          </TooltipContent>
        </Tooltip>

        <AlertDialog open={forceDeleteAccountId === account.id} onOpenChange={(open) => !open && setForceDeleteAccountId(null)}>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => setForceDeleteAccountId(account.id)}
            disabled={deletingSafe || deletingForce}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {account.name} permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                Do you really want to delete this account? All your transaction history will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setForceDeleteAccountId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  deleteAccountForce(account.id, {
                    onSuccess: () => {
                      toast({ title: "Account and transaction history deleted" });
                      setForceDeleteAccountId(null);
                    },
                    onError: (error: Error) => {
                      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
                    },
                  })
                }
              >
                Yes, Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function Accounts() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: customers } = useCustomers();
  const { data: investmentDetails } = useInvestmentDetails();
  const { mutate: createAccount, isPending: creating } = useCreateAccount();
  const { mutate: spendFromAccount, isPending: spending } = useSpendFromAccount();
  const { mutate: addToAccount, isPending: crediting } = useAddToAccount();
  const { mutate: deleteAccountSafe, isPending: deletingSafe } = useDeleteAccountSafe();
  const { mutate: deleteAccountForce, isPending: deletingForce } = useDeleteAccountForce();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");

  const [spendAccountId, setSpendAccountId] = useState<number | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendNote, setSpendNote] = useState("");
  const [creditAccountId, setCreditAccountId] = useState<number | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditCustomerId, setCreditCustomerId] = useState<number | null>(null);
  const [forceDeleteAccountId, setForceDeleteAccountId] = useState<number | null>(null);

  const parseSpokenAmount = (value: string) => {
    const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };

  const accountVoiceCommands = useMemo(
    () => [
      {
        label: "Open add amount",
        examples: ["add amount", "open add amount"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          if (!["add amount", "open add amount"].includes(normalized)) return null;
          if (!accounts?.length) return "No accounts found.";
          setCreditAccountId(accounts[0].id);
          return `Opening Add Amount for ${accounts[0].name}.`;
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
          setCreditAmount(String(amount));
          return `Amount set to ${amount}.`;
        },
      },
      {
        label: "Set note",
        examples: ["note pulav payment"],
        run: ({ raw, normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^note\s+(.+)$/);
          if (!match) return null;
          const nextNote = raw.slice(raw.toLowerCase().indexOf("note") + 4).trim();
          setCreditNote(nextNote);
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
          setCreditCustomerId(matches[0].id);
          return `Selected customer ${matches[0].name}.`;
        },
      },
    ],
    [accounts, customers],
  );

  return (
    <>
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground mt-1">Open any card to view full transaction history date-wise.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4 mr-2" /> Add Person
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAccount(
                  { name: newName, openingBalance: Number(openingBalance || 0) },
                  {
                    onSuccess: () => {
                      setIsCreateOpen(false);
                      setNewName("");
                      setOpeningBalance("");
                    },
                    onError: (error: Error) => toast({ title: "Failed", description: error.message, variant: "destructive" }),
                  },
                );
              }}
            >
              <DialogHeader>
                <DialogTitle>Create Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Person Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter name" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Opening Balance</label>
                  <Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={creating || !newName.trim()}
                >
                  {creating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading accounts...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <InvestmentCard
            totalInvestment={investmentDetails?.totalInvestment || 0}
            accountSpentTotal={investmentDetails?.accountSpentTotal || 0}
            manualInvestmentTotal={investmentDetails?.manualInvestmentTotal || 0}
            openDetails={() => setLocation("/accounts/investment")}
          />
          {accounts?.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              spendAccountId={spendAccountId}
              setSpendAccountId={setSpendAccountId}
              creditAccountId={creditAccountId}
              setCreditAccountId={setCreditAccountId}
              forceDeleteAccountId={forceDeleteAccountId}
              setForceDeleteAccountId={setForceDeleteAccountId}
              spendAmount={spendAmount}
              setSpendAmount={setSpendAmount}
              spendNote={spendNote}
              setSpendNote={setSpendNote}
              creditAmount={creditAmount}
              setCreditAmount={setCreditAmount}
              creditNote={creditNote}
              setCreditNote={setCreditNote}
              creditCustomerId={creditCustomerId}
              setCreditCustomerId={setCreditCustomerId}
              customers={customers}
              spending={spending}
              crediting={crediting}
              deletingSafe={deletingSafe}
              deletingForce={deletingForce}
              spendFromAccount={spendFromAccount}
              addToAccount={addToAccount}
              deleteAccountSafe={deleteAccountSafe}
              deleteAccountForce={deleteAccountForce}
              toast={toast}
              openDetails={(id) => setLocation(`/accounts/${id}`)}
            />
          ))}
          {accounts?.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-10 bg-muted/20 border border-dashed border-border rounded-xl">
              No accounts added yet.
            </div>
          )}
        </div>
      )}
    </div>

      <VoiceAssistant
        title="Accounts Voice Helper"
        subtitle="Speak commands for add amount, note, amount, and customer selection."
        commands={accountVoiceCommands}
      />
    </>
  );
}
