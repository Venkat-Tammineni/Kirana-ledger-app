import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useProducts, useDeleteProduct } from "@/hooks/use-pos";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Warehouse, TrendingUp, TrendingDown, AlertTriangle, Package, ChevronRight, Search, Trash2, Plus, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getBaseUnit, getPrimaryUnit, hasSecondaryUnit } from "@shared/units";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type InventoryView = string;

const WEIGHT_UNITS = new Set(["KG", "GRAMS"]);
const HIDDEN_INVENTORY_ANALYTICS_KEY = "inventory-hidden-analytics-items";
const IMPORTANT_INVENTORY_PRODUCTS_KEY = "inventory-most-imp-products";
const SPICIES_INVENTORY_PRODUCTS_KEY = "inventory-spicies-products";
const SIRIDHANIYA_INVENTORY_PRODUCTS_KEY = "inventory-siridhaniya-products";
const BAGHYALAKSHMI_INVENTORY_PRODUCTS_KEY = "inventory-baghyalakshmi-products";
const CUSTOM_INVENTORY_SECTIONS_KEY = "inventory-custom-sections";
const INVENTORY_SECTION_TITLE_OVERRIDES_KEY = "inventory-section-title-overrides";

type ProductAnalyticsItem = {
  productId: number | null;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
};

type SavedSection = {
  view: InventoryView;
  title: string;
  key: string;
  activeClasses: string;
  inactiveClasses: string;
  badgeClasses: string;
  removeClasses: string;
  custom?: boolean;
};

type InventoryHistoryState = {
  inventoryView?: InventoryView;
  inventoryScroll?: number;
  inventorySearch?: string;
  targetProductId?: number | null;
};

function isInventoryView(value: string | undefined): value is InventoryView {
  return Boolean(value);
}

const DEFAULT_SAVED_SECTIONS: SavedSection[] = [
  {
    view: "mostImp",
    title: "Most Imp",
    key: IMPORTANT_INVENTORY_PRODUCTS_KEY,
    activeClasses: "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10",
    inactiveClasses: "border-border bg-card hover:border-amber-500/40 hover:bg-muted/30",
    badgeClasses: "bg-amber-500/10 text-amber-700",
    removeClasses: "border-amber-200 text-amber-700 hover:bg-amber-50",
  },
  {
    view: "spicies",
    title: "Spicies",
    key: SPICIES_INVENTORY_PRODUCTS_KEY,
    activeClasses: "border-rose-500 bg-rose-500/10 shadow-lg shadow-rose-500/10",
    inactiveClasses: "border-border bg-card hover:border-rose-500/40 hover:bg-muted/30",
    badgeClasses: "bg-rose-500/10 text-rose-700",
    removeClasses: "border-rose-200 text-rose-700 hover:bg-rose-50",
  },
  {
    view: "siridhaniya",
    title: "Siridhaniya",
    key: SIRIDHANIYA_INVENTORY_PRODUCTS_KEY,
    activeClasses: "border-lime-500 bg-lime-500/10 shadow-lg shadow-lime-500/10",
    inactiveClasses: "border-border bg-card hover:border-lime-500/40 hover:bg-muted/30",
    badgeClasses: "bg-lime-500/10 text-lime-700",
    removeClasses: "border-lime-200 text-lime-700 hover:bg-lime-50",
  },
  {
    view: "baghyalakshmi",
    title: "Baghyalakshmi",
    key: BAGHYALAKSHMI_INVENTORY_PRODUCTS_KEY,
    activeClasses: "border-sky-500 bg-sky-500/10 shadow-lg shadow-sky-500/10",
    inactiveClasses: "border-border bg-card hover:border-sky-500/40 hover:bg-muted/30",
    badgeClasses: "bg-sky-500/10 text-sky-700",
    removeClasses: "border-sky-200 text-sky-700 hover:bg-sky-50",
  },
];

const CUSTOM_SECTION_STYLES = [
  {
    activeClasses: "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10",
    inactiveClasses: "border-border bg-card hover:border-violet-500/40 hover:bg-muted/30",
    badgeClasses: "bg-violet-500/10 text-violet-700",
    removeClasses: "border-violet-200 text-violet-700 hover:bg-violet-50",
  },
  {
    activeClasses: "border-teal-500 bg-teal-500/10 shadow-lg shadow-teal-500/10",
    inactiveClasses: "border-border bg-card hover:border-teal-500/40 hover:bg-muted/30",
    badgeClasses: "bg-teal-500/10 text-teal-700",
    removeClasses: "border-teal-200 text-teal-700 hover:bg-teal-50",
  },
  {
    activeClasses: "border-fuchsia-500 bg-fuchsia-500/10 shadow-lg shadow-fuchsia-500/10",
    inactiveClasses: "border-border bg-card hover:border-fuchsia-500/40 hover:bg-muted/30",
    badgeClasses: "bg-fuchsia-500/10 text-fuchsia-700",
    removeClasses: "border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50",
  },
];

