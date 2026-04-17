import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CalendarIcon, CreditCard, IndianRupee, Plus, Save, Search, ShoppingBag, Trash2 } from "lucide-react";
import { useBill, useCreateProduct, useProducts, useUpdateBill } from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDate, formatDateTime, toISTDateTimeStringForApi } from "@/lib/format";
import {
  deriveUnitPriceFromBase,
  getBaseUnit,
  getDefaultSalesUnit,
  getPrimaryUnit,
  hasSecondaryUnit,
  normalizeUnitPriceToBase,
  toBaseQuantity,
  UNIT_OPTIONS,
  type UnitOption,
} from "@shared/units";

interface CartItem {
  tempId: string;
  productId?: number;
  name: string;
  price: number;
  basePrice: number;
  costPrice: number;
  baseCostPrice: number;
  quantity: number;
  unit: UnitOption;
  primaryUnit: UnitOption;
  secondaryUnit?: UnitOption | null;
  unitConversion?: number | null;
}

interface ExtraChargeRow {
  id: string;
  label: string;
  amount: string;
}

const ROUND_OFF_LABEL = "Round Off";

interface PendingProductSelection {
  productId: number;
  name: string;
  price: string;
  baseCostPrice: number;
  unit: UnitOption;
  primaryUnit: UnitOption;
  secondaryUnit?: UnitOption | null;
  unitConversion?: number | null;
}

function inferItemUnits(item: {
  unit?: string | null;
  baseUnit?: string | null;
  quantity?: number | null;
  baseQuantity?: number | null;
}) {
  const selectedUnit = (item.unit || item.baseUnit || "PCS") as UnitOption;
  const baseUnit = (item.baseUnit || item.unit || "PCS") as UnitOption;
  const ratio =
    selectedUnit !== baseUnit &&
    Number(item.quantity || 0) > 0 &&
    Number(item.baseQuantity || 0) > Number(item.quantity || 0)
      ? Math.round(Number(item.baseQuantity || 0) / Number(item.quantity || 1))
      : null;

  return {
    primaryUnit: selectedUnit,
    secondaryUnit: selectedUnit !== baseUnit && ratio && ratio > 1 ? baseUnit : null,
    unitConversion: selectedUnit !== baseUnit && ratio && ratio > 1 ? ratio : null,
  };
}

function getItemUnitConfig(
  item: {
    productId?: number | null;
    unit?: string | null;
    baseUnit?: string | null;
    quantity?: number | null;
    baseQuantity?: number | null;
  },
  products?: Array<{
    id: number;
    primaryUnit?: string | null;
    secondaryUnit?: string | null;
    unitConversion?: number | null;
  }>,
) {
  const matchedProduct = item.productId ? products?.find((product) => product.id === item.productId) : undefined;
  if (matchedProduct) {
    return {
      primaryUnit: getPrimaryUnit(matchedProduct),
      secondaryUnit: hasSecondaryUnit(matchedProduct) ? (matchedProduct.secondaryUnit as UnitOption) : null,
      unitConversion: matchedProduct.unitConversion ?? null,
    };
  }

  return inferItemUnits(item);
}

