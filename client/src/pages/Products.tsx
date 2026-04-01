import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Package, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ProductFormFields, type ProductDraft } from "@/components/forms/ProductFormFields";
import { productFormSchema } from "@/lib/form-schemas";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyINR } from "@/lib/format";
import {
  deriveUnitPriceFromBase,
  getBaseUnit,
  getDefaultSalesUnit,
  getPrimaryUnit,
  hasSecondaryUnit,
  normalizeUnitPriceToBase,
} from "@shared/units";

const defaultDraft: ProductDraft = {
  name: "",
  price: "",
  priceInputUnit: "PCS",
  costPrice: "",
  costPriceInputUnit: "PCS",
  primaryUnit: "PCS",
  hasSecondaryUnit: false,
  secondaryUnit: "KG",
  unitConversion: "",
  sku: "",
  stock: "",
  lowStockThreshold: "10",
};

export default function Products() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useProducts(search);
  const { mutate: createProduct, isPending } = useCreateProduct();
  const [isOpen, setIsOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<ProductDraft>(defaultDraft);
  const { mutate: updateProduct, isPending: isUpdating } = useUpdateProduct();
  const { mutate: deleteProduct, isPending: isDeleting } = useDeleteProduct();
  const [editingProduct, setEditingProduct] = useState<(ProductDraft & { id: number }) | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { toast } = useToast();

  const normalizeDraft = (draft: ProductDraft) => {
    const unitConfig = {
      primaryUnit: draft.primaryUnit,
      secondaryUnit: draft.hasSecondaryUnit ? draft.secondaryUnit : null,
      unitConversion: draft.hasSecondaryUnit ? Number(draft.unitConversion || 0) : null,
    };

    return {
      name: draft.name,
      price: normalizeUnitPriceToBase(Number(draft.price || 0), unitConfig, draft.priceInputUnit),
      costPrice: normalizeUnitPriceToBase(Number(draft.costPrice || 0), unitConfig, draft.costPriceInputUnit),
      primaryUnit: draft.primaryUnit,
      secondaryUnit: draft.hasSecondaryUnit ? draft.secondaryUnit : null,
      unitConversion: draft.hasSecondaryUnit ? Number(draft.unitConversion || 0) : null,
      sku: draft.sku,
      stock: Number(draft.stock || 0),
      lowStockThreshold: Number(draft.lowStockThreshold || 10),
    };
  };

  const handleCreate = () => {
    const parsed = productFormSchema.safeParse(normalizeDraft(newProduct));
    if (!parsed.success) {
      toast({ title: "Validation error", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }

    createProduct(parsed.data, {
      onSuccess: () => {
        setIsOpen(false);
        setNewProduct(defaultDraft);
      },
    });
  };

  const handleEditSave = () => {
    if (!editingProduct) return;

    const parsed = productFormSchema.safeParse(normalizeDraft(editingProduct));
    if (!parsed.success) {
      toast({ title: "Validation error", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }

    updateProduct(
      {
        id: editingProduct.id,
        ...parsed.data,
      },
      {
        onSuccess: () => {
          setIsEditOpen(false);
          setEditingProduct(null);
        },
      },
    );
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
            >
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <ProductFormFields value={newProduct} onChange={setNewProduct} />
              <DialogFooter>
                <Button type="submit" disabled={isPending || !newProduct.name}>
                  {isPending ? "Adding..." : "Add Product"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) setEditingProduct(null);
          }}
        >
          <DialogContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEditSave();
              }}
            >
              <DialogHeader>
                <DialogTitle>Edit Product</DialogTitle>
              </DialogHeader>
              {editingProduct && (
                <ProductFormFields value={editingProduct} onChange={(next) => setEditingProduct({ ...editingProduct, ...next })} />
              )}
              <DialogFooter>
                <Button type="submit" disabled={isUpdating || !editingProduct?.name}>
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
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {products?.map((product) => (
            <div
              key={product.id}
              className="bg-card p-4 rounded-xl border border-border shadow-sm hover:shadow-md transition-all group"
            >
              {(() => {
                const unitConfig = {
                  primaryUnit: product.primaryUnit,
                  secondaryUnit: product.secondaryUnit,
                  unitConversion: product.unitConversion,
                };
                const primaryUnit = getPrimaryUnit(unitConfig);
                const baseUnit = getBaseUnit(unitConfig);
                const usesTwoUnits = hasSecondaryUnit(unitConfig);
                const basePrice = Number(product.price || 0);
                const baseCostPrice = Number(product.costPrice || 0);
                const primaryPrice = deriveUnitPriceFromBase(basePrice, unitConfig, primaryUnit);
                const primaryCostPrice = deriveUnitPriceFromBase(baseCostPrice, unitConfig, primaryUnit);
                const stock = Number(product.stock || 0);
                const lowStockThreshold = Number(product.lowStockThreshold || 10);

                return (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div className="bg-primary/10 p-2 rounded-lg text-primary">
                        <Package className="w-5 h-5" />
                      </div>
                      <span className="font-mono text-xs bg-muted text-muted-foreground px-2 py-1 rounded">ID: {product.id}</span>
                    </div>
                    <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">{product.name}</h3>
                    {product.sku && <p className="text-xs text-muted-foreground mt-1">SKU: {product.sku}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-1">Primary: {primaryUnit}</span>
                      <span className="rounded-full bg-muted px-2 py-1">Base: {baseUnit}</span>
                      {usesTwoUnits && (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                          1 {primaryUnit} = {product.unitConversion} {baseUnit}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-border space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Selling Price</span>
                        <div className="font-bold text-lg font-mono">
                          {formatCurrencyINR(usesTwoUnits ? primaryPrice : basePrice)} / {usesTwoUnits ? primaryUnit : baseUnit}
                        </div>
                      </div>
                      {usesTwoUnits && (
                        <div className="text-xs text-muted-foreground text-right">
                          Base: {formatCurrencyINR(basePrice)} / {baseUnit}
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Cost Price</span>
                        <div className="font-mono text-sm">
                          {formatCurrencyINR(usesTwoUnits ? primaryCostPrice : baseCostPrice)} / {usesTwoUnits ? primaryUnit : baseUnit}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Stock</span>
                        <div
                          className={cn(
                            "font-mono text-sm font-semibold",
                            stock <= lowStockThreshold ? "text-red-500" : "text-foreground",
                          )}
                        >
                          {stock} {baseUnit}
                          {stock <= lowStockThreshold && (
                            <AlertTriangle className="inline w-3 h-3 ml-1" />
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">Profit/Base Unit</span>
                        <div className="font-mono text-sm font-semibold text-green-600">
                          {formatCurrencyINR(basePrice - baseCostPrice)} / {baseUnit}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="mt-2 flex items-center justify-end gap-2">
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    className="p-2 rounded-full hover:bg-muted text-muted-foreground"
                    onClick={() => {
                      const unitConfig = {
                        primaryUnit: product.primaryUnit,
                        secondaryUnit: product.secondaryUnit,
                        unitConversion: product.unitConversion,
                      };
                      const defaultSalesUnit = getDefaultSalesUnit(unitConfig);
                      setEditingProduct({
                        id: product.id,
                        name: product.name,
                        price: String(deriveUnitPriceFromBase(Number(product.price || 0), unitConfig, defaultSalesUnit)),
                        priceInputUnit: defaultSalesUnit,
                        costPrice: String(deriveUnitPriceFromBase(Number(product.costPrice || 0), unitConfig, defaultSalesUnit)),
                        costPriceInputUnit: defaultSalesUnit,
                        primaryUnit: (product.primaryUnit || "PCS") as ProductDraft["primaryUnit"],
                        hasSecondaryUnit: hasSecondaryUnit(unitConfig),
                        secondaryUnit: (product.secondaryUnit || "KG") as ProductDraft["secondaryUnit"],
                        unitConversion: product.unitConversion ? String(product.unitConversion) : "",
                        sku: product.sku ?? "",
                        stock: String(product.stock ?? 0),
                        lowStockThreshold: String(product.lowStockThreshold ?? 10),
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
                      if (window.confirm("Are you sure you want to delete this product? This cannot be undone.")) {
                        deleteProduct(product.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