function createCustomSection(title: string, index: number, view = `custom-${Date.now()}`): SavedSection {
  const style = CUSTOM_SECTION_STYLES[index % CUSTOM_SECTION_STYLES.length];
  return {
    view,
    title,
    key: `inventory-${view}-products`,
    ...style,
    custom: true,
  };
}

function formatQuantity(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function getQuantityInKg(
  quantity: number,
  unitConfig: { primaryUnit?: string | null; secondaryUnit?: string | null; unitConversion?: number | string | null },
) {
  const baseUnit = getBaseUnit(unitConfig);
  const primaryUnit = getPrimaryUnit(unitConfig);

  if (baseUnit === "GRAMS") return quantity / 1000;
  if (baseUnit === "KG") return quantity;
  if (!hasSecondaryUnit(unitConfig) && primaryUnit === "GRAMS") return quantity / 1000;
  if (!hasSecondaryUnit(unitConfig) && primaryUnit === "KG") return quantity;

  return null;
}

function formatInventoryQuantity(
  quantity: number,
  unitConfig: { primaryUnit?: string | null; secondaryUnit?: string | null; unitConversion?: number | string | null },
) {
  const qtyInKg = getQuantityInKg(quantity, unitConfig);
  if (qtyInKg !== null) {
    return `${formatQuantity(qtyInKg)} KG`;
  }

  return `${formatQuantity(quantity)} ${getBaseUnit(unitConfig)}`;
}

function formatAnalyticsQuantity(
  quantity: number,
  unitConfig?: { primaryUnit?: string | null; secondaryUnit?: string | null; unitConversion?: number | string | null },
) {
  if (!unitConfig || (!unitConfig.primaryUnit && !unitConfig.secondaryUnit)) {
    return `${formatQuantity(quantity / 1000)} KG`;
  }

  return formatInventoryQuantity(quantity, unitConfig);
}

function formatDisplayPrice(
  price: number,
  unitConfig: { primaryUnit?: string | null; secondaryUnit?: string | null; unitConversion?: number | string | null },
) {
  const baseUnit = getBaseUnit(unitConfig);
  if (WEIGHT_UNITS.has(baseUnit)) {
    const perKgPrice = baseUnit === "GRAMS" ? price * 1000 : price;
    return `${formatCurrencyINR(perKgPrice)} / KG`;
  }

  return `${formatCurrencyINR(price)} / ${baseUnit}`;
}

export default function Inventory() {
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialHistoryState =
    typeof window !== "undefined" ? ((window.history.state as InventoryHistoryState | null) ?? {}) : {};
  const [, setLocation] = useLocation();
  const [activeView, setActiveView] = useState<InventoryView>(
    isInventoryView(searchParams?.get("view") ?? undefined)
      ? (searchParams?.get("view") as InventoryView)
      : isInventoryView(initialHistoryState.inventoryView)
        ? initialHistoryState.inventoryView
        : "products",
  );
  const [productSearchTerm, setProductSearchTerm] = useState(
    searchParams?.get("inventorySearch") ?? initialHistoryState.inventorySearch ?? "",
  );
  const [hiddenAnalyticsItems, setHiddenAnalyticsItems] = useState<string[]>([]);
  const [savedSectionProducts, setSavedSectionProducts] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(DEFAULT_SAVED_SECTIONS.map((section) => [section.view, [] as number[]])),
  );
  const [customSections, setCustomSections] = useState<SavedSection[]>([]);
  const [sectionTitleOverrides, setSectionTitleOverrides] = useState<Record<string, string>>({});
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [editingSectionView, setEditingSectionView] = useState<string | null>(null);
  const [sectionTitleInput, setSectionTitleInput] = useState("");
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);
  const { data: products, isLoading: productsLoading } = useProducts();
  const { mutate: deleteProduct, isPending: deletingProduct } = useDeleteProduct();
  const { toast } = useToast();
  const productRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pendingRestoreScrollRef = useRef<number | null>(null);
  const pendingProductJumpRef = useRef<number | null>(null);
  const savedSections = useMemo(
    () =>
      [...DEFAULT_SAVED_SECTIONS, ...customSections].map((section) => ({
        ...section,
        title: sectionTitleOverrides[section.view] || section.title,
      })),
    [customSections, sectionTitleOverrides],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedItems = window.localStorage.getItem(HIDDEN_INVENTORY_ANALYTICS_KEY);
      if (!storedItems) return;
      const parsedItems = JSON.parse(storedItems);
      if (Array.isArray(parsedItems)) {
        setHiddenAnalyticsItems(parsedItems.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      // Ignore malformed data and continue with an empty hidden list.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const returnScroll = Number(params.get("returnScroll"));
    if (!Number.isFinite(returnScroll) || returnScroll < 0) return;

    pendingRestoreScrollRef.current = returnScroll;

    params.delete("returnScroll");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let loadedCustomSections: SavedSection[] = [];
    try {
      const storedSections = window.localStorage.getItem(CUSTOM_INVENTORY_SECTIONS_KEY);
      const parsedSections = storedSections ? JSON.parse(storedSections) : [];
      if (Array.isArray(parsedSections)) {
        loadedCustomSections = parsedSections
          .filter((section): section is { view: string; title: string } =>
            typeof section?.view === "string" && typeof section?.title === "string" && section.title.trim().length > 0,
          )
          .map((section, index) => createCustomSection(section.title.trim(), index, section.view));
      }
    } catch {
      loadedCustomSections = [];
    }

    setCustomSections(loadedCustomSections);

    try {
      const storedOverrides = window.localStorage.getItem(INVENTORY_SECTION_TITLE_OVERRIDES_KEY);
      const parsedOverrides = storedOverrides ? JSON.parse(storedOverrides) : {};
      if (parsedOverrides && typeof parsedOverrides === "object" && !Array.isArray(parsedOverrides)) {
        setSectionTitleOverrides(
          Object.fromEntries(
            Object.entries(parsedOverrides).filter(
              (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
            ),
          ),
        );
      }
    } catch {
      setSectionTitleOverrides({});
    }

    const sections = [...DEFAULT_SAVED_SECTIONS, ...loadedCustomSections];
    const nextState: Record<string, number[]> = Object.fromEntries(sections.map((section) => [section.view, [] as number[]]));

    for (const section of sections) {
      try {
        const storedItems = window.localStorage.getItem(section.key);
        if (!storedItems) continue;
        const parsedItems = JSON.parse(storedItems);
        if (Array.isArray(parsedItems)) {
          nextState[section.view] = parsedItems.filter((item): item is number => typeof item === "number");
        }
      } catch {
        // Ignore malformed data and continue with an empty list for this section.
      }
    }

    setSavedSectionProducts(nextState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentState = (window.history.state as InventoryHistoryState | null) ?? {};
    window.history.replaceState(
      {
        ...currentState,
        inventoryView: currentState.inventoryView ?? "products",
        inventoryScroll: typeof currentState.inventoryScroll === "number" ? currentState.inventoryScroll : window.scrollY,
        inventorySearch: typeof currentState.inventorySearch === "string" ? currentState.inventorySearch : "",
        targetProductId: currentState.targetProductId ?? null,
      } satisfies InventoryHistoryState,
      "",
    );

    if (typeof currentState.inventoryScroll === "number" && currentState.inventoryScroll > 0) {
      pendingRestoreScrollRef.current = currentState.inventoryScroll;
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state as InventoryHistoryState | null) ?? {};
      if (!state.inventoryView) return;

      setActiveView(state.inventoryView);
      setProductSearchTerm(state.inventorySearch ?? "");
      pendingRestoreScrollRef.current = typeof state.inventoryScroll === "number" ? state.inventoryScroll : 0;
      pendingProductJumpRef.current = state.inventoryView === "products" ? (state.targetProductId ?? null) : null;
      setHighlightedProductId(state.inventoryView === "products" ? (state.targetProductId ?? null) : null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const getAnalyticsItemKey = (item: ProductAnalyticsItem) =>
    item.productId ? `product:${item.productId}` : `name:${item.productName.trim().toLowerCase()}`;

  const replaceInventoryHistoryState = (state: InventoryHistoryState) => {
    if (typeof window === "undefined") return;

    const currentState = (window.history.state as InventoryHistoryState | null) ?? {};
    window.history.replaceState({ ...currentState, ...state }, "");
  };

  const pushInventoryHistoryState = (state: InventoryHistoryState) => {
    if (typeof window === "undefined") return;

    const currentState = (window.history.state as InventoryHistoryState | null) ?? {};
    window.history.pushState({ ...currentState, ...state }, "");
  };

  const captureCurrentViewState = (): InventoryHistoryState => ({
    inventoryView: activeView,
    inventoryScroll: typeof window !== "undefined" ? window.scrollY : 0,
    inventorySearch: productSearchTerm,
    targetProductId: activeView === "products" ? highlightedProductId : null,
  });

  const persistHiddenAnalyticsItems = (nextHiddenItems: string[]) => {
    setHiddenAnalyticsItems(nextHiddenItems);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HIDDEN_INVENTORY_ANALYTICS_KEY, JSON.stringify(nextHiddenItems));
    }
  };

  const persistSavedSectionProducts = (view: InventoryView, nextItems: number[]) => {
    setSavedSectionProducts((current) => ({ ...current, [view]: nextItems }));
    if (typeof window !== "undefined") {
      const section = savedSections.find((entry) => entry.view === view);
      if (section) {
        window.localStorage.setItem(section.key, JSON.stringify(nextItems));
      }
    }
  };

  const handleDeleteProduct = (productId: number, productName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${productName}"? This cannot be undone.`)) {
      return;
    }

    deleteProduct(productId, {
      onSuccess: () => {
        toast({
          title: "Product deleted",
          description: `"${productName}" was removed from the inventory list.`,
        });
      },
      onError: (error) => {
        toast({
          title: "Could not delete product",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  const handleHideAnalyticsItem = (item: ProductAnalyticsItem) => {
    const itemKey = getAnalyticsItemKey(item);
    if (hiddenAnalyticsItems.includes(itemKey)) return;

    persistHiddenAnalyticsItems([...hiddenAnalyticsItems, itemKey]);
    toast({
      title: "Item removed from this list",
      description: `"${item.productName}" is now hidden from these ranking views.`,
    });
  };

  const toggleSavedSectionProduct = (view: InventoryView, productId: number, productName: string) => {
    const section = savedSections.find((entry) => entry.view === view);
    if (!section) return;
    const currentItems = savedSectionProducts[view] ?? [];
    const exists = currentItems.includes(productId);
    const nextItems = exists
      ? currentItems.filter((id) => id !== productId)
      : [...currentItems, productId];

    persistSavedSectionProducts(view, nextItems);
    toast({
      title: exists ? `Removed from ${section.title}` : `Added to ${section.title}`,
      description: `"${productName}" ${exists ? "was removed from" : "was added to"} ${section.title}.`,
    });
  };

  const persistCustomSections = (nextSections: SavedSection[]) => {
    setCustomSections(nextSections);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        CUSTOM_INVENTORY_SECTIONS_KEY,
        JSON.stringify(nextSections.map((section) => ({ view: section.view, title: section.title }))),
      );
    }
  };

  const openAddSectionDialog = () => {
    setEditingSectionView(null);
    setSectionTitleInput("");
    setIsSectionDialogOpen(true);
  };

  const openEditSectionDialog = (section: SavedSection) => {
    setEditingSectionView(section.view);
    setSectionTitleInput(section.title);
    setIsSectionDialogOpen(true);
  };

  const saveSection = () => {
    const title = sectionTitleInput.trim();
    if (!title) {
      toast({ title: "Section name required", description: "Enter a section name.", variant: "destructive" });
      return;
    }

    if (editingSectionView) {
      const customIndex = customSections.findIndex((section) => section.view === editingSectionView);
      if (customIndex >= 0) {
        const nextSections = customSections.map((section, index) =>
          section.view === editingSectionView ? createCustomSection(title, index, section.view) : section,
        );
        persistCustomSections(nextSections);
      } else {
        const nextOverrides = { ...sectionTitleOverrides, [editingSectionView]: title };
        setSectionTitleOverrides(nextOverrides);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(INVENTORY_SECTION_TITLE_OVERRIDES_KEY, JSON.stringify(nextOverrides));
        }
      }
      toast({ title: "Section updated", description: `${title} is ready.` });
    } else {
      const nextSection = createCustomSection(title, customSections.length);
      persistCustomSections([...customSections, nextSection]);
      setSavedSectionProducts((current) => ({ ...current, [nextSection.view]: [] }));
      toast({ title: "Section added", description: `${title} was added to Inventory.` });
    }

    setIsSectionDialogOpen(false);
    setEditingSectionView(null);
    setSectionTitleInput("");
  };

  const navigateToView = (view: InventoryView) => {
    if (view === activeView) return;

    replaceInventoryHistoryState(captureCurrentViewState());
    pushInventoryHistoryState({
      inventoryView: view,
      inventoryScroll: 0,
      inventorySearch: productSearchTerm,
      targetProductId: null,
    });
    setHighlightedProductId(null);
    setActiveView(view);
    pendingRestoreScrollRef.current = 0;
  };

  const openProductFromSection = (productId: number) => {
    replaceInventoryHistoryState(captureCurrentViewState());
    const returnParams = new URLSearchParams();
    returnParams.set("view", activeView);
    returnParams.set("returnScroll", String(Math.max(0, Math.round(typeof window !== "undefined" ? window.scrollY : 0))));
    if (productSearchTerm.trim()) {
      returnParams.set("inventorySearch", productSearchTerm);
    }

    setLocation(`/products?productId=${productId}&edit=1&returnTo=${encodeURIComponent(`/inventory?${returnParams.toString()}`)}`);
  };

  const { data: lowStockProducts, isLoading: lowStockLoading } = useQuery({
    queryKey: [api.inventory.lowStock.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.lowStock.path);
      if (!res.ok) throw new Error("Failed to fetch low stock products");
      return api.inventory.lowStock.responses[200].parse(await res.json());
    },
  });

  const { data: topSelling, isLoading: topSellingLoading } = useQuery({
    queryKey: [api.inventory.topSelling.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.topSelling.path);
      if (!res.ok) throw new Error("Failed to fetch top selling products");
      return api.inventory.topSelling.responses[200].parse(await res.json());
    },
  });

  const { data: leastSelling, isLoading: leastSellingLoading } = useQuery({
    queryKey: [api.inventory.leastSelling.path],
    queryFn: async () => {
      const res = await fetch(api.inventory.leastSelling.path);
      if (!res.ok) throw new Error("Failed to fetch least selling products");
      return api.inventory.leastSelling.responses[200].parse(await res.json());
    },
  });

  const productsById = useMemo(() => new Map((products ?? []).map((product) => [product.id, product])), [products]);
  const visibleTopSelling = useMemo(
    () => (topSelling ?? []).filter((item) => !hiddenAnalyticsItems.includes(getAnalyticsItemKey(item))),
    [hiddenAnalyticsItems, topSelling],
  );
  const visibleLeastSelling = useMemo(
    () => (leastSelling ?? []).filter((item) => !hiddenAnalyticsItems.includes(getAnalyticsItemKey(item))),
    [hiddenAnalyticsItems, leastSelling],
  );

  const sortedProducts = useMemo(
    () => [...(products ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [products],
  );
  const filteredProducts = useMemo(() => {
    const search = productSearchTerm.trim().toLowerCase();
    if (!search) return sortedProducts;

    return sortedProducts.filter((product) =>
      [
        product.name,
        String(product.id),
        product.primaryUnit || "",
        product.secondaryUnit || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [productSearchTerm, sortedProducts]);
  const sectionProducts = useMemo(
    () =>
      Object.fromEntries(
        savedSections.map((section) => [
          section.view,
          sortedProducts.filter((product) => (savedSectionProducts[section.view] ?? []).includes(product.id)),
        ]),
      ) as Record<string, typeof sortedProducts>,
    [savedSectionProducts, savedSections, sortedProducts],
  );
  const filteredSectionProducts = useMemo(() => {
    const search = productSearchTerm.trim().toLowerCase();
    return Object.fromEntries(
      savedSections.map((section) => [
        section.view,
        search
          ? sectionProducts[section.view].filter((product) =>
              [product.name, String(product.id)].join(" ").toLowerCase().includes(search),
            )
          : sectionProducts[section.view],
      ]),
    ) as Record<string, typeof sortedProducts>;
  }, [productSearchTerm, sectionProducts]);

  const totalProducts = products?.length || 0;
  const lowStockCount = lowStockProducts?.length || 0;
  const activeSavedSection = savedSections.find((section) => section.view === activeView);

  const detailTitle =
    activeView === "products"
      ? "All Products"
      : activeSavedSection
        ? activeSavedSection.title
      : activeView === "topSelling"
        ? "Top Selling Products"
        : "Low Selling Products";

  const detailDescription =
    activeView === "products"
      ? "Every product is shown here with its current stock availability."
      : activeSavedSection
        ? `Keep your ${activeSavedSection.title} items here for quick stock checking.`
      : activeView === "topSelling"
        ? "These are your fastest moving products with current stock and revenue."
        : "These products sold the least, so you can check whether stock is moving slowly.";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pendingRestoreScrollRef.current === null) return;

    const scrollY = pendingRestoreScrollRef.current;
    pendingRestoreScrollRef.current = null;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "auto" });
    });
  }, [activeView, productSearchTerm]);

  useEffect(() => {
    if (activeView !== "products") return;
    if (pendingProductJumpRef.current === null) return;

    const targetProductId = pendingProductJumpRef.current;
    const targetElement = productRowRefs.current[targetProductId];
    if (!targetElement) return;

    pendingProductJumpRef.current = null;
    window.requestAnimationFrame(() => {
      targetElement.scrollIntoView({ block: "center", behavior: "auto" });
    });
  }, [activeView, filteredProducts]);

  useEffect(() => {
    if (highlightedProductId === null) return;

    const timeout = window.setTimeout(() => {
      setHighlightedProductId((current) => (current === highlightedProductId ? null : current));
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [highlightedProductId]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 pb-24 md:p-8 md:pb-8">
      <div className="rounded-3xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-display font-bold text-foreground">
              <Warehouse className="h-8 w-8 text-primary" />
              Inventory
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Products now show a simpler stock-first view here.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/80 px-4 py-3">
            <div className="text-xs text-muted-foreground">Products</div>
            <div className="mt-1 text-lg font-semibold">{totalProducts}</div>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-[repeat(var(--inventory-card-count),minmax(0,1fr))] gap-3"
        style={{ "--inventory-card-count": savedSections.length + 4 } as CSSProperties}
      >
        <button
          type="button"
          onClick={() => navigateToView("products")}
          className={cn(
            "min-w-0 rounded-2xl border p-4 text-left transition-all",
            activeView === "products"
              ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
              : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
          )}
          >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="rounded-xl bg-background/80 p-2.5">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">Products</div>
          <div className="mt-1 text-2xl font-display font-bold">{totalProducts}</div>
          <div className="mt-2 text-xs leading-snug text-muted-foreground">Tap to open every product with stock availability.</div>
        </button>

        {savedSections.map((section) => (
          <div
            key={section.view}
            role="button"
            tabIndex={0}
            onClick={() => navigateToView(section.view)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigateToView(section.view);
              }
            }}
            className={cn(
              "min-w-0 cursor-pointer rounded-2xl border p-4 text-left transition-all",
              activeView === section.view ? section.activeClasses : section.inactiveClasses,
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="rounded-xl bg-background/80 p-2.5">
                <Package className="h-4 w-4 text-current" />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditSectionDialog(section);
                  }}
                  title={`Edit ${section.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="break-words text-sm text-muted-foreground">{section.title}</div>
            <div className="mt-1 text-2xl font-display font-bold">{sectionProducts[section.view]?.length || 0}</div>
            <div className="mt-2 break-words text-xs leading-snug text-muted-foreground">Tap to open your {section.title.toLowerCase()} items.</div>
          </div>
        ))}

        <button
          type="button"
          onClick={openAddSectionDialog}
          className="min-w-0 rounded-2xl border border-dashed border-primary/50 bg-card p-4 text-left transition-all hover:bg-primary/5"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Plus className="h-4 w-4 text-primary" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Add Section</div>
          <div className="mt-1 text-2xl font-display font-bold">New</div>
          <div className="mt-2 text-xs leading-snug text-muted-foreground">Create a section like Siridhaniya or Most Imp.</div>
        </button>

        <button
          type="button"
          onClick={() => navigateToView("topSelling")}
          className={cn(
            "min-w-0 rounded-2xl border p-4 text-left transition-all",
            activeView === "topSelling"
              ? "border-green-500 bg-green-500/10 shadow-lg shadow-green-500/10"
              : "border-border bg-card hover:border-green-500/40 hover:bg-muted/30",
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="rounded-xl bg-background/80 p-2.5">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">Top Selling</div>
          <div className="mt-1 text-2xl font-display font-bold">{visibleTopSelling.length}</div>
          <div className="mt-2 text-xs leading-snug text-muted-foreground">Tap to open products that are selling the most.</div>
        </button>

        <button
          type="button"
          onClick={() => navigateToView("lowSelling")}
          className={cn(
            "min-w-0 rounded-2xl border p-4 text-left transition-all",
            activeView === "lowSelling"
              ? "border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10"
              : "border-border bg-card hover:border-orange-500/40 hover:bg-muted/30",
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="rounded-xl bg-background/80 p-2.5">
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="text-sm text-muted-foreground">Low Selling</div>
          <div className="mt-1 text-2xl font-display font-bold">{visibleLeastSelling.length}</div>
          <div className="mt-2 text-xs leading-snug text-muted-foreground">Tap to open products that are moving slowly.</div>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-display font-bold">{detailTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{detailDescription}</p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              {(activeView === "products" || savedSections.some((section) => section.view === activeView)) && (
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    placeholder="Search products..."
                    className="h-10 pl-9"
                  />
                </div>
              )}
              <div className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                Touch any top card to switch this view
              </div>
            </div>
          </div>

          {activeView === "products" && (
            <>
              {productsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={`products-${i}`} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">All Products</h3>
                    <span className="text-xs text-muted-foreground">{filteredProducts.length}</span>
                  </div>
                  {filteredProducts.length > 0 ? (
                    <div className="space-y-2">
                      {filteredProducts.map((product) => {
                        const unitConfig = {
                          primaryUnit: product.primaryUnit,
                          secondaryUnit: product.secondaryUnit,
                          unitConversion: product.unitConversion,
                        };
                        const stock = Number(product.stock || 0);
                        const threshold = Number(product.lowStockThreshold || 0);

                        return (
                          <div
                            key={product.id}
                            ref={(element) => {
                              productRowRefs.current[product.id] = element;
                            }}
                            className={cn(
                              "rounded-xl border bg-background/80 px-3 py-3 transition-colors",
                              highlightedProductId === product.id ? "border-primary bg-primary/5" : "border-border",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="truncate text-base font-semibold">{product.name}</h4>
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">ID {product.id}</span>
                                  {stock <= threshold && (
                                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600">Low stock</span>
                                  )}
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                  Available stock: <span className="font-semibold text-foreground">{formatInventoryQuantity(stock, unitConfig)}</span>
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {savedSections.map((section) => {
                                  const included = (savedSectionProducts[section.view] ?? []).includes(product.id);
                                  return (
                                    <Button
                                      key={`${product.id}-${section.view}`}
                                      type="button"
                                      variant={included ? "secondary" : "outline"}
                                      size="sm"
                                      className="h-7 px-2 text-[11px]"
                                      onClick={() => toggleSavedSectionProduct(section.view, product.id, product.name)}
                                    >
                                      {included ? section.title : `Add ${section.title}`}
                                    </Button>
                                  );
                                })}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={deletingProduct}
                                  className="h-7 px-1.5 text-[11px] text-red-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => handleDeleteProduct(product.id, product.name)}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border py-10 text-center text-muted-foreground">
                      {productSearchTerm.trim() ? "No products match your search." : "No products found."}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {savedSections.some((section) => section.view === activeView) && (
            <>
              {productsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : (filteredSectionProducts[activeView] ?? []).length > 0 ? (
                <div className="space-y-3">
                  {(filteredSectionProducts[activeView] ?? []).map((product) => {
                    const section = savedSections.find((entry) => entry.view === activeView)!;
                    const unitConfig = {
                      primaryUnit: product.primaryUnit,
                      secondaryUnit: product.secondaryUnit,
                      unitConversion: product.unitConversion,
                    };
                    const stock = Number(product.stock || 0);
                    const threshold = Number(product.lowStockThreshold || 0);

                    return (
                      <div
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        className="rounded-2xl border border-border bg-muted/20 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                        onClick={() => openProductFromSection(product.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openProductFromSection(product.id);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold">{product.name}</h3>
                              <span className="rounded-full bg-background px-2 py-1 text-xs text-muted-foreground">ID {product.id}</span>
                              {stock <= threshold && (
                                <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600">Low stock</span>
                              )}
                              <span className={cn("rounded-full px-2 py-1 text-xs font-medium", section.badgeClasses)}>{section.title}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Available stock: <span className="font-semibold text-foreground">{formatInventoryQuantity(stock, unitConfig)}</span>
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={section.removeClasses}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSavedSectionProduct(activeView, product.id, product.name);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
                  {productSearchTerm.trim()
                    ? `No ${detailTitle} products match your search.`
                    : `No products added to ${detailTitle} yet.`}
                </div>
              )}
            </>
          )}

          {activeView === "topSelling" && (
            <>
              {topSellingLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : visibleTopSelling.length > 0 ? (
                <div className="space-y-3">
                  {visibleTopSelling.map((item, index) => {
                    const product = item.productId ? productsById.get(item.productId) : undefined;
                    const unitConfig = {
                      primaryUnit: product?.primaryUnit,
                      secondaryUnit: product?.secondaryUnit,
                      unitConversion: product?.unitConversion,
                    };

                    return (
                      <div key={`${item.productId}-${index}`} className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-xs uppercase tracking-wide text-green-600">Rank #{index + 1}</div>
                              {product ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={deletingProduct}
                                  className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => handleDeleteProduct(product.id, product.name)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => handleHideAnalyticsItem(item)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              )}
                            </div>
                            <h3 className="mt-1 text-lg font-semibold">{item.productName}</h3>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Sold: <span className="font-semibold text-foreground">{formatAnalyticsQuantity(Number(item.totalQuantity || 0), product ? unitConfig : undefined)}</span>
                            </p>
                            {product && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                Available stock: <span className="font-semibold text-foreground">{formatInventoryQuantity(Number(product.stock || 0), unitConfig)}</span>
                              </p>
                            )}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 md:min-w-[320px]">
                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs text-muted-foreground">Revenue</div>
                              <div className="mt-1 font-semibold text-green-600">{formatCurrencyINR(Number(item.totalRevenue || 0))}</div>
                            </div>
                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs text-muted-foreground">Cost Price</div>
                              <div className="mt-1 font-semibold">{product ? formatDisplayPrice(Number(product.costPrice || 0), unitConfig) : "Not linked"}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">No sales data available yet.</div>
              )}
            </>
          )}

          {activeView === "lowSelling" && (
            <>
              {leastSellingLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-2xl" />
                  ))}
                </div>
              ) : visibleLeastSelling.length > 0 ? (
                <div className="space-y-3">
                  {visibleLeastSelling.map((item, index) => {
                    const product = item.productId ? productsById.get(item.productId) : undefined;
                    const unitConfig = {
                      primaryUnit: product?.primaryUnit,
                      secondaryUnit: product?.secondaryUnit,
                      unitConversion: product?.unitConversion,
                    };

                    return (
                      <div key={`${item.productId}-${index}`} className="rounded-2xl border border-border bg-muted/20 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-xs uppercase tracking-wide text-orange-500">Rank #{index + 1}</div>
                              {product ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={deletingProduct}
                                  className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => handleDeleteProduct(product.id, product.name)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => handleHideAnalyticsItem(item)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              )}
                            </div>
                            <h3 className="mt-1 text-lg font-semibold">{item.productName}</h3>
                            <p className="mt-2 text-sm text-muted-foreground">
                              Sold: <span className="font-semibold text-foreground">{formatAnalyticsQuantity(Number(item.totalQuantity || 0), product ? unitConfig : undefined)}</span>
                            </p>
                            {product && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                Available stock: <span className="font-semibold text-foreground">{formatInventoryQuantity(Number(product.stock || 0), unitConfig)}</span>
                              </p>
                            )}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 md:min-w-[320px]">
                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs text-muted-foreground">Revenue</div>
                              <div className="mt-1 font-semibold text-orange-500">{formatCurrencyINR(Number(item.totalRevenue || 0))}</div>
                            </div>
                            <div className="rounded-2xl border border-border bg-background p-3">
                              <div className="text-xs text-muted-foreground">Current Cost Price</div>
                              <div className="mt-1 font-semibold">{product ? formatDisplayPrice(Number(product.costPrice || 0), unitConfig) : "Not linked"}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">No sales data available yet.</div>
              )}
            </>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-lg font-semibold">Low Stock Alert</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">These items are at or below the stock level you set.</p>
            {lowStockLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-2xl" />
                ))}
              </div>
            ) : lowStockProducts && lowStockProducts.length > 0 ? (
              <div className="space-y-3">
                {lowStockProducts.slice(0, 6).map((product) => {
                  const unitConfig = {
                    primaryUnit: product.primaryUnit,
                    secondaryUnit: product.secondaryUnit,
                    unitConversion: product.unitConversion,
                  };

                  return (
                    <div key={product.id} className="rounded-2xl border border-red-200 bg-red-50/60 p-3">
                      <div className="font-medium">{product.name}</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        <div>
                          Stock: <span className="font-semibold text-red-600">{formatInventoryQuantity(Number(product.stock || 0), unitConfig)}</span>
                        </div>
                        <div>
                          Limit: <span className="font-semibold text-foreground">{formatInventoryQuantity(Number(product.lowStockThreshold || 0), unitConfig)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">All products are well stocked.</div>
            )}
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Quick Summary</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-muted/30 px-3 py-3">
                <span className="text-muted-foreground">Products</span>
                <span className="font-semibold">{totalProducts}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-muted/30 px-3 py-3">
                <span className="text-muted-foreground">Low stock items</span>
                <span className="font-semibold text-red-600">{lowStockCount}</span>
              </div>
              {savedSections.map((section) => (
                <div key={`summary-${section.view}`} className="flex items-center justify-between rounded-2xl bg-muted/30 px-3 py-3">
                  <span className="text-muted-foreground">{section.title} items</span>
                  <span className="font-semibold">{sectionProducts[section.view]?.length || 0}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-2xl bg-muted/30 px-3 py-3">
                <span className="text-muted-foreground">Best sellers listed</span>
                <span className="font-semibold text-green-600">{visibleTopSelling.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-muted/30 px-3 py-3">
                <span className="text-muted-foreground">Slow sellers listed</span>
                <span className="font-semibold text-orange-500">{leastSelling?.length || 0}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveSection();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editingSectionView ? "Edit Inventory Section" : "Add Inventory Section"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <label className="text-sm font-medium">Section Name</label>
              <Input
                autoFocus
                value={sectionTitleInput}
                onChange={(event) => setSectionTitleInput(event.target.value)}
                placeholder="Example: Siridhaniya"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSectionDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingSectionView ? "Save Section" : "Add Section"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
