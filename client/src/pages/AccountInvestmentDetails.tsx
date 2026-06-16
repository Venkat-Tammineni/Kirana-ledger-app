import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ClipboardList, Landmark, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useAccounts, useAddInvestment, useDeleteAccountTransaction, useDeleteInvestment, useInvestmentDetails, useProducts, useSpendFromAccount } from "@/hooks/use-pos";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyINR, formatDate, formatDateTime, toISTDateInputValue } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { getISTDateKey, getISTDayBounds, parseISTDateOnly, parseISTDateTime } from "@shared/timezone";
import { getBaseUnit, getDefaultSalesUnit, getPrimaryUnit, hasSecondaryUnit } from "@shared/units";

type InvestmentSourceFilter = "all" | "account_spent" | "manual";
type PurchaseRowUnit = BulkPurchaseUnit | "";
type PurchaseRow = { productId: string; productName: string; quantity: string; costPrice: string; unit: PurchaseRowUnit };
type BulkPurchaseUnit = "KG" | "GRAMS" | "PCS" | "BAG" | "BOXES" | "BOTTLES" | "CANS" | "DOZENS" | "LITRE";
type ParsedBulkPurchaseLine = { name: string; quantity: number; unit: BulkPurchaseUnit | null; lineTotal?: number };
type PendingDeleteEntry =
  | { source: "manual"; id: number }
  | { source: "account_spent"; id: number; accountId: number };

const emptyPurchaseRow = (): PurchaseRow => ({
  productId: "",
  productName: "",
  quantity: "",
  costPrice: "",
  unit: "",
});

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompactText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function normalizeBulkPurchaseUnit(value?: string): BulkPurchaseUnit | null {
  const normalized = value?.trim().toLowerCase().replace(/\./g, "");
  if (!normalized) return null;

  const unitMap: Record<string, BulkPurchaseUnit> = {
    bag: "BAG",
    bags: "BAG",
    box: "BOXES",
    boxes: "BOXES",
    carton: "BOXES",
    cartons: "BOXES",
    cartoon: "BOXES",
    cartoons: "BOXES",
    bottle: "BOTTLES",
    bottles: "BOTTLES",
    btl: "BOTTLES",
    can: "CANS",
    cans: "CANS",
    dozen: "DOZENS",
    dozens: "DOZENS",
    g: "GRAMS",
    gm: "GRAMS",
    gms: "GRAMS",
    gram: "GRAMS",
    grams: "GRAMS",
    grm: "GRAMS",
    grms: "GRAMS",
    kg: "KG",
    kgs: "KG",
    kilo: "KG",
    kilos: "KG",
    l: "LITRE",
    litre: "LITRE",
    litres: "LITRE",
    ltr: "LITRE",
    ltrs: "LITRE",
    pc: "PCS",
    pcs: "PCS",
    piece: "PCS",
    pieces: "PCS",
  };

  return unitMap[normalized] ?? null;
}

