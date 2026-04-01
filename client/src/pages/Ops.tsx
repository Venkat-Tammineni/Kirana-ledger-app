import { useState } from "react";
import { api } from "@shared/routes";
import { useBulkAdjustStock, useCustomers, useRecurringPurchase } from "@/hooks/use-pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function parseBulkInput(raw: string) {
  const items = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [productId, quantity, type, reason] = line.split(",").map((part) => part?.trim() || "");
      return {
        productId: Number(productId),
        quantity: Number(quantity),
        type: type as "purchase" | "sale" | "adjustment" | "damage" | "return",
        reason: reason || undefined,
      };
    });
  return { items };
}

function parseRecurringInput(raw: string) {
  const items = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [productId, quantity, costPrice] = line.split(",").map((part) => part?.trim() || "");
      return {
        productId: Number(productId),
        quantity: Number(quantity),
        costPrice: costPrice ? Number(costPrice) : undefined,
      };
    });
  return { items };
}

export default function Ops() {
  const { toast } = useToast();
  const { data: customers } = useCustomers();
  const { mutate: bulkAdjust, isPending: bulkPending } = useBulkAdjustStock();
  const { mutate: recurringPurchase, isPending: recurringPending } = useRecurringPurchase();

  const [bulkText, setBulkText] = useState("");
  const [recurringText, setRecurringText] = useState("");
  const [recurringNote, setRecurringNote] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statementCustomerId, setStatementCustomerId] = useState<string>("");

  const downloadCsv = async (url: string, filename: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-24 md:pb-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Ops Shortcuts</h1>
        <p className="text-muted-foreground mt-1">Reduce repetitive manual work for daily operations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-lg">Bulk Stock Update</h2>
          <p className="text-sm text-muted-foreground">Format: `productId,quantity,type,reason` per line.</p>
          <textarea
            className="w-full h-36 rounded-md border border-border p-3 text-sm bg-background"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="1,10,purchase,weekly refill"
          />
          <Button
            disabled={bulkPending || !bulkText.trim()}
            onClick={() =>
              bulkAdjust(parseBulkInput(bulkText), {
                onSuccess: () => {
                  toast({ title: "Bulk update applied" });
                  setBulkText("");
                },
                onError: (error: Error) => toast({ title: "Failed", description: error.message, variant: "destructive" }),
              })
            }
          >
            {bulkPending ? "Applying..." : "Apply Bulk Update"}
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-lg">Recurring Purchase Entry</h2>
          <p className="text-sm text-muted-foreground">Format: `productId,quantity,costPrice` per line.</p>
          <Input value={recurringNote} onChange={(e) => setRecurringNote(e.target.value)} placeholder="Optional purchase note" />
          <textarea
            className="w-full h-32 rounded-md border border-border p-3 text-sm bg-background"
            value={recurringText}
            onChange={(e) => setRecurringText(e.target.value)}
            placeholder="2,25,29.50"
          />
          <Button
            disabled={recurringPending || !recurringText.trim()}
            onClick={() =>
              recurringPurchase(
                { ...parseRecurringInput(recurringText), note: recurringNote || undefined },
                {
                  onSuccess: () => {
                    toast({ title: "Recurring purchase recorded" });
                    setRecurringText("");
                    setRecurringNote("");
                  },
                  onError: (error: Error) => toast({ title: "Failed", description: error.message, variant: "destructive" }),
                },
              )
            }
          >
            {recurringPending ? "Saving..." : "Record Recurring Purchase"}
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-lg">Sales CSV Export</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button
            onClick={async () => {
              try {
                const params = new URLSearchParams();
                if (startDate) params.set("startDate", new Date(startDate).toISOString());
                if (endDate) params.set("endDate", new Date(endDate).toISOString());
                const url = `${api.exports.salesCsv.path}${params.toString() ? `?${params.toString()}` : ""}`;
                await downloadCsv(url, "sales-export.csv");
              } catch (error) {
                toast({ title: "Failed", description: (error as Error).message, variant: "destructive" });
              }
            }}
          >
            Download Sales CSV
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-lg">Customer Statement Download</h2>
          <select
            className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={statementCustomerId}
            onChange={(e) => setStatementCustomerId(e.target.value)}
          >
            <option value="">Select customer</option>
            {customers?.map((customer) => (
              <option key={customer.id} value={String(customer.id)}>
                {customer.name} ({customer.phone})
              </option>
            ))}
          </select>
          <Button
            disabled={!statementCustomerId}
            onClick={async () => {
              try {
                await downloadCsv(
                  api.customers.statement.path.replace(":id", statementCustomerId),
                  `customer-${statementCustomerId}-statement.csv`,
                );
              } catch (error) {
                toast({ title: "Failed", description: (error as Error).message, variant: "destructive" });
              }
            }}
          >
            Download Statement
          </Button>
        </div>
      </div>
    </div>
  );
}

