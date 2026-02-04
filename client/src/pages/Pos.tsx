import { useState, useMemo } from "react";
import { useProducts, useCreateBill, useCustomers } from "@/hooks/use-pos";
import { Search, Plus, Trash2, IndianRupee, Save, CreditCard, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CartItem {
  tempId: string;
  productId?: number;
  name: string;
  price: number;
  quantity: number;
}

export default function Pos() {
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const { mutate: createBill, isPending: isSaving } = useCreateBill();
  const { toast } = useToast();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  
  // Custom item state
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "", quantity: "1" });

  // Payment dialog state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");

  const filteredProducts = useMemo(() => {
    if (!products || !searchTerm) return products || [];
    const lower = searchTerm.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(lower));
  }, [products, searchTerm]);

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, {
        tempId: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: 1
      }];
    });
    setSearchTerm(""); // Clear search after adding to focus on next item
  };

  const addCustomItem = () => {
    if (!customItem.name || !customItem.price) return;
    setCart(prev => [...prev, {
      tempId: crypto.randomUUID(),
      name: customItem.name,
      price: Number(customItem.price),
      quantity: Number(customItem.quantity)
    }]);
    setCustomItem({ name: "", price: "", quantity: "1" });
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

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(i => i.tempId !== tempId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Empty Cart", description: "Add items before checkout", variant: "destructive" });
      return;
    }
    setPaidAmount(cartTotal.toString());
    setIsPaymentOpen(true);
  };

  const submitBill = () => {
    const payment = Number(paidAmount);
    if (isNaN(payment) || payment < 0) return;

    createBill({
      customerId: selectedCustomer || undefined,
      items: cart.map(i => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        price: i.price
      })),
      paidAmount: payment,
    }, {
      onSuccess: () => {
        toast({ title: "Bill Created", description: "Transaction saved successfully" });
        setCart([]);
        setSelectedCustomer(null);
        setIsPaymentOpen(false);
      }
    });
  };

  const activeCustomer = customers?.find(c => c.id === selectedCustomer);

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
              <span>Balance: <span className={cn(activeCustomer.balance > 0 ? "text-red-500" : "text-green-500")}>₹{activeCustomer.balance}</span></span>
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
                  <div className="text-sm text-muted-foreground">₹{item.price} x {item.quantity}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-bold font-mono">₹{(item.price * item.quantity).toFixed(2)}</div>
                  <div className="flex items-center border border-border rounded-lg bg-background">
                    <button 
                      onClick={() => updateQuantity(item.tempId, -1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                    >-</button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.tempId, 1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                    >+</button>
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
          <div className="flex justify-between items-end mb-4">
            <span className="text-muted-foreground">Total Amount</span>
            <span className="text-3xl font-display font-bold text-primary">₹{cartTotal.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <Dialog open={isCustomItemOpen} onOpenChange={setIsCustomItemOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 text-base">
                  <Plus className="w-4 h-4 mr-2" /> Custom Item
                </Button>
              </DialogTrigger>
              <DialogContent>
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
                    <Input 
                      type="number" 
                      placeholder="Qty" 
                      value={customItem.quantity} 
                      onChange={e => setCustomItem({...customItem, quantity: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={addCustomItem}>Add to Cart</Button>
                </DialogFooter>
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
                onClick={() => addToCart(product)}
                className="flex flex-col items-start p-3 bg-card border border-border/50 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 rounded-xl text-left group"
              >
                <div className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">{product.name}</div>
                <div className="mt-auto font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                  ₹{product.price}
                </div>
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

      {/* Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Finalize Payment
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="bg-muted p-4 rounded-xl text-center">
              <span className="text-sm text-muted-foreground">Total Bill Amount</span>
              <div className="text-4xl font-display font-bold text-foreground mt-1">₹{cartTotal.toFixed(2)}</div>
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
                  Number(paidAmount) - cartTotal >= 0 ? "text-green-600" : "text-red-500"
                )}>
                  {Number(paidAmount) - cartTotal >= 0 
                    ? `₹${(Number(paidAmount) - cartTotal).toFixed(2)}` 
                    : `Due: ₹${(cartTotal - Number(paidAmount)).toFixed(2)}`
                  }
                </span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancel</Button>
            <Button onClick={submitBill} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto">
              {isSaving ? "Saving..." : "Complete Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Additional import needed for empty state
import { ShoppingBag } from "lucide-react";
