import { useMemo, useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Package, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { cn } from "@/lib/utils";
import { ProductFormFields, type ProductDraft } from "@/components/forms/ProductFormFields";
import { productFormSchema } from "@/lib/form-schemas";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyINR } from "@/lib/format";
import {
  deriveUnitPriceFromBase,
  fromBaseQuantity,
  getBaseUnit,
  getDefaultSalesUnit,
  getPrimaryUnit,
  hasSecondaryUnit,
  normalizeUnitPriceToBase,
  toBaseQuantity,
} from "@shared/units";
import { parseCreateProductVoiceCommand } from "@/lib/voice-commands";

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
  stockInputUnit: "PCS",
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

  const productVoiceCommands = useMemo(
    () => [
      {
        label: "Search products",
        examples: ["search coco", "find besan"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^(search|find)\s+(.+)$/);
          if (!match) return null;
          setSearch(match[2].trim());
          return `Searching for ${match[2].trim()}.`;
        },
      },
      {
        label: "Create product",
        examples: ["add product coco selling price 23 cost price 21 pieces"],
        run: ({ raw }: { raw: string; normalized: string }) => {
          const parsed = parseCreateProductVoiceCommand(raw);
          if (!parsed) return null;

          createProduct(
            {
              name: parsed.name,
              price: parsed.sellingPrice,
              costPrice: parsed.costPrice,
              primaryUnit: parsed.unit,
              secondaryUnit: null,
              unitConversion: null,
              stock: 0,
              lowStockThreshold: 10,
            },
            {
              onSuccess: () => {
                toast({ title: "Product added", description: `${parsed.name} was created.` });
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

          return `Creating product ${parsed.name}.`;
        },
      },
    ],
    [createProduct, toast],
  );

  const normalizeDraft = (draft: ProductDraft) => {
    const unitConfig = {
      primaryUnit: draft.primaryUnit,
      secondaryUnit: draft.hasSecondaryUnit ? draft.secondaryUnit : null,
      unitConversion: draft.hasSecondaryUnit ? Number(draft.unitConversion || 0) : null,
    };

    return {
      name: draft.name.trim(),
      price: normalizeUnitPriceToBase(Number(draft.price || 0), unitConfig, draft.priceInputUnit),
      costPrice: normalizeUnitPriceToBase(Number(draft.costPrice || 0), unitConfig, draft.costPriceInputUnit),
      primaryUnit: draft.primaryUnit,
      secondaryUnit: draft.hasSecondaryUnit ? draft.secondaryUnit : null,
      unitConversion: draft.hasSecondaryUnit ? Number(draft.unitConversion || 0) : null,
      sku: draft.sku.trim(),
      stock: toBaseQuantity(Number(draft.stock || 0), unitConfig, draft.stockInputUnit),
      lowStockThreshold: toBaseQuantity(Number(draft.lowStockThreshold || 10), unitConfig, draft.stockInputUnit),
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
        toast({ title: "Product added", description: "The new product has been saved." });
        setIsOpen(false);
        setNewProduct(defaultDraft);
      },
      onError: (error) => {
        toast({
          title: "Could not add product",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
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
          toast({ title: "Product updated", description: "Selling and cost price changes were saved." });
          setIsEditOpen(false);
          setEditingProduct(null);
        },
        onError: (error) => {
          toast({
            title: "Could not update product",
            description: error instanceof Error ? error.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
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
          <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl">
            <form
              className="flex max-h-[92vh] flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
            >
              <DialogHeader className="border-b border-border px-4 py-3">
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-4">
                <ProductFormFields value={newProduct} onChange={setNewProduct} />
              </div>
              <DialogFooter className="border-t border-border px-4 py-3">
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
          <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl">
            <form
              className="flex max-h-[92vh] flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                handleEditSave();
              }}
            >
              <DialogHeader className="border-b border-border px-4 py-3">
                <DialogTitle>Edit Product</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-4">
                {editingProduct && (
                  <ProductFormFields value={editingProduct} onChange={(next) => setEditingProduct({ ...editingProduct, ...next })} />
                )}
              </div>
              <DialogFooter className="border-t border-border px-4 py-3">
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
                const displayStock = usesTwoUnits
                  ? fromBaseQuantity(stock, unitConfig, primaryUnit)
                  : stock;
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
                          {displayStock} {usesTwoUnits ? primaryUnit : baseUnit}
                          {stock <= lowStockThreshold && (
                            <AlertTriangle className="inline w-3 h-3 ml-1" />
                          )}
                        </div>
                      </div>
                      {usesTwoUnits && (
                        <div className="text-xs text-muted-foreground text-right">
                          Stored as: {stock} {baseUnit}
                        </div>
                      )}
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
                        stock: String(fromBaseQuantity(Number(product.stock ?? 0), unitConfig, defaultSalesUnit)),
                        stockInputUnit: defaultSalesUnit,
                        lowStockThreshold: String(fromBaseQuantity(Number(product.lowStockThreshold ?? 10), unitConfig, defaultSalesUnit)),
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
                        deleteProduct(product.id, {
                          onSuccess: () => {
                            toast({ title: "Product deleted", description: "The product was removed from the active list." });
                          },
                          onError: (error) => {
                            toast({
                              title: "Could not delete product",
                              description: error instanceof Error ? error.message : "Please try again.",
                              variant: "destructive",
                            });
                          },
                        });
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

      <VoiceAssistant
        title="Products Voice Helper"
        subtitle="Search products or create a new one by voice."
        commands={productVoiceCommands}
      />
    </>
  );
}
