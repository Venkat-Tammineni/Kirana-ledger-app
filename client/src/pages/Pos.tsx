import { useState, useMemo } from "react";
import { useProducts, useCreateBill, useCustomers } from "@/hooks/use-pos";
import { Search, Plus, Trash2, IndianRupee, Save, CreditCard, UserPlus, CalendarIcon, ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { formatCurrencyINR, toLocalDateTimeString } from "@/lib/format";
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

export default function Pos() {
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const { mutate: createBill, isPending: isSaving } = useCreateBill();
  const { toast } = useToast();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [extraCharges, setExtraCharges] = useState<ExtraChargeRow[]>([]);
  const [pendingProduct, setPendingProduct] = useState<PendingProductSelection | null>(null);
  
  // Custom item state
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "", quantity: "1", unit: "PCS" as UnitOption });

  // Payment dialog state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [billDate, setBillDate] = useState<Date | undefined>(new Date());


  const filteredProducts = useMemo(() => {
    if (!products || !searchTerm) return products || [];
    const lower = searchTerm.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(lower));
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
      setCart(prev => {
        const existing = prev.find((item) =>
          item.productId === product.id &&
          item.unit === defaultUnit &&
          Math.abs(item.price - defaultPrice) < 0.0001
        );
        if (existing) {
          return prev.map(item =>
            item.productId === product.id &&
            item.unit === defaultUnit &&
            Math.abs(item.price - defaultPrice) < 0.0001
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }

        return [...prev, {
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
        }];
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

  const addToCart = () => {
    if (!pendingProduct) return;

    const unitConfig = {
      primaryUnit: pendingProduct.primaryUnit,
      secondaryUnit: pendingProduct.secondaryUnit,
      unitConversion: pendingProduct.unitConversion,
    };
    const nextPrice = Math.max(0, Number(pendingProduct.price || 0));
    const nextBasePrice = normalizeUnitPriceToBase(nextPrice, unitConfig, pendingProduct.unit);

    setCart(prev => {
      const existing = prev.find((item) =>
        item.productId === pendingProduct.productId &&
        item.unit === pendingProduct.unit &&
        Math.abs(item.price - nextPrice) < 0.0001
      );
      if (existing) {
        return prev.map(item => 
          item.productId === pendingProduct.productId &&
          item.unit === pendingProduct.unit &&
          Math.abs(item.price - nextPrice) < 0.0001
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, {
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
      }];
    });
    setPendingProduct(null);
    setSearchTerm("");
  };

  const addCustomItem = () => {
    if (!customItem.name || !customItem.price) return;
    setCart(prev => [...prev, {
      tempId: crypto.randomUUID(),
      name: customItem.name,
      price: Number(customItem.price),
      basePrice: Number(customItem.price),
      costPrice: 0, // Default cost price to 0 for custom items
      baseCostPrice: 0,
      quantity: Number(customItem.quantity),
      unit: customItem.unit,
      primaryUnit: customItem.unit,
      secondaryUnit: null,
      unitConversion: null,
    }]);
    setCustomItem({ name: "", price: "", quantity: "1", unit: "PCS" });
    setIsCustomItemOpen(false);
  };

  const updateQuantity = (tempId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const setQuantity = (tempId: string, quantity: number) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        const newQty = Math.max(1, quantity);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const setSellingPrice = (tempId: string, price: number) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        const nextPrice = Math.max(0, price);
        return {
          ...item,
          price: nextPrice,
          basePrice: normalizeUnitPriceToBase(nextPrice, {
            primaryUnit: item.primaryUnit,
            secondaryUnit: item.secondaryUnit,
            unitConversion: item.unitConversion,
          }, item.unit),
        };
      }
      return item;
    }));
  };

  const setUnit = (tempId: string, unit: UnitOption) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
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
      }
      return item;
    }));
  };

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(i => i.tempId !== tempId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const activeCustomer = customers?.find(c => c.id === selectedCustomer);
  const oldBalance = Math.max(0, Number(activeCustomer?.balance || 0));
  const normalizedExtraCharges = extraCharges
    .map((charge) => ({
      ...charge,
      label: charge.label.trim(),
      amountNumber: Number(charge.amount || 0),
    }))
    .filter((charge) => charge.label && charge.amountNumber >= 0);
  const extraChargesTotal = normalizedExtraCharges.reduce((sum, charge) => sum + charge.amountNumber, 0);
  const billTotal = cartTotal + extraChargesTotal;
  const grandTotal = billTotal + oldBalance;

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

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Empty Cart", description: "Add items before checkout", variant: "destructive" });
      return;
    }
    setPaidAmount(grandTotal.toString());
    setIsPaymentOpen(true);
  };

  const submitBill = () => {
    const payment = Number(paidAmount);
    if (isNaN(payment) || payment < 0) return;
    const appliedPayment = Math.min(payment, grandTotal);

    createBill({
      customerId: selectedCustomer || undefined,
      items: cart.map(i => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        baseQuantity: toBaseQuantity(i.quantity, {
          primaryUnit: i.primaryUnit,
          secondaryUnit: i.secondaryUnit,
          unitConversion: i.unitConversion,
        }, i.unit),
        baseUnit: getBaseUnit({
          primaryUnit: i.primaryUnit,
          secondaryUnit: i.secondaryUnit,
          unitConversion: i.unitConversion,
        }),
        price: i.price,
        costPrice: i.costPrice
      })),
      extraCharges: normalizedExtraCharges.map((charge) => ({
        label: charge.label,
        amount: charge.amountNumber,
      })),
      paidAmount: appliedPayment,
      date: billDate ? toLocalDateTimeString(billDate) : undefined,
    }, {
      onSuccess: () => {
        toast({ title: "Bill Created", description: "Transaction saved successfully" });
        setCart([]);
        setExtraCharges([]);
        setSelectedCustomer(null);
        setBillDate(undefined);
        setIsPaymentOpen(false);
      }
    });
  };

  return (
    <div className="h-[calc(100vh-64px)] md:h-screen flex flex-col md:flex-row overflow-hidden bg-background">
      
      {/* Left: Cart Section */}
      <div className="flex-1 flex flex-col h-full border-r border-border relative z-0">
        <div className="p-4 border-b border-border bg-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-display font-bold text-xl">Current Bill</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Bill # --</span>
            </div>
          </div>
          
          {/* Customer Selector */}
          <div className="flex gap-2">
            <select 
              className="flex-1 h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedCustomer || ""}
              onChange={(e) => setSelectedCustomer(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Walk-in Customer</option>
              {customers?.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
            <Button variant="outline" size="icon" className="shrink-0" title="New Customer">
              <UserPlus className="w-4 h-4" />
            </Button>
          </div>
          {activeCustomer && (
            <div className="mt-2 text-xs text-muted-foreground flex justify-between px-1">
              <span>Balance: <span className={cn(activeCustomer.balance > 0 ? "text-red-500" : "text-green-500")}>{formatCurrencyINR(Number(activeCustomer.balance || 0))}</span></span>
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <ShoppingBag className="w-16 h-16 mb-4" />
              <p>Cart is empty</p>
              <p className="text-sm">Select products to add</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.tempId} className="bg-card p-3 rounded-xl border border-border shadow-sm flex items-center justify-between group animate-in slide-in-from-left-2 duration-300">
                <div className="flex-1">
                  <h4 className="font-medium line-clamp-1">{item.name}</h4>
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
                        onClick={() => updateQuantity(item.tempId, -1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                      >-</button>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setQuantity(item.tempId, Number(e.target.value) || 1)}
                        className="w-12 h-8 text-center text-sm font-medium border-0 focus-visible:ring-0 p-0"
                        onFocus={(e) => e.target.select()}
                      />
                      <button 
                        onClick={() => updateQuantity(item.tempId, 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                      >+</button>
                    </div>
                    <select
                      className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                      value={item.unit}
                      onChange={(e) => setUnit(item.tempId, e.target.value as UnitOption)}
                    >
                      {[item.primaryUnit, ...(item.secondaryUnit ? [item.secondaryUnit] : [])].map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button 
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

        {/* Totals & Actions */}
        <div className="p-4 bg-card border-t border-border shadow-up-lg z-10">
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-end">
              <span className="text-muted-foreground">This Bill Total</span>
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
                  min="0"
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

            <Button type="button" variant="ghost" className="h-9 px-0 text-primary" onClick={addExtraChargeRow}>
              <Plus className="w-4 h-4 mr-2" /> Add Extra Charge
            </Button>

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
                      onChange={e => setCustomItem({...customItem, name: e.target.value})}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input 
                        type="number" 
                        placeholder="Price" 
                        value={customItem.price} 
                        onChange={e => setCustomItem({...customItem, price: e.target.value})}
                      />
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
                    </div>
                    <Input 
                      type="number" 
                      placeholder="Qty" 
                      value={customItem.quantity} 
                      onChange={e => setCustomItem({...customItem, quantity: e.target.value})}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit">Add to Cart</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Button 
              className="h-12 text-base font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
              onClick={handleCheckout}
              disabled={cart.length === 0}
            >
              Pay & Save <Save className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Product Selector (Hidden on Mobile unless searching) */}
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
          {filteredProducts?.length === 0 && (
            <div className="text-center p-8 text-muted-foreground text-sm">
              No products found.
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!pendingProduct} onOpenChange={(open) => !open && setPendingProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addToCart();
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
              <Button type="submit">
                Add to Bill
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitBill();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Finalize Payment
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
                <label className="text-sm font-medium">Amount Received</label>
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
                <div className="flex justify-between text-sm px-1">
                  <span className="text-muted-foreground">Change to return:</span>
                  <span className={cn(
                    "font-bold",
                    Number(paidAmount) - grandTotal >= 0 ? "text-green-600" : "text-red-500"
                  )}>
                    {Number(paidAmount) - grandTotal >= 0 
                      ? formatCurrencyINR(Number(paidAmount) - grandTotal)
                      : `Due: ${formatCurrencyINR(grandTotal - Number(paidAmount))}`
                    }
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bill Date (Optional)</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !billDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {billDate ? format(billDate, "PPP") : <span>Pick a date (defaults to today)</span>}
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
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => {
                setIsPaymentOpen(false);
                setBillDate(undefined);
              }}>Cancel</Button>
              <Button type="submit" disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
                {isSaving ? "Saving..." : "Complete Order"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
