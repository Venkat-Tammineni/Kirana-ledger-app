import { useState } from "react";
import { useProducts, useCreateProduct } from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Products() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useProducts(search);
  const { mutate: createProduct, isPending } = useCreateProduct();
  const [isOpen, setIsOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", price: "", sku: "" });

  const handleCreate = () => {
    createProduct({
      name: newProduct.name,
      price: Number(newProduct.price),
      sku: newProduct.sku || undefined
    }, {
      onSuccess: () => {
        setIsOpen(false);
        setNewProduct({ name: "", price: "", sku: "" });
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Products Inventory</h1>
          <p className="text-muted-foreground mt-1">Manage product list and pricing.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Name</label>
                <Input 
                  placeholder="e.g. Parle-G Biscuit" 
                  value={newProduct.name}
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price (₹)</label>
                  <Input 
                    type="number"
                    placeholder="10.00" 
                    value={newProduct.price}
                    onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SKU (Optional)</label>
                  <Input 
                    placeholder="Barcode" 
                    value={newProduct.sku}
                    onChange={e => setNewProduct({...newProduct, sku: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={isPending || !newProduct.name || !newProduct.price}>
                {isPending ? "Adding..." : "Add Product"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input 
          className="pl-10 h-12 bg-card border-border shadow-sm text-base"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {products?.map((product) => (
            <div key={product.id} className="bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-2">
                <div className="bg-primary/10 p-2 rounded-lg text-primary">
                  <Package className="w-5 h-5" />
                </div>
                <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                  ID: {product.id}
                </span>
              </div>
              <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h3>
              {product.sku && <p className="text-xs text-muted-foreground mt-1">SKU: {product.sku}</p>}
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Price</span>
                <span className="font-bold text-lg font-mono">₹{product.price}</span>
              </div>
            </div>
          ))}
          {products?.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No products found matching "{search}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