function parseBulkPurchaseLine(line: string): ParsedBulkPurchaseLine | null {
  const cleaned = line
    .replace(/^[\s*#.-]+/, "")
    .replace(/\s*[-–—:]\s*(?=\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z.]+)?(?:\s*(?:@|x|rate)\s*(\d+(?:\.\d+)?))?$/i);
  if (!match) return null;

  const quantity = Number(match[2]);
  const lineTotal = match[4] ? Number(match[4]) : undefined;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (lineTotal !== undefined && (!Number.isFinite(lineTotal) || lineTotal < 0)) return null;

  return {
    name: match[1].trim(),
    quantity,
    unit: normalizeBulkPurchaseUnit(match[3]),
    lineTotal,
  };
}

function convertQuantityToProductBase(
  quantity: number,
  unit: BulkPurchaseUnit | null,
  product: {
    primaryUnit?: string | null;
    secondaryUnit?: string | null;
    unitConversion?: number | string | null;
  },
) {
  const baseUnit = getBaseUnit(product);
  if (!unit || unit === baseUnit) return quantity;
  if (hasSecondaryUnit(product) && unit === getPrimaryUnit(product)) {
    return quantity * Number(product.unitConversion || 1);
  }
  if (unit === "KG" && baseUnit === "GRAMS") return quantity * 1000;
  if (unit === "GRAMS" && baseUnit === "KG") return quantity / 1000;
  return quantity;
}

function getPreferredPurchaseUnit(product?: {
  primaryUnit?: string | null;
  secondaryUnit?: string | null;
  unitConversion?: number | string | null;
}): PurchaseRowUnit {
  if (!product) return "";

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const baseUnit = getBaseUnit(unitConfig);
  const primaryUnit = getPrimaryUnit(unitConfig);
  const defaultUnit = getDefaultSalesUnit(unitConfig) as BulkPurchaseUnit;

  if (baseUnit === "GRAMS" || baseUnit === "KG") return "KG";
  if (!hasSecondaryUnit(unitConfig) && (primaryUnit === "GRAMS" || primaryUnit === "KG")) return "KG";
  return defaultUnit;
}

function getAvailablePurchaseUnits(product?: {
  primaryUnit?: string | null;
  secondaryUnit?: string | null;
  unitConversion?: number | string | null;
}): BulkPurchaseUnit[] {
  if (!product) return [];

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const baseUnit = getBaseUnit(unitConfig);
  const primaryUnit = getPrimaryUnit(unitConfig);
  const units = new Set<BulkPurchaseUnit>();

  if (baseUnit === "GRAMS" || baseUnit === "KG" || primaryUnit === "GRAMS" || primaryUnit === "KG") {
    units.add("KG");
    units.add("GRAMS");
  }

  units.add(primaryUnit as BulkPurchaseUnit);
  units.add(baseUnit as BulkPurchaseUnit);

  return Array.from(units);
}

function derivePurchaseQuantityFromBase(
  baseQuantity: number,
  unit: BulkPurchaseUnit | null,
  product?: {
    primaryUnit?: string | null;
    secondaryUnit?: string | null;
    unitConversion?: number | string | null;
  },
) {
  if (!product || !unit) return baseQuantity;

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const baseUnit = getBaseUnit(unitConfig);
  if (unit === baseUnit) return baseQuantity;
  if (hasSecondaryUnit(unitConfig) && unit === getPrimaryUnit(unitConfig)) {
    return baseQuantity / Number(product.unitConversion || 1);
  }
  if (unit === "KG" && baseUnit === "GRAMS") return baseQuantity / 1000;
  if (unit === "GRAMS" && baseUnit === "KG") return baseQuantity * 1000;
  return baseQuantity;
}

function normalizePurchaseCostPriceToBase(
  price: number,
  unit: BulkPurchaseUnit | null,
  product?: {
    primaryUnit?: string | null;
    secondaryUnit?: string | null;
    unitConversion?: number | string | null;
  },
) {
  if (!product || !unit) return price;

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const baseUnit = getBaseUnit(unitConfig);
  if (unit === baseUnit) return price;
  if (hasSecondaryUnit(unitConfig) && unit === getPrimaryUnit(unitConfig)) {
    return price / Number(product.unitConversion || 1);
  }
  if (unit === "KG" && baseUnit === "GRAMS") return price / 1000;
  if (unit === "GRAMS" && baseUnit === "KG") return price * 1000;
  return price;
}

function derivePurchaseCostPriceFromBase(
  basePrice: number,
  unit: BulkPurchaseUnit | null,
  product?: {
    primaryUnit?: string | null;
    secondaryUnit?: string | null;
    unitConversion?: number | string | null;
  },
) {
  if (!product || !unit) return basePrice;

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const baseUnit = getBaseUnit(unitConfig);
  if (unit === baseUnit) return basePrice;
  if (hasSecondaryUnit(unitConfig) && unit === getPrimaryUnit(unitConfig)) {
    return basePrice * Number(product.unitConversion || 1);
  }
  if (unit === "KG" && baseUnit === "GRAMS") return basePrice * 1000;
  if (unit === "GRAMS" && baseUnit === "KG") return basePrice / 1000;
  return basePrice;
}

function getBaseCostPriceFromLineTotal(lineTotal: number | undefined, baseQuantity: number) {
  if (lineTotal === undefined || baseQuantity <= 0) return undefined;
  return lineTotal / baseQuantity;
}

function formatStockNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function formatProductStock(product?: {
  stock?: number | string | null;
  primaryUnit?: string | null;
  secondaryUnit?: string | null;
  unitConversion?: number | string | null;
}, stockOverride?: number | null) {
  if (!product) return null;

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const stock = stockOverride ?? Number(product.stock || 0);
  const baseUnit = getBaseUnit(unitConfig);
  const primaryUnit = getPrimaryUnit(unitConfig);

  if (baseUnit === "GRAMS") return `${formatStockNumber(stock / 1000)} KG`;
  if (baseUnit === "KG") return `${formatStockNumber(stock)} KG`;
  if (!hasSecondaryUnit(unitConfig) && primaryUnit === "GRAMS") return `${formatStockNumber(stock / 1000)} KG`;
  if (!hasSecondaryUnit(unitConfig) && primaryUnit === "KG") return `${formatStockNumber(stock)} KG`;

  return `${formatStockNumber(stock)} ${baseUnit}`;
}

function formatProductOldRate(product?: {
  costPrice?: number | string | null;
  primaryUnit?: string | null;
  secondaryUnit?: string | null;
  unitConversion?: number | string | null;
}, unit?: BulkPurchaseUnit | null, costPriceOverride?: number | null) {
  if (!product) return null;

  const unitConfig = {
    primaryUnit: product.primaryUnit,
    secondaryUnit: product.secondaryUnit,
    unitConversion: product.unitConversion,
  };
  const costPrice = costPriceOverride ?? Number(product.costPrice || 0);
  const baseUnit = getBaseUnit(unitConfig);
  const primaryUnit = getPrimaryUnit(unitConfig);
  const displayUnit = unit || getPreferredPurchaseUnit(product);

  if (displayUnit === "KG" && baseUnit === "GRAMS") return `${formatCurrencyINR(costPrice * 1000)} / KG`;
  if (displayUnit === "GRAMS" && baseUnit === "KG") return `${formatCurrencyINR(costPrice / 1000)} / GRAMS`;
  if (!hasSecondaryUnit(unitConfig) && displayUnit === "KG" && primaryUnit === "GRAMS") return `${formatCurrencyINR(costPrice * 1000)} / KG`;
  if (!hasSecondaryUnit(unitConfig) && displayUnit === "GRAMS" && primaryUnit === "KG") return `${formatCurrencyINR(costPrice / 1000)} / GRAMS`;
  if (hasSecondaryUnit(unitConfig) && displayUnit === getPrimaryUnit(unitConfig)) {
    return `${formatCurrencyINR(costPrice * Number(product.unitConversion || 1))} / ${displayUnit}`;
  }
  if (displayUnit === "KG" && baseUnit === "KG") return `${formatCurrencyINR(costPrice)} / KG`;
  if (!hasSecondaryUnit(unitConfig) && displayUnit === "KG" && primaryUnit === "KG") return `${formatCurrencyINR(costPrice)} / KG`;

  return `${formatCurrencyINR(costPrice)} / ${displayUnit}`;
}

export default function AccountInvestmentDetails() {
  const { data: details, isLoading } = useInvestmentDetails();
  const { data: products } = useProducts();
  const { data: accounts } = useAccounts();
  const { mutate: addInvestment, isPending: addingInvestment } = useAddInvestment();
  const { mutate: spendFromAccount, isPending: spendingFromAccount } = useSpendFromAccount();
  const { mutate: deleteInvestment, isPending: deletingInvestment } = useDeleteInvestment();
  const { mutate: deleteAccountTransaction, isPending: deletingAccountTransaction } = useDeleteAccountTransaction();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [purchases, setPurchases] = useState<PurchaseRow[]>([emptyPurchaseRow()]);
  const [isBulkPurchaseOpen, setIsBulkPurchaseOpen] = useState(false);
  const [bulkPurchaseText, setBulkPurchaseText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sourceFilter, setSourceFilter] = useState<InvestmentSourceFilter>("all");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<PendingDeleteEntry | null>(null);

  const purchaseTotal = useMemo(
    () =>
      purchases.reduce((sum, item) => {
        const quantity = Number(item.quantity || 0);
        const costPrice = Number(item.costPrice || 0);
        if (quantity <= 0 || costPrice < 0) return sum;
        return sum + quantity * costPrice;
      }, 0),
    [purchases],
  );
  const enteredAmount = Number(amount);
  const effectiveAmount = Number.isFinite(enteredAmount) && enteredAmount > 0 ? enteredAmount : purchaseTotal;

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

  const hasActiveFilters = Boolean(fromDate || toDate || sourceFilter !== "all");
  const visibleTotals = useMemo(() => {
    if (!details || !hasActiveFilters) {
      return {
        totalInvestment: details?.totalInvestment ?? 0,
        accountSpentTotal: details?.accountSpentTotal ?? 0,
        manualInvestmentTotal: details?.manualInvestmentTotal ?? 0,
      };
    }

    const accountSpentTotal = filteredEntries
      .filter((entry) => entry.source === "account_spent")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const manualInvestmentTotal = filteredEntries
      .filter((entry) => entry.source === "manual")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      totalInvestment: accountSpentTotal + manualInvestmentTotal,
      accountSpentTotal,
      manualInvestmentTotal,
    };
  }, [details, filteredEntries, hasActiveFilters]);

  const findProductForBulkPurchase = (name: string) => {
    const query = normalizeSearchText(name);
    const queryCompact = normalizeCompactText(name);
    if (!query) return null;

    const aliases: Record<string, string[]> = {
      "idly lohitha": ["lohitha idly", "idli lohitha"],
      gottalu: ["gundulu", "gothalu"],
      jera: ["jeera", "zeera"],
      "kaju chura no.1": ["kaju chura no 1", "kaju chura number 1"],
      "kastur methi": ["kasturi methi", "kasuri methi"],
      "salt ashirvad": ["salt ashiravd", "ashirvad salt", "ashirwad salt"],
      miryalu: ["miriyalu", "miriyallu", "mirialu", "pepper"],
      sooji: ["suji", "sujji", "suji rava", "sujji rava", "sooji rava"],
    };

    const scored = (products || [])
      .map((product) => {
        const productName = normalizeSearchText(product.name);
        const productCompact = normalizeCompactText(product.name);
        const productAliases = aliases[productName] || [];
        const aliasKeys = productAliases.map((alias) => ({
          normal: normalizeSearchText(alias),
          compact: normalizeCompactText(alias),
        }));
        let score = 0;

        if (productName === query) score += 1000;
        if (productCompact === queryCompact) score += 950;
        if (productName.includes(query) || query.includes(productName)) score += 550;
        if (productCompact.includes(queryCompact) || queryCompact.includes(productCompact)) score += 500;

        for (const alias of aliasKeys) {
          if (alias.normal === query) score += 1000;
          if (alias.compact === queryCompact) score += 950;
          if (alias.normal.includes(query) || query.includes(alias.normal)) score += 550;
          if (alias.compact.includes(queryCompact) || queryCompact.includes(alias.compact)) score += 500;
        }

        const queryTokens = query.split(" ").filter(Boolean);
        const productTokens = productName.split(" ").filter(Boolean);
        const tokenHits = queryTokens.filter((token) =>
          productTokens.some((productToken) => productToken === token || productToken.includes(token) || token.includes(productToken)),
        ).length;
        score += tokenHits * 120;

        return score > 0 ? { product, score, nameLength: product.name.length } : null;
      })
      .filter((entry): entry is { product: NonNullable<typeof products>[number]; score: number; nameLength: number } => entry !== null)
      .sort((a, b) => b.score - a.score || a.nameLength - b.nameLength);

    if (scored.length === 0) return null;
    if (scored.length === 1) return scored[0].product;
    if (scored[0].score >= scored[1].score + 100 || scored[0].score >= 950) return scored[0].product;
    return null;
  };

  const addBulkPurchases = () => {
    const lines = bulkPurchaseText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast({ title: "Nothing to add", description: "Paste one purchased item per line.", variant: "destructive" });
      return;
    }

    const rowsToAdd: PurchaseRow[] = [];
    const skippedLines: string[] = [];
    const unmatchedLines: string[] = [];

    for (const line of lines) {
      const parsed = parseBulkPurchaseLine(line);
      if (!parsed) {
        skippedLines.push(line);
        continue;
      }

      const product = findProductForBulkPurchase(parsed.name);
      if (!product) {
        unmatchedLines.push(parsed.name);
        continue;
      }

      const baseQuantity = Math.round(convertQuantityToProductBase(parsed.quantity, parsed.unit, product));
      const baseCostPrice = getBaseCostPriceFromLineTotal(parsed.lineTotal, baseQuantity);
      const preferredUnit = (parsed.unit || getPreferredPurchaseUnit(product) || getBaseUnit(product)) as BulkPurchaseUnit;

      rowsToAdd.push({
        productId: String(product.id),
        productName: "",
        quantity: String(derivePurchaseQuantityFromBase(baseQuantity, preferredUnit, product)),
        costPrice:
          baseCostPrice === undefined
            ? ""
            : String(Number(derivePurchaseCostPriceFromBase(baseCostPrice, preferredUnit, product).toFixed(6))),
        unit: preferredUnit,
      });
    }

    if (rowsToAdd.length === 0) {
      toast({
        title: "No products matched",
        description: "Check product names in the pasted list and try again.",
        variant: "destructive",
      });
      return;
    }

    setPurchases((current) => {
      const nonEmptyRows = current.filter((row) => row.productId || row.productName || row.quantity || row.costPrice);
      return [...rowsToAdd, ...nonEmptyRows];
    });

    const rowsWithRate = rowsToAdd.filter((row) => row.costPrice.trim() !== "");
    if (!amount.trim() && rowsWithRate.length > 0) {
      const nextAmount = rowsWithRate.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.costPrice || 0), 0);
      if (nextAmount > 0) setAmount(nextAmount.toFixed(2));
    }

    setBulkPurchaseText("");
    setIsBulkPurchaseOpen(false);

    const descriptionParts = [
      `${rowsToAdd.length} purchase row${rowsToAdd.length === 1 ? "" : "s"} added`,
      unmatchedLines.length > 0 ? `${unmatchedLines.length} unmatched` : null,
      skippedLines.length > 0 ? `${skippedLines.length} skipped` : null,
    ].filter(Boolean);

    toast({ title: "Bulk purchases added", description: descriptionParts.join(". ") });
  };

  const handleAddInvestment = () => {
    const hasIncompletePurchase = purchases.some((item) => {
      const hasAnyValue = item.productId || item.productName || item.quantity || item.costPrice;
      if (!hasAnyValue) return false;
      if ((!item.productId && !item.productName.trim()) || !item.quantity) return true;
      return Number(item.quantity) <= 0 || (item.costPrice.trim() !== "" && Number(item.costPrice) < 0);
    });

    if (hasIncompletePurchase) {
      toast({
        title: "Complete purchase rows",
        description: "Each row needs either a saved product or a typed item name, plus quantity. Rate is optional.",
        variant: "destructive",
      });
      return;
    }

    const normalizedPurchases = purchases
      .map((item) => {
        const product = products?.find((productEntry) => productEntry.id === Number(item.productId));
        const selectedUnit = (item.unit || getPreferredPurchaseUnit(product) || null) as BulkPurchaseUnit | null;
        const quantity = Number(item.quantity);
        const costPrice = item.costPrice.trim() === "" ? undefined : Number(item.costPrice);

        return {
          productId: Number(item.productId),
          quantity: product ? convertQuantityToProductBase(quantity, selectedUnit, product) : quantity,
          costPrice:
            costPrice === undefined || !product
              ? costPrice
              : normalizePurchaseCostPriceToBase(costPrice, selectedUnit, product),
        };
      })
      .filter((item) => item.productId > 0 && item.quantity > 0 && (item.costPrice === undefined || item.costPrice >= 0));

    const manualPurchaseLines = purchases
      .map((item) => {
        const name = item.productName.trim();
        const quantity = Number(item.quantity);
        const costPrice = item.costPrice.trim() === "" ? undefined : Number(item.costPrice);

        return {
          name,
          quantity,
          costPrice,
          unit: item.unit || null,
        };
      })
      .filter((item) => item.name && item.quantity > 0 && (item.costPrice === undefined || item.costPrice >= 0));

    const manualPurchaseSummary = manualPurchaseLines.length
      ? manualPurchaseLines
          .map((item) => {
            const qty = `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
            const rate = item.costPrice !== undefined ? ` @ ${item.costPrice}` : "";
            return `${item.name} ${qty}${rate}`;
          })
          .join(", ")
      : "";

    const noteText =
      note.trim() ||
      (normalizedPurchases.length > 0
        ? `Purchase investment for ${normalizedPurchases.length} item${normalizedPurchases.length === 1 ? "" : "s"}`
        : "Manual investment");

    const finalNote = manualPurchaseSummary ? `${noteText} | Manual items: ${manualPurchaseSummary}` : noteText;

    if (!effectiveAmount || effectiveAmount <= 0) {
      toast({
        title: "Enter amount or items",
        description: "Add at least one purchase row or enter an amount before saving.",
        variant: "destructive",
      });
      return;
    }

    const resetForm = () => {
      setIsCreateOpen(false);
      setAmount("");
      setNote("");
      setDate("");
      setSelectedAccountId("");
      setPurchases([emptyPurchaseRow()]);
      setIsBulkPurchaseOpen(false);
      setBulkPurchaseText("");
    };

    if (selectedAccountId) {
      spendFromAccount(
        {
          id: Number(selectedAccountId),
          amount: effectiveAmount,
          note: finalNote,
          date: date ? toISTDateInputValue(date) : undefined,
          purchases: normalizedPurchases,
        },
        {
          onSuccess: () => {
            toast({ title: "Investment added from selected account" });
            resetForm();
          },
          onError: (error: Error) => {
            toast({ title: "Failed", description: error.message, variant: "destructive" });
          },
        },
      );
      return;
    }

    addInvestment(
      {
        amount: effectiveAmount,
        note: finalNote,
        date: date ? toISTDateInputValue(date) : undefined,
        purchases: normalizedPurchases,
      },
      {
        onSuccess: () => {
          toast({ title: "Investment added" });
          resetForm();
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
          <div className="text-sm text-muted-foreground">
            {hasActiveFilters ? "Filtered Total Investment" : "Total Investment"}
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-foreground">
            {formatCurrencyINR(visibleTotals.totalInvestment)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            {hasActiveFilters ? "Filtered Account Deductions" : "From Account Deductions"}
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-red-600">
            {formatCurrencyINR(visibleTotals.accountSpentTotal)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            {hasActiveFilters ? "Filtered Manual Investments" : "Manual Investments"}
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-primary">
            {formatCurrencyINR(visibleTotals.manualInvestmentTotal)}
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
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className={`text-sm font-semibold ${entry.source === "manual" ? "text-primary" : "text-red-600"}`}>
                          {entry.source === "manual" ? "Manual Investment" : `Deducted from ${entry.sourceLabel}`}
                        </div>
                        <div className="mt-1 text-lg font-bold font-mono">
                          {formatCurrencyINR(entry.amount)}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 md:items-end">
                        <div className="text-sm text-muted-foreground">
                          {entry.date ? formatDateTime(entry.date, "dd MMM, hh:mm a") : "-"}
                        </div>
                        {(entry.source === "manual" || (entry.source === "account_spent" && entry.accountId)) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={deletingInvestment || deletingAccountTransaction}
                            onClick={() =>
                              setPendingDeleteEntry(
                                entry.source === "manual"
                                  ? { source: "manual", id: entry.id }
                                  : { source: "account_spent", id: entry.id, accountId: entry.accountId as number },
                              )
                            }
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                        )}
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
        <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-5xl">
          <form
            className="flex max-h-[90vh] flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddInvestment();
            }}
          >
            <DialogHeader className="px-6 pt-6">
              <DialogTitle>Add Custom Investment</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto px-6 py-2 pb-4">
              <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-4 rounded-xl border border-border p-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount</label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <p className="text-xs text-muted-foreground">
                      Leave this as 0 to use the purchase total automatically.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Money Debited From Which Account</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                    >
                      <option value="">Keep as Manual Investment</option>
                      {accounts?.map((account) => (
                        <option key={account.id} value={String(account.id)}>
                          {account.name} ({formatCurrencyINR(Number(account.currentBalance || 0))} available)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Note</label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for investment" />
                    <p className="text-xs text-muted-foreground">
                      Optional. A default note will be added if you leave this blank.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date (Optional)</label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <label className="text-sm font-medium">Items You Buy</label>
                      <p className="text-sm text-muted-foreground">One row for each purchased product.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setIsBulkPurchaseOpen(true)}
                      >
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Bulk Add
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setPurchases((current) => [emptyPurchaseRow(), ...current])}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Item
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {purchases.map((purchase, index) => {
                      const selectedProduct = products?.find((product) => product.id === Number(purchase.productId));
                      const currentUnit = purchase.unit || getPreferredPurchaseUnit(selectedProduct);
                      const availableUnits = getAvailablePurchaseUnits(selectedProduct);
                      const enteredQuantity = Number(purchase.quantity || 0);
                      const enteredCostPrice = Number(purchase.costPrice || 0);
                      const liveBaseQuantity =
                        selectedProduct && Number.isFinite(enteredQuantity) && enteredQuantity > 0
                          ? convertQuantityToProductBase(enteredQuantity, currentUnit || null, selectedProduct)
                          : 0;
                      const liveBaseCostPrice =
                        selectedProduct && purchase.costPrice.trim() !== "" && Number.isFinite(enteredCostPrice) && enteredCostPrice >= 0
                          ? normalizePurchaseCostPriceToBase(enteredCostPrice, currentUnit || null, selectedProduct)
                          : null;
                      const currentStock = formatProductStock(selectedProduct);
                      const updatedStock = selectedProduct
                        ? formatProductStock(selectedProduct, Number(selectedProduct.stock || 0) + liveBaseQuantity)
                        : null;
                      const oldRate = formatProductOldRate(selectedProduct, currentUnit || null);
                      const liveRate = formatProductOldRate(selectedProduct, currentUnit || null, liveBaseCostPrice);

                      return (
                        <div key={index} className="rounded-xl border border-border p-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Product</label>
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={purchase.productId}
                                onChange={(e) =>
                                  setPurchases((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            productId: e.target.value,
                                            productName: e.target.value ? "" : item.productName,
                                            unit: getPreferredPurchaseUnit(
                                              products?.find((product) => product.id === Number(e.target.value)),
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <option value="">Select item</option>
                                {products?.map((product) => (
                                  <option key={product.id} value={String(product.id)}>
                                    {product.name}
                                  </option>
                                ))}
                              </select>
                              <Input
                                value={purchase.productName}
                                onChange={(e) =>
                                  setPurchases((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            productId: "",
                                            productName: e.target.value,
                                            unit: item.unit || "PCS",
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder="Or type item name manually"
                                className="h-10"
                              />
                              {selectedProduct && (
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current Stock</div>
                                    <div className="mt-1 text-sm font-semibold text-foreground">{currentStock}</div>
                                  </div>
                                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">After Add</div>
                                    <div className="mt-1 text-sm font-semibold text-foreground">{updatedStock || currentStock}</div>
                                  </div>
                                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Old Rate</div>
                                    <div className="mt-1 text-sm font-semibold text-foreground">{oldRate || "-"}</div>
                                  </div>
                                  <div className="rounded-lg bg-muted/40 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">New Rate</div>
                                    <div className="mt-1 text-sm font-semibold text-foreground">
                                      {purchase.costPrice.trim() !== "" ? liveRate || oldRate || "-" : "-"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,140px)_minmax(0,140px)_minmax(0,180px)_auto] lg:items-end">
                              <div className="space-y-2 min-w-0">
                                <label className="text-xs text-muted-foreground">
                                  Qty{currentUnit ? ` (${currentUnit})` : ""}
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={purchase.quantity}
                                  onChange={(e) =>
                                    setPurchases((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, quantity: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  placeholder="0"
                                  className="h-12 bg-white px-4 text-lg font-bold text-slate-950 placeholder:text-slate-400"
                                />
                              </div>

                              <div className="space-y-2 min-w-0">
                                <label className="text-xs text-muted-foreground">Unit</label>
                                <select
                                  className="h-12 w-full rounded-md border border-input bg-white px-4 text-base font-bold text-slate-950"
                                  value={purchase.unit}
                                  onChange={(e) =>
                                    setPurchases((current) =>
                                      current.map((item, itemIndex) => {
                                        if (itemIndex !== index) return item;

                                        const nextUnit = e.target.value as PurchaseRowUnit;
                                        if (!selectedProduct) {
                                          return { ...item, unit: nextUnit };
                                        }

                                        const previousUnit = (item.unit || getPreferredPurchaseUnit(selectedProduct) || null) as BulkPurchaseUnit | null;
                                        const currentQuantity = Number(item.quantity);
                                        const currentCostPrice = Number(item.costPrice);
                                        const baseQuantity =
                                          Number.isFinite(currentQuantity) && currentQuantity > 0
                                            ? convertQuantityToProductBase(currentQuantity, previousUnit, selectedProduct)
                                            : null;
                                        const baseCostPrice =
                                          item.costPrice.trim() !== "" && Number.isFinite(currentCostPrice) && currentCostPrice >= 0
                                            ? normalizePurchaseCostPriceToBase(currentCostPrice, previousUnit, selectedProduct)
                                            : null;

                                        return {
                                          ...item,
                                          unit: nextUnit,
                                          quantity:
                                            baseQuantity === null
                                              ? item.quantity
                                              : String(derivePurchaseQuantityFromBase(baseQuantity, nextUnit || null, selectedProduct)),
                                          costPrice:
                                            baseCostPrice === null
                                              ? item.costPrice
                                              : String(Number(derivePurchaseCostPriceFromBase(baseCostPrice, nextUnit || null, selectedProduct).toFixed(6))),
                                        };
                                      }),
                                    )
                                  }
                                  disabled={!selectedProduct}
                                >
                                  {!selectedProduct && <option value="">Select product first</option>}
                                  {availableUnits.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2 min-w-0">
                                <label className="text-xs text-muted-foreground">
                                  Rate{currentUnit ? ` (${currentUnit})` : ""}
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={purchase.costPrice}
                                  onChange={(e) =>
                                    setPurchases((current) =>
                                      current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, costPrice: e.target.value } : item,
                                      ),
                                    )
                                  }
                                  placeholder="0.00"
                                  className="h-12 bg-white px-4 text-lg font-bold text-slate-950 placeholder:text-slate-400"
                                />
                              </div>

                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-12 w-full lg:w-auto"
                                  disabled={purchases.length === 1}
                                  onClick={() =>
                                    setPurchases((current) =>
                                      current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index),
                                    )
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              Saved products update stock on save. Cost price stays unchanged unless you edit the product manually. Manually typed items are recorded in the investment note and total, without stock update.
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Purchase total from items:{" "}
                    <span className="font-semibold text-foreground">{formatCurrencyINR(purchaseTotal)}</span>
                  </div>

                  <Dialog open={isBulkPurchaseOpen} onOpenChange={setIsBulkPurchaseOpen}>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Bulk Add Purchased Items</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="text-sm text-muted-foreground">
                          Paste one item per line, like "Maida-50kg@1575". The amount after @ is the total price for that line.
                        </div>
                        <Textarea
                          value={bulkPurchaseText}
                          onChange={(e) => setBulkPurchaseText(e.target.value)}
                          placeholder={"Besan 5 kgs\nSujji rava 6 kgs\nZeera 250 grms\nSoda 100 grms @ 40"}
                          className="min-h-[220px] font-mono text-sm"
                          autoFocus
                        />
                        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                          Quantities are converted to each product's stock unit. For example, KG becomes grams if that product stores stock in grams.
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsBulkPurchaseOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={addBulkPurchases}>
                          Add Purchases
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
            <DialogFooter className="border-t bg-background px-6 py-4">
              <Button type="submit" disabled={addingInvestment || spendingFromAccount || effectiveAmount <= 0}>
                {addingInvestment || spendingFromAccount ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDeleteEntry !== null} onOpenChange={(open) => !open && setPendingDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Investment?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting this investment will also remove the stock that was added from it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDeleteEntry) return;
                if (pendingDeleteEntry.source === "manual") {
                  deleteInvestment(pendingDeleteEntry.id, {
                    onSuccess: () => {
                      toast({ title: "Investment deleted" });
                      setPendingDeleteEntry(null);
                    },
                    onError: (error: Error) => {
                      toast({ title: "Failed", description: error.message, variant: "destructive" });
                      setPendingDeleteEntry(null);
                    },
                  });
                  return;
                }

                deleteAccountTransaction(
                  { id: pendingDeleteEntry.accountId, transactionId: pendingDeleteEntry.id },
                  {
                    onSuccess: () => {
                      toast({ title: "Investment deleted" });
                      setPendingDeleteEntry(null);
                    },
                    onError: (error: Error) => {
                      toast({ title: "Failed", description: error.message, variant: "destructive" });
                      setPendingDeleteEntry(null);
                    },
                  },
                );
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
