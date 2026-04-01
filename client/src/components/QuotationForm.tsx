
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CalendarIcon, Plus, Save, Search, ShoppingBag, Trash2 } from "lucide-react";
import { useCustomers, useProducts } from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDateTime } from "@/lib/format";
import { format } from "date-fns";
import { deriveUnitPriceFromBase, getBaseUnit, getDefaultSalesUnit, getPrimaryUnit, hasSecondaryUnit, normalizeUnitPriceToBase, toBaseQuantity, UNIT_OPTIONS, type UnitOption } from "@shared/units";
import type { CreateQuotationInput } from "@shared/routes";
import type { Bill, Customer, Quotation, QuotationCharge, QuotationItem } from "@shared/schema";

type QuoteDetails = Quotation & { items: QuotationItem[]; charges: QuotationCharge[]; customer: Customer | null; convertedBill: Bill | null };
type CartItem = { tempId: string; productId?: number; name: string; price: number; basePrice: number; costPrice: number; baseCostPrice: number; quantity: number; unit: UnitOption; primaryUnit: UnitOption; secondaryUnit?: UnitOption | null; unitConversion?: number | null };
type ChargeRow = { id: string; label: string; amount: string };
type PendingProduct = { productId: number; name: string; price: string; baseCostPrice: number; unit: UnitOption; primaryUnit: UnitOption; secondaryUnit?: UnitOption | null; unitConversion?: number | null };

type Props = {
  mode: "create" | "edit";
  quotation?: QuoteDetails | null;
  loading?: boolean;
  saving?: boolean;
  onSubmit: (data: CreateQuotationInput) => void;
};

function inferUnits(item: { unit?: string | null; baseUnit?: string | null; quantity?: number | null; baseQuantity?: number | null; }, products?: Array<{ id: number; primaryUnit?: string | null; secondaryUnit?: string | null; unitConversion?: number | null }>, productId?: number | null) {
  const matched = productId ? products?.find((p) => p.id === productId) : undefined;
  if (matched) {
    return {
      primaryUnit: getPrimaryUnit(matched),
      secondaryUnit: hasSecondaryUnit(matched) ? (matched.secondaryUnit as UnitOption) : null,
      unitConversion: matched.unitConversion ?? null,
    };
  }
  const selectedUnit = (item.unit || item.baseUnit || "PCS") as UnitOption;
  const baseUnit = (item.baseUnit || item.unit || "PCS") as UnitOption;
  const ratio = selectedUnit !== baseUnit && Number(item.quantity || 0) > 0 && Number(item.baseQuantity || 0) > Number(item.quantity || 0)
    ? Math.round(Number(item.baseQuantity || 0) / Number(item.quantity || 1))
    : null;
  return {
    primaryUnit: selectedUnit,
    secondaryUnit: selectedUnit !== baseUnit && ratio && ratio > 1 ? baseUnit : null,
    unitConversion: selectedUnit !== baseUnit && ratio && ratio > 1 ? ratio : null,
  };
}