export default function BillEdit() {
  const [, params] = useRoute("/bills/:id/edit");
  const billId = Number(params?.id);
  const [, setLocation] = useLocation();
  const { data: bill, isLoading } = useBill(billId);
  const { data: products, isLoading: isProductsLoading } = useProducts();
  const { mutate: createProduct, isPending: isCreatingProduct } = useCreateProduct();
  const { mutate: updateBill, isPending: isSaving } = useUpdateBill();
  const { toast } = useToast();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [extraCharges, setExtraCharges] = useState<ExtraChargeRow[]>([]);
  const [pendingProduct, setPendingProduct] = useState<PendingProductSelection | null>(null);
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "", costPrice: "", quantity: "1", unit: "PCS" as UnitOption, addToProducts: false });
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [billDate, setBillDate] = useState<Date | undefined>(new Date());
  const [editedBy, setEditedBy] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading || isProductsLoading || initialized) return;
    if (!bill) {
      setInitialized(true);
      return;
    }

    setCart(
      bill.items.map((item) => {
        const unitConfig = getItemUnitConfig(item, products);
        const selectedUnit = (item.unit || item.baseUnit || "PCS") as UnitOption;
        const basePrice = normalizeUnitPriceToBase(Number(item.price || 0), unitConfig, selectedUnit);
        const baseCostPrice = normalizeUnitPriceToBase(Number(item.costPrice || 0), unitConfig, selectedUnit);

        return {
          tempId: crypto.randomUUID(),
          productId: item.productId ?? undefined,
          name: item.name,
          price: Number(item.price || 0),
          basePrice,
          costPrice: Number(item.costPrice || 0),
          baseCostPrice,
          quantity: Number(item.quantity || 1),
          unit: selectedUnit,
          primaryUnit: unitConfig.primaryUnit,
          secondaryUnit: unitConfig.secondaryUnit,
          unitConversion: unitConfig.unitConversion,
        };
      }),
    );
    setExtraCharges(
      (bill.charges || []).map((charge) => ({
        id: crypto.randomUUID(),
        label: charge.label,
        amount: String(Number(charge.amount || 0)),
      })),
    );
    setPaidAmount(
      String(Number(bill.billPaidAmount || 0) + Number(bill.oldBalancePaidAmount || 0)),
    );
    setBillDate(bill.date ? new Date(bill.date) : new Date());
    setEditedBy(bill.lastEditedBy || "");
    setInitialized(true);
  }, [bill, initialized, isLoading, isProductsLoading, products]);

  const filteredProducts = useMemo(() => {
    if (!products || !searchTerm) return products || [];
    const lower = searchTerm.toLowerCase();
    return products.filter((product) => product.name.toLowerCase().includes(lower));
  }, [products, searchTerm]);

  const openProductPriceDialog = (product: any) => {
    const unitConfig = {
      primaryUnit: product.primaryUnit,
      secondaryUnit: product.secondaryUnit,
      unitConversion: product.unitConversion,
    };
    const defaultUnit = getDefaultSalesUnit(unitConfig);
    const basePrice = Number(product.price || 0);
    const baseCostPrice = Number(product.costPrice || 0);
    const defaultPrice = deriveUnitPriceFromBase(basePrice, unitConfig, defaultUnit);

    if (defaultPrice > 0) {
      setCart((prev) => {
        const existing = prev.find(
          (item) =>
            item.productId === product.id &&
            item.unit === defaultUnit &&
            Math.abs(item.price - defaultPrice) < 0.0001,
        );

        if (existing) {
          return prev.map((item) =>
            item.productId === product.id &&
            item.unit === defaultUnit &&
            Math.abs(item.price - defaultPrice) < 0.0001
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        }

        return [
          ...prev,
          {
            tempId: crypto.randomUUID(),
            productId: product.id,
            name: product.name,
            price: defaultPrice,
            basePrice,
            costPrice: deriveUnitPriceFromBase(baseCostPrice, unitConfig, defaultUnit),
            baseCostPrice,
            quantity: 1,
            unit: defaultUnit,
            primaryUnit: getPrimaryUnit(unitConfig),
            secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
            unitConversion: product.unitConversion ?? null,
          },
        ];
      });
      setSearchTerm("");
      return;
    }

    setPendingProduct({
      productId: product.id,
      name: product.name,
      price: defaultPrice.toString(),
      baseCostPrice,
      unit: defaultUnit,
      primaryUnit: getPrimaryUnit(unitConfig),
      secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
      unitConversion: product.unitConversion ?? null,
    });
  };

  const addSelectedProductToCart = () => {
    if (!pendingProduct) return;

    const unitConfig = {
      primaryUnit: pendingProduct.primaryUnit,
      secondaryUnit: pendingProduct.secondaryUnit,
      unitConversion: pendingProduct.unitConversion,
    };
    const nextPrice = Math.max(0, Number(pendingProduct.price || 0));
    const nextBasePrice = normalizeUnitPriceToBase(nextPrice, unitConfig, pendingProduct.unit);

    setCart((prev) => {
      const existing = prev.find(
        (item) =>
          item.productId === pendingProduct.productId &&
          item.unit === pendingProduct.unit &&
          Math.abs(item.price - nextPrice) < 0.0001,
      );

      if (existing) {
        return prev.map((item) =>
          item.productId === pendingProduct.productId &&
          item.unit === pendingProduct.unit &&
          Math.abs(item.price - nextPrice) < 0.0001
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          tempId: crypto.randomUUID(),
          productId: pendingProduct.productId,
          name: pendingProduct.name,
          price: nextPrice,
          basePrice: nextBasePrice,
          costPrice: deriveUnitPriceFromBase(pendingProduct.baseCostPrice, unitConfig, pendingProduct.unit),
          baseCostPrice: pendingProduct.baseCostPrice,
          quantity: 1,
          unit: pendingProduct.unit,
          primaryUnit: pendingProduct.primaryUnit,
          secondaryUnit: pendingProduct.secondaryUnit ?? null,
          unitConversion: pendingProduct.unitConversion ?? null,
        },
      ];
    });

    setPendingProduct(null);
    setSearchTerm("");
  };

  const addCustomItem = () => {
    const trimmedName = customItem.name.trim();
    const price = Number(customItem.price);
    const costPrice = Number(customItem.costPrice);
    const quantity = Number(customItem.quantity || 1);

    if (!trimmedName) {
      toast({ title: "Item name required", description: "Enter a custom item name.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast({ title: "Invalid price", description: "Enter a valid custom item price.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      toast({ title: "Invalid cost price", description: "Enter a valid custom item cost price.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be greater than zero.", variant: "destructive" });
      return;
    }

    const appendCustomItem = (productId?: number) => {
      setCart((prev) => [
        ...prev,
        {
          tempId: crypto.randomUUID(),
          productId,
          name: trimmedName,
          price,
          basePrice: price,
          costPrice,
          baseCostPrice: costPrice,
          quantity,
          unit: customItem.unit,
          primaryUnit: customItem.unit,
          secondaryUnit: null,
          unitConversion: null,
        },
      ]);

      setCustomItem({ name: "", price: "", costPrice: "", quantity: "1", unit: "PCS", addToProducts: false });
      setIsCustomItemOpen(false);
    };

    if (customItem.addToProducts) {
      createProduct(
        {
          name: trimmedName,
          price,
          costPrice,
          primaryUnit: customItem.unit,
          secondaryUnit: null,
          unitConversion: null,
          stock: 0,
          lowStockThreshold: 10,
        },
        {
          onSuccess: (product) => {
            toast({ title: "Product added", description: `${trimmedName} was added to products.` });
            appendCustomItem(product.id);
          },
          onError: (error) => {
            toast({
              title: "Could not add product",
              description: error instanceof Error ? error.message : "Please try again.",
              variant: "destructive",
            });
          },
        },
      );
      return;
    }

    appendCustomItem();
  };

  const setQuantity = (tempId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, quantity: Math.max(1, quantity) } : item,
      ),
    );
  };

  const updateQuantity = (tempId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.tempId === tempId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  };

  const setSellingPrice = (tempId: string, price: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.tempId === tempId
          ? {
              ...item,
              price: Math.max(0, price),
              basePrice: normalizeUnitPriceToBase(Math.max(0, price), {
                primaryUnit: item.primaryUnit,
                secondaryUnit: item.secondaryUnit,
                unitConversion: item.unitConversion,
              }, item.unit),
            }
          : item,
      ),
    );
  };

  const setUnit = (tempId: string, unit: UnitOption) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;

        const unitConfig = {
          primaryUnit: item.primaryUnit,
          secondaryUnit: item.secondaryUnit,
          unitConversion: item.unitConversion,
        };

        return {
          ...item,
          unit,
          price: deriveUnitPriceFromBase(item.basePrice, unitConfig, unit),
          costPrice: deriveUnitPriceFromBase(item.baseCostPrice, unitConfig, unit),
        };
      }),
    );
  };

  const setItemName = (tempId: string, name: string) => {
    setCart((prev) => prev.map((item) => (item.tempId === tempId ? { ...item, name } : item)));
  };

  const removeFromCart = (tempId: string) => {
    setCart((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const addExtraChargeRow = () => {
    setExtraCharges((prev) => [...prev, { id: crypto.randomUUID(), label: "", amount: "" }]);
  };

  const updateExtraCharge = (id: string, field: "label" | "amount", value: string) => {
    setExtraCharges((prev) =>
      prev.map((charge) => (charge.id === id ? { ...charge, [field]: value } : charge)),
    );
  };

  const removeExtraCharge = (id: string) => {
    setExtraCharges((prev) => prev.filter((charge) => charge.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const normalizedExtraCharges = extraCharges
    .map((charge) => ({
      ...charge,
      label: charge.label.trim(),
      amountNumber: Number(charge.amount || 0),
    }))
    .filter((charge) => charge.label && Number.isFinite(charge.amountNumber));
  const nonRoundOffCharges = normalizedExtraCharges.filter(
    (charge) => charge.label.toLowerCase() !== ROUND_OFF_LABEL.toLowerCase(),
  );
  const baseExtraChargesTotal = nonRoundOffCharges.reduce((sum, charge) => sum + charge.amountNumber, 0);
  const baseBillTotal = cartTotal + baseExtraChargesTotal;
  const extraChargesTotal = normalizedExtraCharges.reduce((sum, charge) => sum + charge.amountNumber, 0);
  const billTotal = cartTotal + extraChargesTotal;
  const oldBalance = Math.max(0, Number(bill?.oldBalanceAmount || 0));
  const baseGrandTotal = baseBillTotal + oldBalance;
  const grandTotal = billTotal + oldBalance;

  const applyRoundOff = () => {
    const roundedTotal = Math.round(baseGrandTotal);
    const roundOffAmount = Number((roundedTotal - baseGrandTotal).toFixed(2));

    if (Math.abs(roundOffAmount) < 0.01) {
      setExtraCharges((prev) =>
        prev.filter((charge) => charge.label.trim().toLowerCase() !== ROUND_OFF_LABEL.toLowerCase()),
      );
      toast({ title: "Already rounded", description: "Grand total is already a round figure." });
      return;
    }

    setExtraCharges((prev) => {
      const existingIndex = prev.findIndex(
        (charge) => charge.label.trim().toLowerCase() === ROUND_OFF_LABEL.toLowerCase(),
      );

      if (existingIndex >= 0) {
        return prev.map((charge, index) =>
          index === existingIndex
            ? { ...charge, label: ROUND_OFF_LABEL, amount: roundOffAmount.toFixed(2) }
            : charge,
        );
      }

      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          label: ROUND_OFF_LABEL,
          amount: roundOffAmount.toFixed(2),
        },
      ];
    });

    toast({
      title: "Round off applied",
      description: `Grand total rounded to ${formatCurrencyINR(roundedTotal)}.`,
    });
  };

  const openReview = () => {
    if (cart.length === 0) {
      toast({ title: "Bill is empty", description: "Add at least one item before saving.", variant: "destructive" });
      return;
    }
    setIsReviewOpen(true);
  };

  const submitUpdate = () => {
    if (!bill) return;

    const payment = Number(paidAmount);
    if (Number.isNaN(payment) || payment < 0) return;

    updateBill(
      {
        id: bill.id,
        bill: {
          customerId: bill.customerId ?? undefined,
          items: cart.map((item) => ({
            productId: item.productId,
            name: item.name.trim(),
            quantity: item.quantity,
            unit: item.unit,
            baseQuantity: toBaseQuantity(item.quantity, {
              primaryUnit: item.primaryUnit,
              secondaryUnit: item.secondaryUnit,
              unitConversion: item.unitConversion,
            }, item.unit),
            baseUnit: getBaseUnit({
              primaryUnit: item.primaryUnit,
              secondaryUnit: item.secondaryUnit,
              unitConversion: item.unitConversion,
            }),
            price: item.price,
            costPrice: item.costPrice,
          })),
          extraCharges: normalizedExtraCharges.map((charge) => ({
            label: charge.label,
            amount: charge.amountNumber,
          })),
          editedBy: editedBy.trim() || undefined,
          paidAmount: Math.min(payment, grandTotal),
          date: billDate ? toISTDateTimeStringForApi(billDate) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Bill updated", description: "Changes saved successfully." });
          setLocation(`/bills/${bill.id}`);
        },
        onError: (error: Error) => {
          toast({ title: "Update failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading || isProductsLoading || !initialized) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[620px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Bill not found
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] md:h-screen flex flex-col md:flex-row overflow-hidden bg-background">
      <div className="flex-1 flex flex-col h-full border-r border-border relative z-0">
        <div className="p-4 border-b border-border bg-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href={`/bills/${bill.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Back to Bill Details
              </Link>
              <h2 className="font-display font-bold text-xl mt-2">Edit Bill #{bill.id}</h2>
            </div>
            <div className="text-sm text-muted-foreground">
              Customer: <span className="font-medium text-foreground">{bill.customer?.name || "Walk-in Customer"}</span>
            </div>
          </div>
          {bill.customer?.phone && (
            <div className="mt-2 text-xs text-muted-foreground">
              Phone: {bill.customer.phone}
            </div>
          )}
          {bill.lastEditedAt && (
            <div className="mt-2 text-xs text-muted-foreground">
              Last edited on {formatDateTime(bill.lastEditedAt, "dd MMM yyyy, hh:mm a")}
              {bill.lastEditedBy ? ` by ${bill.lastEditedBy}` : ""}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <ShoppingBag className="w-16 h-16 mb-4" />
              <p>No items in this bill</p>
              <p className="text-sm">Add products to continue editing</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.tempId} className="bg-card p-3 rounded-xl border border-border shadow-sm flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {item.productId ? (
                    <h4 className="font-medium line-clamp-1">{item.name}</h4>
                  ) : (
                    <Input
                      value={item.name}
                      onChange={(e) => setItemName(item.tempId, e.target.value)}
                      className="h-9"
                      placeholder="Custom item name"
                    />
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>Selling Price</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => setSellingPrice(item.tempId, Number(e.target.value) || 0)}
                      className="h-8 w-28 font-mono"
                      onFocus={(e) => e.target.select()}
                    />
                    <span>/ {item.unit}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-bold font-mono">{formatCurrencyINR(item.price * item.quantity)}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-border rounded-lg bg-background">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.tempId, -1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                      >
                        -
                      </button>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.tempId, Number(e.target.value) || 1)}
                        className="w-12 h-8 text-center text-sm font-medium border-0 focus-visible:ring-0 p-0"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.tempId, 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                      >
                        +
                      </button>
                    </div>
                    <select
                      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                      value={item.unit}
                      onChange={(e) => setUnit(item.tempId, e.target.value as UnitOption)}
                    >
                      {Array.from(new Set([item.primaryUnit, ...(item.secondaryUnit ? [item.secondaryUnit] : [])])).map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.tempId)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 bg-card border-t border-border shadow-up-lg z-10">
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-end">
              <span className="text-muted-foreground">Current Bill Total</span>
              <span className="text-3xl font-display font-bold text-primary">{formatCurrencyINR(cartTotal)}</span>
            </div>

            {extraCharges.map((charge) => (
              <div key={charge.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Input
                  placeholder="Charge name"
                  value={charge.label}
                  onChange={(e) => updateExtraCharge(charge.id, "label", e.target.value)}
                  className="h-9"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={charge.amount}
                  onChange={(e) => updateExtraCharge(charge.id, "amount", e.target.value)}
                  className="h-9 font-mono"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  onClick={() => removeExtraCharge(charge.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" className="h-9 px-0 text-primary" onClick={addExtraChargeRow}>
                <Plus className="w-4 h-4 mr-2" /> Add Extra Charge
              </Button>
              <Button type="button" variant="ghost" className="h-9 px-0 text-primary" onClick={applyRoundOff}>
                Round Off
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bill Total</span>
                <span className="font-semibold font-mono">{formatCurrencyINR(billTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Old Balance</span>
                <span className={cn("font-semibold font-mono", oldBalance > 0 ? "text-red-500" : "text-muted-foreground")}>
                  {formatCurrencyINR(oldBalance)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="font-medium">Grand Total</span>
                <span className="font-bold font-mono text-base">{formatCurrencyINR(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Dialog open={isCustomItemOpen} onOpenChange={setIsCustomItemOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 text-base">
                  <Plus className="w-4 h-4 mr-2" /> Custom Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCustomItem();
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Add Custom Item</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Input
                      placeholder="Item Name"
                      value={customItem.name}
                      onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        type="number"
                        placeholder="Price"
                        value={customItem.price}
                        onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                      />
                      <Input
                        type="number"
                        placeholder="Cost Price"
                        value={customItem.costPrice}
                        onChange={(e) => setCustomItem({ ...customItem, costPrice: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={customItem.unit}
                        onChange={(e) => setCustomItem({ ...customItem, unit: e.target.value as UnitOption })}
                      >
                        {UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={customItem.quantity}
                        onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={customItem.addToProducts}
                        onChange={(e) => setCustomItem({ ...customItem, addToProducts: e.target.checked })}
                      />
                      Add this custom item to products also
                    </label>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isCreatingProduct}>
                      {isCreatingProduct ? "Adding..." : "Add to Bill"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Button
              className="h-12 text-base font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
              onClick={openReview}
              disabled={cart.length === 0}
            >
              Save Changes <Save className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      <div className="hidden md:flex flex-col w-[400px] bg-muted/30 h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-10 h-10 bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts?.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => openProductPriceDialog(product)}
                className="flex flex-col items-start p-3 bg-card border border-border/50 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 rounded-xl text-left group"
              >
                {(() => {
                  const unitConfig = {
                    primaryUnit: product.primaryUnit,
                    secondaryUnit: product.secondaryUnit,
                    unitConversion: product.unitConversion,
                  };
                  const defaultUnit = getDefaultSalesUnit(unitConfig);
                  return (
                    <>
                      <div className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">{product.name}</div>
                      <div className="mt-auto font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                        {formatCurrencyINR(deriveUnitPriceFromBase(Number(product.price || 0), unitConfig, defaultUnit))} / {defaultUnit}
                      </div>
                    </>
                  );
                })()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={!!pendingProduct} onOpenChange={(open) => !open && setPendingProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSelectedProductToCart();
            }}
          >
            <DialogHeader>
              <DialogTitle>Confirm Selling Price</DialogTitle>
            </DialogHeader>
            {pendingProduct && (
              <div className="grid gap-4 py-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="text-sm font-medium">{pendingProduct.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    This price change applies only to this bill.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Selling Price / {pendingProduct.unit}</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pendingProduct.price}
                    onChange={(e) =>
                      setPendingProduct((current) =>
                        current ? { ...current, price: e.target.value } : current,
                      )
                    }
                    onFocus={(e) => e.target.select()}
                    className="h-12 text-lg font-mono"
                    autoFocus
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setPendingProduct(null)}>
                Cancel
              </Button>
              <Button type="submit">Add to Bill</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitUpdate();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Finalize Bill Update
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="bg-muted p-4 rounded-xl text-center">
                <span className="text-sm text-muted-foreground">Grand Total</span>
                <div className="text-4xl font-display font-bold text-foreground mt-1">{formatCurrencyINR(grandTotal)}</div>
                <div className="mt-3 space-y-1 text-left text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>This Bill Total</span>
                    <span className="font-mono">{formatCurrencyINR(cartTotal)}</span>
                  </div>
                  {normalizedExtraCharges.map((charge) => (
                    <div key={charge.id} className="flex justify-between text-muted-foreground">
                      <span>{charge.label}</span>
                      <span className="font-mono">{formatCurrencyINR(charge.amountNumber)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Old Balance</span>
                    <span className="font-mono">{formatCurrencyINR(oldBalance)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Paid Amount</label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="number"
                    className="pl-10 h-12 text-lg font-mono"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bill Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !billDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {billDate ? formatDate(billDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={billDate}
                      onSelect={setBillDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Edited By (Optional)</label>
                <Input
                  value={editedBy}
                  onChange={(e) => setEditedBy(e.target.value)}
                  placeholder="Enter editor name"
                  maxLength={80}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
                {isSaving ? "Saving..." : "Save Bill Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