export default function QuotationForm({ mode, quotation, loading = false, saving = false, onSubmit }: Props) {
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: customers, isLoading: customersLoading } = useCustomers();
  const { toast } = useToast();
  const [initialized, setInitialized] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [extraCharges, setExtraCharges] = useState<ChargeRow[]>([]);
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null);
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "", quantity: "1", unit: "PCS" as UnitOption });
  const [quoteDate, setQuoteDate] = useState<Date | undefined>(new Date());
  const [notes, setNotes] = useState("");
  const [editedBy, setEditedBy] = useState("");

  useEffect(() => {
    if (loading || productsLoading || customersLoading || initialized) return;
    if (mode === "edit") {
      if (!quotation) {
        setInitialized(true);
        return;
      }
      setCart(quotation.items.map((item) => {
        const unitConfig = inferUnits(item, products, item.productId);
        const unit = (item.unit || item.baseUnit || "PCS") as UnitOption;
        return {
          tempId: crypto.randomUUID(),
          productId: item.productId ?? undefined,
          name: item.name,
          price: Number(item.price || 0),
          basePrice: normalizeUnitPriceToBase(Number(item.price || 0), unitConfig, unit),
          costPrice: Number(item.costPrice || 0),
          baseCostPrice: normalizeUnitPriceToBase(Number(item.costPrice || 0), unitConfig, unit),
          quantity: Number(item.quantity || 1),
          unit,
          primaryUnit: unitConfig.primaryUnit,
          secondaryUnit: unitConfig.secondaryUnit,
          unitConversion: unitConfig.unitConversion,
        };
      }));
      setExtraCharges((quotation.charges || []).map((charge) => ({ id: crypto.randomUUID(), label: charge.label, amount: String(Number(charge.amount || 0)) })));
      setSelectedCustomer(quotation.customerId ?? null);
      setQuoteDate(quotation.date ? new Date(quotation.date) : new Date());
      setNotes(quotation.notes || "");
      setEditedBy(quotation.lastEditedBy || "");
      setInitialized(true);
      return;
    }
    setInitialized(true);
  }, [mode, quotation, loading, productsLoading, customersLoading, initialized, products]);

  const filteredProducts = useMemo(() => !products || !searchTerm ? products || [] : products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase())), [products, searchTerm]);
  const isConverted = quotation?.status === "converted";
  const summaryCharges = extraCharges.map((charge) => ({ ...charge, label: charge.label.trim(), amountNumber: Number(charge.amount || 0) })).filter((charge) => charge.label && charge.amountNumber >= 0);
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const total = subtotal + summaryCharges.reduce((sum, charge) => sum + charge.amountNumber, 0);

  const updateItem = (tempId: string, patch: Partial<CartItem>) => setCart((prev) => prev.map((item) => item.tempId === tempId ? { ...item, ...patch } : item));
  const removeItem = (tempId: string) => setCart((prev) => prev.filter((item) => item.tempId !== tempId));
  const openProductDialog = (product: any) => {
    const unitConfig = { primaryUnit: product.primaryUnit, secondaryUnit: product.secondaryUnit, unitConversion: product.unitConversion };
    const unit = getDefaultSalesUnit(unitConfig);
    setPendingProduct({
      productId: product.id,
      name: product.name,
      price: deriveUnitPriceFromBase(Number(product.price || 0), unitConfig, unit).toString(),
      baseCostPrice: Number(product.costPrice || 0),
      unit,
      primaryUnit: getPrimaryUnit(unitConfig),
      secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
      unitConversion: product.unitConversion ?? null,
    });
  };

  const addPendingProduct = () => {
    if (!pendingProduct) return;
    const unitConfig = { primaryUnit: pendingProduct.primaryUnit, secondaryUnit: pendingProduct.secondaryUnit, unitConversion: pendingProduct.unitConversion };
    const price = Math.max(0, Number(pendingProduct.price || 0));
    const existing = cart.find((item) => item.productId === pendingProduct.productId && item.unit === pendingProduct.unit && Math.abs(item.price - price) < 0.0001);
    if (existing) {
      updateItem(existing.tempId, { quantity: existing.quantity + 1 });
    } else {
      setCart((prev) => [...prev, {
        tempId: crypto.randomUUID(),
        productId: pendingProduct.productId,
        name: pendingProduct.name,
        price,
        basePrice: normalizeUnitPriceToBase(price, unitConfig, pendingProduct.unit),
        costPrice: deriveUnitPriceFromBase(pendingProduct.baseCostPrice, unitConfig, pendingProduct.unit),
        baseCostPrice: pendingProduct.baseCostPrice,
        quantity: 1,
        unit: pendingProduct.unit,
        primaryUnit: pendingProduct.primaryUnit,
        secondaryUnit: pendingProduct.secondaryUnit ?? null,
        unitConversion: pendingProduct.unitConversion ?? null,
      }]);
    }
    setPendingProduct(null);
    setSearchTerm("");
  };

  const addCustomItem = () => {
    if (!customItem.name.trim() || !customItem.price) return;
    setCart((prev) => [...prev, {
      tempId: crypto.randomUUID(),
      name: customItem.name.trim(),
      price: Number(customItem.price),
      basePrice: Number(customItem.price),
      costPrice: 0,
      baseCostPrice: 0,
      quantity: Number(customItem.quantity || 1),
      unit: customItem.unit,
      primaryUnit: customItem.unit,
      secondaryUnit: null,
      unitConversion: null,
    }]);
    setCustomItem({ name: "", price: "", quantity: "1", unit: "PCS" });
    setIsCustomItemOpen(false);
  };

  const submit = () => {
    if (cart.length === 0) {
      toast({ title: "Quotation is empty", description: "Add at least one item before saving.", variant: "destructive" });
      return;
    }
    if (cart.some((item) => !item.name.trim())) {
      toast({ title: "Missing item name", description: "Custom items need a name.", variant: "destructive" });
      return;
    }
    onSubmit({
      customerId: selectedCustomer || undefined,
      items: cart.map((item) => ({
        productId: item.productId,
        name: item.name.trim(),
        quantity: item.quantity,
        unit: item.unit,
        baseQuantity: toBaseQuantity(item.quantity, { primaryUnit: item.primaryUnit, secondaryUnit: item.secondaryUnit, unitConversion: item.unitConversion }, item.unit),
        baseUnit: getBaseUnit({ primaryUnit: item.primaryUnit, secondaryUnit: item.secondaryUnit, unitConversion: item.unitConversion }),
        price: item.price,
        costPrice: item.costPrice,
      })),
      extraCharges: summaryCharges.map((charge) => ({ label: charge.label, amount: charge.amountNumber })),
      notes: notes.trim() || undefined,
      editedBy: editedBy.trim() || undefined,
      date: quoteDate ? quoteDate.toISOString() : undefined,
    });
  };

  if (loading || productsLoading || customersLoading || !initialized) {
    return <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6"><Skeleton className="h-8 w-56" /><Skeleton className="h-[620px] w-full rounded-2xl" /></div>;
  }

  if (mode === "edit" && !quotation) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Quotation not found</div>;
  }

  return (
    <div className="h-[calc(100vh-64px)] md:h-screen flex flex-col md:flex-row overflow-hidden bg-background">
      <div className="flex-1 flex flex-col h-full border-r border-border">
        <div className="p-4 border-b border-border bg-card space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href={mode === "create" ? "/quotations" : `/quotations/${quotation?.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" />{mode === "create" ? "Back to Quotations" : "Back to Quotation Details"}</Link>
              <h2 className="font-display font-bold text-xl mt-2">{mode === "create" ? "Create Quotation" : `Edit Quotation #${quotation?.id}`}</h2>
            </div>
            {quotation && <div className="text-right text-sm text-muted-foreground"><div>Status: <span className="font-medium text-foreground capitalize">{quotation.status}</span></div>{quotation.lastEditedAt && <div className="mt-1">Last edited on {formatDateTime(quotation.lastEditedAt, "dd MMM yyyy, hh:mm a")}{quotation.lastEditedBy ? ` by ${quotation.lastEditedBy}` : ""}</div>}</div>}
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <select className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm" value={selectedCustomer || ""} onChange={(e) => setSelectedCustomer(e.target.value ? Number(e.target.value) : null)} disabled={isConverted}>
              <option value="">Walk-in Customer</option>
              {customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} ({customer.phone})</option>)}
            </select>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !quoteDate && "text-muted-foreground")} disabled={isConverted}><CalendarIcon className="mr-2 h-4 w-4" />{quoteDate ? format(quoteDate, "PPP") : <span>Pick quotation date</span>}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={quoteDate} onSelect={setQuoteDate} initialFocus /></PopoverContent>
            </Popover>
          </div>
          <Textarea placeholder="Notes for quotation (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={isConverted} />
          <Input placeholder="Prepared by / Edited by (optional)" value={editedBy} onChange={(e) => setEditedBy(e.target.value)} maxLength={80} disabled={isConverted} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50"><ShoppingBag className="w-16 h-16 mb-4" /><p>No items in this quotation</p><p className="text-sm">Add products to continue</p></div> : cart.map((item) => (
            <div key={item.tempId} className="bg-card p-3 rounded-xl border border-border shadow-sm flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                {item.productId ? <h4 className="font-medium line-clamp-1">{item.name}</h4> : <Input value={item.name} onChange={(e) => updateItem(item.tempId, { name: e.target.value })} className="h-9" placeholder="Custom item name" disabled={isConverted} />}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Selling Price</span>
                  <Input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(item.tempId, { price: Math.max(0, Number(e.target.value) || 0), basePrice: normalizeUnitPriceToBase(Math.max(0, Number(e.target.value) || 0), { primaryUnit: item.primaryUnit, secondaryUnit: item.secondaryUnit, unitConversion: item.unitConversion }, item.unit) })} className="h-8 w-28 font-mono" onFocus={(e) => e.target.select()} disabled={isConverted} />
                  <span>/ {item.unit}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-bold font-mono">{formatCurrencyINR(item.price * item.quantity)}</div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-border rounded-lg bg-background">
                    <button type="button" onClick={() => updateItem(item.tempId, { quantity: Math.max(1, item.quantity - 1) })} className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium" disabled={isConverted}>-</button>
                    <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(item.tempId, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="w-12 h-8 text-center text-sm font-medium border-0 focus-visible:ring-0 p-0" onFocus={(e) => e.target.select()} disabled={isConverted} />
                    <button type="button" onClick={() => updateItem(item.tempId, { quantity: item.quantity + 1 })} className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium" disabled={isConverted}>+</button>
                  </div>
                  <select className="h-8 rounded-lg border border-input bg-background px-2 text-sm" value={item.unit} onChange={(e) => updateItem(item.tempId, { unit: e.target.value as UnitOption, price: deriveUnitPriceFromBase(item.basePrice, { primaryUnit: item.primaryUnit, secondaryUnit: item.secondaryUnit, unitConversion: item.unitConversion }, e.target.value), costPrice: deriveUnitPriceFromBase(item.baseCostPrice, { primaryUnit: item.primaryUnit, secondaryUnit: item.secondaryUnit, unitConversion: item.unitConversion }, e.target.value) })} disabled={isConverted}>
                      {Array.from(new Set([item.primaryUnit, ...(item.secondaryUnit ? [item.secondaryUnit] : [])])).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => removeItem(item.tempId)} className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" disabled={isConverted}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-card border-t border-border shadow-up-lg">
          <div className="space-y-3 mb-4">
            <div className="flex justify-between items-end"><span className="text-muted-foreground">Quotation Total</span><span className="text-3xl font-display font-bold text-primary">{formatCurrencyINR(subtotal)}</span></div>
            {extraCharges.map((charge) => (
              <div key={charge.id} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Input placeholder="Charge name" value={charge.label} onChange={(e) => setExtraCharges((prev) => prev.map((row) => row.id === charge.id ? { ...row, label: e.target.value } : row))} className="h-9" disabled={isConverted} />
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={charge.amount} onChange={(e) => setExtraCharges((prev) => prev.map((row) => row.id === charge.id ? { ...row, amount: e.target.value } : row))} className="h-9 font-mono" onFocus={(e) => e.target.select()} disabled={isConverted} />
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setExtraCharges((prev) => prev.filter((row) => row.id !== charge.id))} disabled={isConverted}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="ghost" className="h-9 px-0 text-primary" onClick={() => setExtraCharges((prev) => [...prev, { id: crypto.randomUUID(), label: "", amount: "" }])} disabled={isConverted}><Plus className="w-4 h-4 mr-2" /> Add Extra Charge</Button>
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="font-semibold font-mono">{formatCurrencyINR(subtotal)}</span></div>
              {summaryCharges.map((charge) => <div key={charge.id} className="flex justify-between"><span className="text-muted-foreground">{charge.label}</span><span className="font-semibold font-mono">{formatCurrencyINR(charge.amountNumber)}</span></div>)}
              <div className="flex justify-between border-t border-border pt-2"><span className="font-medium">Total</span><span className="font-bold font-mono text-base">{formatCurrencyINR(total)}</span></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Dialog open={isCustomItemOpen} onOpenChange={setIsCustomItemOpen}>
              <DialogTrigger asChild><Button variant="outline" className="h-12 text-base" disabled={isConverted}><Plus className="w-4 h-4 mr-2" /> Custom Item</Button></DialogTrigger>
              <DialogContent>
                <form onSubmit={(e) => { e.preventDefault(); addCustomItem(); }}>
                  <DialogHeader><DialogTitle>Add Custom Item</DialogTitle></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <Input placeholder="Item Name" value={customItem.name} onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-4">
                      <Input type="number" placeholder="Price" value={customItem.price} onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })} />
                      <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={customItem.unit} onChange={(e) => setCustomItem({ ...customItem, unit: e.target.value as UnitOption })}>{UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
                    </div>
                    <Input type="number" placeholder="Qty" value={customItem.quantity} onChange={(e) => setCustomItem({ ...customItem, quantity: e.target.value })} />
                  </div>
                  <DialogFooter><Button type="submit">Add to Quotation</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Button className="h-12 text-base font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25" onClick={submit} disabled={cart.length === 0 || saving || isConverted}>{saving ? "Saving..." : mode === "create" ? "Save Quotation" : "Save Changes"} <Save className="w-4 h-4 ml-2" /></Button>
          </div>
        </div>
      </div>

      <div className="hidden md:flex flex-col w-[400px] bg-muted/30 h-full">
        <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input placeholder="Search products..." className="pl-10 h-10 bg-muted/50 border-transparent focus:bg-background focus:border-primary transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus disabled={isConverted} /></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts?.map((product) => {
              const unitConfig = { primaryUnit: product.primaryUnit, secondaryUnit: product.secondaryUnit, unitConversion: product.unitConversion };
              const unit = getDefaultSalesUnit(unitConfig);
              return <button key={product.id} type="button" onClick={() => openProductDialog(product)} className="flex flex-col items-start p-3 bg-card border border-border/50 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 rounded-xl text-left group disabled:pointer-events-none disabled:opacity-50" disabled={isConverted}><div className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">{product.name}</div><div className="mt-auto font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">{formatCurrencyINR(deriveUnitPriceFromBase(Number(product.price || 0), unitConfig, unit))} / {unit}</div></button>;
            })}
          </div>
        </div>
      </div>

      <Dialog open={!!pendingProduct} onOpenChange={(open) => !open && setPendingProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => { e.preventDefault(); addPendingProduct(); }}>
            <DialogHeader><DialogTitle>Confirm Selling Price</DialogTitle></DialogHeader>
            {pendingProduct && <div className="grid gap-4 py-4"><div className="rounded-xl border border-border bg-muted/30 p-4"><div className="text-sm font-medium">{pendingProduct.name}</div><div className="mt-1 text-xs text-muted-foreground">This price change applies only to this quotation.</div></div><div className="space-y-2"><label className="text-sm font-medium">Selling Price / {pendingProduct.unit}</label><Input type="number" min="0" step="0.01" value={pendingProduct.price} onChange={(e) => setPendingProduct((current) => current ? { ...current, price: e.target.value } : current)} onFocus={(e) => e.target.select()} className="h-12 text-lg font-mono" autoFocus /></div></div>}
            <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => setPendingProduct(null)}>Cancel</Button><Button type="submit">Add to Quotation</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
