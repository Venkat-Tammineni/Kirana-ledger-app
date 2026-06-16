import { useEffect, useMemo, useState } from "react";
import {
  fetchLastBilledItemMemory,
  fetchPreviousBill,
  useAccounts,
  useCreateBill,
  useCreateProduct,
  useCustomers,
  useLastBilledItemMemory,
  useProducts,
} from "@/hooks/use-pos";
import { Search, Plus, Trash2, IndianRupee, Save, CreditCard, UserPlus, CalendarIcon, ShoppingBag, ClipboardList, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDate, toISTDateTimeStringForApi } from "@/lib/format";
import { compactVoiceText, createVoiceSearchKeys, parseBillingLineCommand, parseSpokenAmount } from "@/lib/voice-commands";
import {
  deriveUnitPriceFromBase,
  getAvailableUnits,
  getBaseUnit,
  getDefaultSalesUnit,
  getPrimaryUnit,
  hasSecondaryUnit,
  normalizeUnitPriceToBase,
  toBaseQuantity,
  UNIT_OPTIONS,
  type UnitOption,
} from "@shared/units";
import { getISTDateKey, parseISTDateOnly, parseISTDateTime } from "@shared/timezone";

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
  quantity: string;
  baseCostPrice: number;
  unit: UnitOption;
  primaryUnit: UnitOption;
  secondaryUnit?: UnitOption | null;
  unitConversion?: number | null;
}

const POS_DRAFT_STORAGE_KEY = "kirana-pos-draft";
const GRAM_QUICK_OPTIONS = [100, 150, 250, 500] as const;
const ROUND_OFF_LABEL = "Round Off";
const DEFAULT_CUSTOM_UNIT: UnitOption = "KG";

function createEmptyCustomItem() {
  return { name: "", price: "", costPrice: "", quantity: "1", unit: DEFAULT_CUSTOM_UNIT };
}

function formatStockAvailability(stock: number, displayUnit: UnitOption, baseUnit: UnitOption) {
  if (baseUnit === "GRAMS" && displayUnit === "KG") {
    const quantityInKg = stock / 1000;
    return Number.isInteger(quantityInKg) ? `${quantityInKg} KG` : `${quantityInKg.toFixed(2)} KG`;
  }

  return `${stock} ${displayUnit}`;
}

type ParsedBulkItemLine = {
  name: string;
  quantity: number;
  unit: UnitOption | null;
};

type PosDraftState = {
  cart: CartItem[];
  searchTerm: string;
  selectedCustomer: number | null;
  extraCharges: ExtraChargeRow[];
  pendingProduct: PendingProductSelection | null;
  customItem: { name: string; price: string; costPrice: string; quantity: string; unit: UnitOption };
  isPaymentOpen: boolean;
  paidAmount: string;
  paymentAccountId: number | null;
  billDate: string | null;
  billDateManuallyChanged?: boolean;
};

function getDefaultBillDate() {
  return parseISTDateOnly(getISTDateKey(new Date()));
}

function normalizeBulkUnit(value?: string): UnitOption | null {
  const normalized = value?.trim().toLowerCase().replace(/\./g, "");
  if (!normalized) return null;

  const unitMap: Record<string, UnitOption> = {
    bag: "BAG",
    bags: "BAG",
    btl: "BOTTLES",
    bottle: "BOTTLES",
    bottles: "BOTTLES",
    box: "BOXES",
    boxes: "BOXES",
    can: "CANS",
    cans: "CANS",
    carton: "BOXES",
    cartons: "BOXES",
    cartoon: "BOXES",
    cartoons: "BOXES",
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

function parseBulkItemLine(line: string): ParsedBulkItemLine | null {
  const cleaned = line
    .replace(/^[\s*#.-]+/, "")
    .replace(/\s*[-–—:]\s*(?=\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z.]+)?$/);
  if (!match) return null;

  const quantity = Number(match[2]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    name: match[1].trim(),
    quantity,
    unit: normalizeBulkUnit(match[3]),
  };
}

const PRODUCT_VOICE_ALIASES: Record<string, string[]> = {
  "allam paste": ["alam paste", "allam", "alam"],
  "avalu": ["aavaalu", "aavalu"],
  "basmati rice": ["basmathi rice", "basmati", "basmathi"],
  "batani": ["batani sh"],
  "bellam": ["belam"],
  "besan": ["beasan"],
  "besan sh": ["beshan sh", "besan s h"],
  "biryani akku": ["biryani aaku", "biryani leaf"],
  "chakki": ["chaki"],
  "chana dal": ["chana dhal", "channa dal"],
  "chekka dalchni": ["chekka dalchini", "dalchini"],
  "chicken danda": ["chicken dunda"],
  "chicken everest": ["everest chicken"],
  "chicken masala": ["chicken masla"],
  "chilli sause": ["chilli sauce", "chili sauce", "chili sause"],
  "coconut powder": ["coco powder", "coconut"],
  "corn flour": ["cornflour"],
  dal: ["dhal"],
  "dal broken": ["dhal broken", "broken dal"],
  dalda: ["dal da"],
  "dhaniya powder": ["daniya powder", "coriander powder"],
  dhaniyalu: ["daniyalu"],
  "dosa pappu": ["dosha pappu"],
  "dry mirchi": ["dry mirchi powder", "dry chili"],
  elachi: ["elaichi"],
  "fried palli": ["fry palli"],
  "garam everest": ["everest garam"],
  "garam masala": ["garam masla"],
  gasagasalu: ["gas gasalu", "khas khas"],
  "gingelly oil": ["gingili oil", "sesame oil"],
  gottalu: ["gothalu", "gundulu"],
  "green colour bush": ["green color bush"],
  "gundu dh": ["gundu d h"],
  "gundu dhh": ["gundu d h h"],
  "gundu jyothi": ["gundu jothi"],
  idly: ["idli"],
  "idly lohitha": ["idli lohitha"],
  imly: ["imli"],
  japthri: ["japtri", "japathri"],
  jera: ["jeera", "zeera", "jelakera", "jeelakara", "jeelakarra", "cumin"],
  "jera powder": ["jeera powder", "zeera powder", "jelakera powder", "jeelakara powder", "jeelakarra powder", "cumin powder"],
  kaju: ["kaju 2p", "cashew"],
  "kaju chura n2": ["kaju chura n 2", "kaju chura number 2"],
  "kaju chura no.1": ["kaju chura no 1", "kaju chura number 1"],
  "kastur methi": ["kasuri methi"],
  kismis: ["kishmish"],
  "kitchen king everest": ["everest kitchen king"],
  lavangam: ["lavang"],
  lg: ["l g"],
  "lg choclate": ["lg chocolate"],
  maida: ["maidha"],
  "maida sh": ["maida s h"],
  "marati mogga": ["marathi mogga"],
  menthulu: ["methi seeds"],
  "milky maid": ["milkmaid"],
  milmaker: ["meal maker"],
  "mirchi powder": ["mirchi", "chili powder", "chilli powder"],
  miryalu: ["mirialu", "miriyalu", "miriyallu", "pepper"],
  "moong dal": ["mung dal"],
  "mtr sambar": ["m t r sambar"],
  noodles: ["nudles"],
  nuvvulu: ["nuvulu", "sesame"],
  "oil 16p": ["oil 16p priya", "16p oil", "priya oil 16p"],
  palli: ["palli kalyani", "groundnut"],
  "papad anapurna": ["papad", "papad anapoorna"],
  pasupu: ["turmeric"],
  pesarlu: ["pesalu"],
  poha: ["avalaki"],
  poori: ["puri"],
  "poori sh": ["poori s h", "puri sh"],
  "pucha pappu": ["pocha pappu"],
  "putana daliya": ["putana dalia", "putana"],
  putana: ["putana whole"],
  "r salt konark": ["r salt", "konark salt"],
  "ragi aata amma": ["ragi atta amma", "ragi aata"],
  rasam: ["rasam powder"],
  "ration rice": ["rasan rice"],
  "red colour bush": ["red color bush"],
  rice: ["white rice"],
  "ruchi 15kg": ["ruchi 15 kg"],
  "ruchi oil": ["ruchi"],
  "sabji masala": ["sabzi masala"],
  salt: ["sault"],
  "salt ashirvad": ["ashirvad salt", "ashirwad salt"],
  sambar: ["sambhar"],
  semiya: ["seviyan"],
  shajera: ["shajeera", "sha jeera"],
  "soap surfexcel": ["surf excel soap", "soap surf excel", "surfexcel"],
  soda: ["soda powder"],
  sooji: ["suji", "sujji", "suji rava", "sujji rava", "sooji rava"],
  "sooji sh": ["suji sh", "sooji s h"],
  "soya sause": ["soya sauce", "soya sause", "soy sauce"],
  "split urad dal": ["split ured dal", "urad dal", "urad"],
  stars: ["star anise", "star"],
  sugar: ["shugar"],
  surf: ["surf powder"],
  "swasthik mirchi powder": ["garam swasthik", "swasthik", "swastik mirchi powder"],
  "tasty salt": ["testy salt", "tasty"],
  "tomato sause": ["tomato sauce", "tomato sause"],
  "ura mirchi": ["ura mirchi powder", "ura chilli"],
  vineger: ["vinegar", "winiger"],
  "yellow colour bush": ["yellow color bush"],
};

const PRODUCT_CANONICAL_WORDS: Record<string, string> = {
  alam: "allam",
  aavaalu: "avalu",
  aavalu: "avalu",
  basmathi: "basmati",
  beasan: "besan",
  beshan: "besan",
  belam: "bellam",
  chaki: "chakki",
  chilli: "mirchi",
  chili: "mirchi",
  corriander: "dhaniya",
  coriander: "dhaniya",
  cumin: "jera",
  daniya: "dhaniya",
  daniyalu: "dhaniyalu",
  dhal: "dal",
  elaichi: "elachi",
  imli: "imly",
  jeera: "jera",
  jeelakara: "jera",
  jeelakarra: "jera",
  jeelakera: "jera",
  jelakara: "jera",
  jelakarra: "jera",
  jelakera: "jera",
  mirialu: "miryalu",
  miriyalu: "miryalu",
  miriyallu: "miryalu",
  pasupu: "pasupu",
  suji: "sooji",
  sujji: "sooji",
  zeera: "jera",
};

function canonicalizeProductQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => PRODUCT_CANONICAL_WORDS[word] ?? word)
    .join(" ");
}

function normalizeQuantityInputForUnit(value: string | number, unit: UnitOption) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 1;
  const isDecimalGramInput =
    unit === "GRAMS" &&
    (typeof value === "string" ? value.includes(".") : !Number.isInteger(value));
  if (isDecimalGramInput) {
    return Math.round(numericValue * 1000);
  }
  return numericValue;
}

const DIRECT_PRODUCT_VOICE_TARGETS: Record<string, string> = {
  "allam paste": "allam paste",
  avalu: "avalu",
  "basmati rice": "basmati rice",
  batani: "batani",
  bellam: "bellam",
  besan: "besan",
  "besan sh": "besan sh",
  "biryani akku": "biryani akku",
  chakki: "chakki",
  "chana dal": "chana dal",
  "chekka dalchni": "chekka dalchni",
  "chicken danda": "chicken danda",
  "chicken everest": "chicken everest",
  "chicken masala": "chicken masala",
  "chilli sause": "chilli sause",
  "coconut powder": "coconut powder",
  "corn flour": "corn flour",
  dal: "dal",
  "dal broken": "dal broken",
  dalda: "dalda",
  "dhaniya powder": "dhaniya powder",
  dhaniyalu: "dhaniyalu",
  "dosa pappu": "dosa pappu",
  "dry mirchi": "dry mirchi",
  elachi: "elachi",
  "fried palli": "fried palli",
  "garam everest": "garam everest",
  "garam masala": "garam masala",
  gasagasalu: "gasagasalu",
  "garam swasthik": "swasthik mirchi powder",
  "gingelly oil": "gingelly oil",
  gottalu: "gottalu",
  "green colour bush": "green colour bush",
  "gundu dh": "gundu dh",
  "gundu dhh": "gundu dhh",
  "gundu jyothi": "gundu jyothi",
  idly: "idly",
  "idly lohitha": "idly lohitha",
  imly: "imly",
  japthri: "japthri",
  jera: "jera",
  "kaju 2p": "kaju",
  "kaju chura n2": "kaju chura n2",
  "kaju chura no.1": "kaju chura no.1",
  "kastur methi": "kastur methi",
  kismis: "kismis",
  "kitchen king everest": "kitchen king everest",
  lavangam: "lavangam",
  lg: "lg",
  "lg choclate": "lg choclate",
  maida: "maida",
  "maida sh": "maida sh",
  "marati mogga": "marati mogga",
  menthulu: "menthulu",
  "milky maid": "milky maid",
  milmaker: "milmaker",
  "mirchi powder": "mirchi powder",
  miryalu: "miryalu",
  "moong dal": "moong dal",
  "mtr sambar": "mtr sambar",
  noodles: "noodles",
  nuvvulu: "nuvvulu",
  "oil 16p priya": "oil 16p",
  palli: "palli",
  "palli kalyani": "palli",
  "papad anapurna": "papad anapurna",
  pasupu: "pasupu",
  pesarlu: "pesarlu",
  poha: "poha",
  poori: "poori",
  "poori sh": "poori sh",
  "pucha pappu": "pucha pappu",
  "putana daliya": "putana daliya",
  putana: "putana",
  "r salt konark": "r salt konark",
  "ragi aata amma": "ragi aata amma",
  rasam: "rasam",
  "ration rice": "ration rice",
  "red colour bush": "red colour bush",
  rice: "rice",
  "ruchi 15kg": "ruchi 15kg",
  "ruchi oil": "ruchi oil",
  "sabji masala": "sabji masala",
  salt: "salt",
  "salt ashirvad": "salt ashirvad",
  sambar: "sambar",
  semiya: "semiya",
  shajera: "shajera",
  "soap surfexcel": "soap surfexcel",
  soda: "soda",
  sooji: "sooji",
  "sooji sh": "sooji sh",
  "soya sause": "soya sause",
  "split urad dal": "split urad dal",
  stars: "stars",
  sugar: "sugar",
  surf: "surf",
  "swasthik mirchi powder": "swasthik mirchi powder",
  "tasty salt": "tasty salt",
  "tomato sause": "tomato sause",
  "ura mirchi": "ura mirchi",
  vineger: "vineger",
  "yellow colour bush": "yellow colour bush",
};

export default function Pos() {
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const { data: accounts } = useAccounts();
  const { mutate: createBill, isPending: isSaving } = useCreateBill();
  const { mutate: createProduct, isPending: isCreatingProduct } = useCreateProduct();
  const { toast } = useToast();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [extraCharges, setExtraCharges] = useState<ExtraChargeRow[]>([]);
  const [pendingProduct, setPendingProduct] = useState<PendingProductSelection | null>(null);
  const [gramQuantityPickerItemId, setGramQuantityPickerItemId] = useState<string | null>(null);
  const [gramQuantityDrafts, setGramQuantityDrafts] = useState<Record<string, string>>({});
  
  // Custom item state
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [customItem, setCustomItem] = useState(createEmptyCustomItem);
  const [addCustomItemToProducts, setAddCustomItemToProducts] = useState(false);
  const [isCustomGramPickerOpen, setIsCustomGramPickerOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [bulkAddText, setBulkAddText] = useState("");

  // Payment dialog state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [billDate, setBillDate] = useState<Date | undefined>(() => getDefaultBillDate());
  const [billDateManuallyChanged, setBillDateManuallyChanged] = useState(false);
  const [isBillDatePickerOpen, setIsBillDatePickerOpen] = useState(false);
  const [isPaymentBillDatePickerOpen, setIsPaymentBillDatePickerOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [isLoadingPreviousBill, setIsLoadingPreviousBill] = useState(false);
  const trimmedCustomItemName = customItem.name.trim();
  const { data: customItemMemory } = useLastBilledItemMemory(
    selectedCustomer && trimmedCustomItemName
      ? { customerId: selectedCustomer, name: trimmedCustomItemName }
      : undefined,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedDraft = window.localStorage.getItem(POS_DRAFT_STORAGE_KEY);
    if (!savedDraft) return;

    try {
      const parsed = JSON.parse(savedDraft) as Partial<PosDraftState>;
      setCart(Array.isArray(parsed.cart) ? parsed.cart : []);
      setSearchTerm(typeof parsed.searchTerm === "string" ? parsed.searchTerm : "");
      setSelectedCustomer(typeof parsed.selectedCustomer === "number" ? parsed.selectedCustomer : null);
      setExtraCharges(Array.isArray(parsed.extraCharges) ? parsed.extraCharges : []);
      setPendingProduct(
        parsed.pendingProduct
          ? {
              ...parsed.pendingProduct,
              quantity:
                typeof parsed.pendingProduct.quantity === "string"
                  ? parsed.pendingProduct.quantity
                  : "1",
            }
          : null,
      );
      const savedCustomItem = parsed.customItem;
      setCustomItem({
        name: savedCustomItem?.name ?? "",
        price: savedCustomItem?.price ?? "",
        costPrice: savedCustomItem?.costPrice ?? "",
        quantity: savedCustomItem?.quantity ?? "1",
        unit: UNIT_OPTIONS.includes(savedCustomItem?.unit as UnitOption)
          ? (savedCustomItem?.unit as UnitOption)
          : DEFAULT_CUSTOM_UNIT,
      });
      setIsPaymentOpen(Boolean(parsed.isPaymentOpen));
      setPaidAmount(typeof parsed.paidAmount === "string" ? parsed.paidAmount : "");
      setPaymentAccountId(typeof parsed.paymentAccountId === "number" ? parsed.paymentAccountId : null);
      const shouldRestoreSavedDate = typeof parsed.billDate === "string" && parsed.billDateManuallyChanged === true;
      setBillDate(shouldRestoreSavedDate ? parseISTDateTime(parsed.billDate as string) : getDefaultBillDate());
      setBillDateManuallyChanged(Boolean(shouldRestoreSavedDate));
    } catch {
      window.localStorage.removeItem(POS_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const draft: PosDraftState = {
      cart,
      searchTerm,
      selectedCustomer,
      extraCharges,
      pendingProduct,
      customItem,
      isPaymentOpen,
      paidAmount,
      paymentAccountId,
      billDate: billDate ? toISTDateTimeStringForApi(billDate) : null,
      billDateManuallyChanged,
    };

    window.localStorage.setItem(POS_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    billDate,
    cart,
    customItem,
    extraCharges,
    isPaymentOpen,
    paidAmount,
    paymentAccountId,
    pendingProduct,
    searchTerm,
    selectedCustomer,
    billDateManuallyChanged,
  ]);

  useEffect(() => {
    if (!customItemMemory || !selectedCustomer) return;

    setCustomItem((current) => {
      const currentName = current.name.trim();
      if (currentName.toLowerCase() !== customItemMemory.name.trim().toLowerCase()) {
        return current;
      }

      const nextUnit = UNIT_OPTIONS.includes(customItemMemory.unit as UnitOption)
        ? (customItemMemory.unit as UnitOption)
        : current.unit;
      const shouldApplyPrice = current.price.trim().length === 0;
      const shouldApplyCostPrice = current.costPrice.trim().length === 0 || Number(current.costPrice) === 0;
      const shouldApplyQuantity = current.quantity.trim().length === 0 || Number(current.quantity) === 1;
      const shouldApplyUnit = current.unit === DEFAULT_CUSTOM_UNIT;

      if (!shouldApplyPrice && !shouldApplyCostPrice && !shouldApplyQuantity && !shouldApplyUnit) {
        return current;
      }

      return {
        ...current,
        price: shouldApplyPrice ? customItemMemory.price.toString() : current.price,
        costPrice: shouldApplyCostPrice ? customItemMemory.costPrice.toString() : current.costPrice,
        quantity: shouldApplyQuantity ? customItemMemory.quantity.toString() : current.quantity,
        unit: shouldApplyUnit ? nextUnit : current.unit,
      };
    });
  }, [customItemMemory, selectedCustomer]);

  const clearBillDraft = () => {
    setCart([]);
    setSearchTerm("");
    setSelectedCustomer(null);
    setExtraCharges([]);
    setPendingProduct(null);
    setIsCustomItemOpen(false);
    setCustomItem(createEmptyCustomItem());
    setIsCustomGramPickerOpen(false);
    setIsBulkAddOpen(false);
    setBulkAddText("");
    setIsPaymentOpen(false);
    setPaidAmount("");
    setPaymentAccountId(null);
    setBillDate(getDefaultBillDate());
    setBillDateManuallyChanged(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(POS_DRAFT_STORAGE_KEY);
    }
  };

  const findCustomerByVoice = (query: string) => {
    const queryKeys = createVoiceSearchKeys(query);
    const levenshtein = (a: string, b: string) => {
      const rows = a.length + 1;
      const cols = b.length + 1;
      const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
      for (let i = 0; i < rows; i += 1) dp[i][0] = i;
      for (let j = 0; j < cols; j += 1) dp[0][j] = j;
      for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost,
          );
        }
      }
      return dp[a.length][b.length];
    };

    const rankedMatches = (customers || [])
      .map((customer) => {
        const customerKeys = createVoiceSearchKeys(customer.name);
        let score = 0;

        if (customerKeys.normalized === queryKeys.normalized) score += 1200;
        if (customerKeys.compact === queryKeys.compact) score += 1050;
        if (customerKeys.phoneticCompact === queryKeys.phoneticCompact) score += 1000;
        if (customerKeys.normalized.startsWith(queryKeys.normalized)) score += 760;
        if (customerKeys.compact.startsWith(queryKeys.compact)) score += 720;
        if (customerKeys.phoneticCompact.startsWith(queryKeys.phoneticCompact)) score += 700;
        if (customerKeys.normalized.includes(queryKeys.normalized)) score += 560;
        if (customerKeys.compact.includes(queryKeys.compact)) score += 520;
        if (customerKeys.phoneticCompact.includes(queryKeys.phoneticCompact)) score += 500;

        const tokenHits = queryKeys.tokens.filter((token) =>
          customerKeys.tokens.some((customerToken) => {
            if (customerToken === token) return true;
            if (customerToken.includes(token) || token.includes(customerToken)) return true;
            return levenshtein(customerToken, token) <= 1;
          }),
        ).length;
        score += tokenHits * 145;

        const compactDistance = levenshtein(customerKeys.compact, queryKeys.compact);
        const compactMaxLength = Math.max(customerKeys.compact.length, queryKeys.compact.length, 1);
        const similarity = 1 - compactDistance / compactMaxLength;

        const phoneticDistance = levenshtein(customerKeys.phoneticCompact, queryKeys.phoneticCompact);
        const phoneticMaxLength = Math.max(customerKeys.phoneticCompact.length, queryKeys.phoneticCompact.length, 1);
        const phoneticSimilarity = 1 - phoneticDistance / phoneticMaxLength;

        score += Math.round(similarity * 280);
        score += Math.round(phoneticSimilarity * 320);

        if (score === 0) return null;

        return {
          customer,
          score,
          similarity,
          phoneticSimilarity,
          nameLength: customer.name.length,
        };
      })
      .filter(
        (entry): entry is {
          customer: any;
          score: number;
          similarity: number;
          phoneticSimilarity: number;
          nameLength: number;
        } => entry !== null,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.phoneticSimilarity - a.phoneticSimilarity ||
          b.similarity - a.similarity ||
          a.nameLength - b.nameLength,
      );

    if (rankedMatches.length === 0) return null;
    if (rankedMatches.length === 1) return rankedMatches[0].customer;

    const [best, second] = rankedMatches;
    if (best.similarity >= 0.76 || best.phoneticSimilarity >= 0.8) return best.customer;
    if (best.score >= second.score + 70) return best.customer;
    if (best.score >= 700 && best.score >= Math.round(second.score * 1.12)) return best.customer;

    return null;
  };

  const findProductByVoice = (query: string) => {
    const queryKeys = createVoiceSearchKeys(query);
    const canonicalQuery = canonicalizeProductQuery(query);
    const canonicalQueryKeys = createVoiceSearchKeys(canonicalQuery);
    const directTargetName =
      DIRECT_PRODUCT_VOICE_TARGETS[query.trim().toLowerCase()] ||
      DIRECT_PRODUCT_VOICE_TARGETS[queryKeys.normalized] ||
      DIRECT_PRODUCT_VOICE_TARGETS[queryKeys.compact] ||
      DIRECT_PRODUCT_VOICE_TARGETS[canonicalQuery] ||
      DIRECT_PRODUCT_VOICE_TARGETS[canonicalQueryKeys.normalized] ||
      DIRECT_PRODUCT_VOICE_TARGETS[canonicalQueryKeys.compact];

    if (directTargetName) {
      const directTargetKeys = createVoiceSearchKeys(directTargetName);
      const directMatches = (products || [])
        .filter((product) => createVoiceSearchKeys(product.name).normalized === directTargetKeys.normalized)
        .sort(
          (a, b) =>
            Number(b.stock || 0) - Number(a.stock || 0) ||
            a.name.length - b.name.length,
        );
      if (directMatches.length > 0) {
        return directMatches[0];
      }
    }

    const levenshtein = (a: string, b: string) => {
      const rows = a.length + 1;
      const cols = b.length + 1;
      const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
      for (let i = 0; i < rows; i += 1) dp[i][0] = i;
      for (let j = 0; j < cols; j += 1) dp[0][j] = j;
      for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost,
          );
        }
      }
      return dp[a.length][b.length];
    };

    const rankedMatches = (products || [])
      .map((product) => {
        const productName = product.name.trim().toLowerCase();
        const productKeys = createVoiceSearchKeys(product.name);
        const canonicalProductKeys = createVoiceSearchKeys(canonicalizeProductQuery(product.name));
        const aliasNames = PRODUCT_VOICE_ALIASES[productName] || [];
        const aliasKeys = [
          ...aliasNames.map((alias) => createVoiceSearchKeys(alias)),
          ...aliasNames.map((alias) => createVoiceSearchKeys(canonicalizeProductQuery(alias))),
        ];
        const availableStock = Number(product.stock || 0);

        let score = 0;

        if (productKeys.normalized === queryKeys.normalized) score += 1200;
        if (productKeys.compact === queryKeys.compact) score += 1050;
        if (productKeys.phoneticCompact === queryKeys.phoneticCompact) score += 1000;
        if (canonicalProductKeys.normalized === canonicalQueryKeys.normalized) score += 1180;
        if (canonicalProductKeys.compact === canonicalQueryKeys.compact) score += 1040;
        if (canonicalProductKeys.phoneticCompact === canonicalQueryKeys.phoneticCompact) score += 990;
        if (productKeys.normalized.startsWith(queryKeys.normalized)) score += 760;
        if (productKeys.compact.startsWith(queryKeys.compact)) score += 720;
        if (productKeys.phoneticCompact.startsWith(queryKeys.phoneticCompact)) score += 700;
        if (canonicalProductKeys.normalized.startsWith(canonicalQueryKeys.normalized)) score += 750;
        if (canonicalProductKeys.compact.startsWith(canonicalQueryKeys.compact)) score += 710;
        if (canonicalProductKeys.phoneticCompact.startsWith(canonicalQueryKeys.phoneticCompact)) score += 690;
        if (productKeys.normalized.includes(queryKeys.normalized)) score += 560;
        if (productKeys.compact.includes(queryKeys.compact)) score += 520;
        if (productKeys.phoneticCompact.includes(queryKeys.phoneticCompact)) score += 500;
        if (canonicalProductKeys.normalized.includes(canonicalQueryKeys.normalized)) score += 550;
        if (canonicalProductKeys.compact.includes(canonicalQueryKeys.compact)) score += 510;
        if (canonicalProductKeys.phoneticCompact.includes(canonicalQueryKeys.phoneticCompact)) score += 490;

        const tokenHits = queryKeys.tokens.filter((token) =>
          productKeys.tokens.some((productToken) => {
            if (productToken === token) return true;
            if (productToken.includes(token) || token.includes(productToken)) return true;
            return levenshtein(productToken, token) <= 1;
          }),
        ).length;
        score += tokenHits * 145;

        const phoneticTokenHits = queryKeys.phoneticTokens.filter((token) =>
          productKeys.phoneticTokens.some((productToken) => {
            if (productToken === token) return true;
            if (productToken.includes(token) || token.includes(productToken)) return true;
            return levenshtein(productToken, token) <= 1;
          }),
        ).length;
        score += phoneticTokenHits * 130;

        const canonicalTokenHits = canonicalQueryKeys.tokens.filter((token) =>
          canonicalProductKeys.tokens.some((productToken) => {
            if (productToken === token) return true;
            if (productToken.includes(token) || token.includes(productToken)) return true;
            return levenshtein(productToken, token) <= 1;
          }),
        ).length;
        score += canonicalTokenHits * 155;

        const compactDistance = levenshtein(productKeys.compact, queryKeys.compact);
        const compactMaxLength = Math.max(productKeys.compact.length, queryKeys.compact.length, 1);
        const similarity = 1 - compactDistance / compactMaxLength;

        const phoneticDistance = levenshtein(productKeys.phoneticCompact, queryKeys.phoneticCompact);
        const phoneticMaxLength = Math.max(productKeys.phoneticCompact.length, queryKeys.phoneticCompact.length, 1);
        const phoneticSimilarity = 1 - phoneticDistance / phoneticMaxLength;

        const canonicalCompactDistance = levenshtein(canonicalProductKeys.compact, canonicalQueryKeys.compact);
        const canonicalCompactMaxLength = Math.max(canonicalProductKeys.compact.length, canonicalQueryKeys.compact.length, 1);
        const canonicalSimilarity = 1 - canonicalCompactDistance / canonicalCompactMaxLength;

        const canonicalPhoneticDistance = levenshtein(canonicalProductKeys.phoneticCompact, canonicalQueryKeys.phoneticCompact);
        const canonicalPhoneticMaxLength = Math.max(canonicalProductKeys.phoneticCompact.length, canonicalQueryKeys.phoneticCompact.length, 1);
        const canonicalPhoneticSimilarity = 1 - canonicalPhoneticDistance / canonicalPhoneticMaxLength;

        score += Math.round(similarity * 280);
        score += Math.round(phoneticSimilarity * 320);
        score += Math.round(canonicalSimilarity * 300);
        score += Math.round(canonicalPhoneticSimilarity * 340);

        let aliasSimilarity = 0;
        let aliasPhoneticSimilarity = 0;
        let aliasBoost = 0;

        for (const aliasKey of aliasKeys) {
          if (aliasKey.normalized === queryKeys.normalized) aliasBoost = Math.max(aliasBoost, 1200);
          if (aliasKey.compact === queryKeys.compact) aliasBoost = Math.max(aliasBoost, 1050);
          if (aliasKey.phoneticCompact === queryKeys.phoneticCompact) aliasBoost = Math.max(aliasBoost, 1000);
          if (aliasKey.normalized === canonicalQueryKeys.normalized) aliasBoost = Math.max(aliasBoost, 1180);
          if (aliasKey.compact === canonicalQueryKeys.compact) aliasBoost = Math.max(aliasBoost, 1040);
          if (aliasKey.phoneticCompact === canonicalQueryKeys.phoneticCompact) aliasBoost = Math.max(aliasBoost, 990);
          if (aliasKey.normalized.startsWith(queryKeys.normalized)) aliasBoost = Math.max(aliasBoost, 760);
          if (aliasKey.compact.startsWith(queryKeys.compact)) aliasBoost = Math.max(aliasBoost, 720);
          if (aliasKey.phoneticCompact.startsWith(queryKeys.phoneticCompact)) aliasBoost = Math.max(aliasBoost, 700);
          if (aliasKey.normalized.includes(queryKeys.normalized)) aliasBoost = Math.max(aliasBoost, 560);
          if (aliasKey.compact.includes(queryKeys.compact)) aliasBoost = Math.max(aliasBoost, 520);
          if (aliasKey.phoneticCompact.includes(queryKeys.phoneticCompact)) aliasBoost = Math.max(aliasBoost, 500);

          const aliasTokenHits = queryKeys.tokens.filter((token) =>
            aliasKey.tokens.some((aliasToken) => {
              if (aliasToken === token) return true;
              if (aliasToken.includes(token) || token.includes(aliasToken)) return true;
              return levenshtein(aliasToken, token) <= 1;
            }),
          ).length;
          aliasBoost = Math.max(aliasBoost, aliasTokenHits * 145);

          const currentAliasDistance = levenshtein(aliasKey.compact, queryKeys.compact);
          const currentAliasMaxLength = Math.max(aliasKey.compact.length, queryKeys.compact.length, 1);
          aliasSimilarity = Math.max(aliasSimilarity, 1 - currentAliasDistance / currentAliasMaxLength);
          const currentCanonicalAliasDistance = levenshtein(aliasKey.compact, canonicalQueryKeys.compact);
          const currentCanonicalAliasMaxLength = Math.max(aliasKey.compact.length, canonicalQueryKeys.compact.length, 1);
          aliasSimilarity = Math.max(aliasSimilarity, 1 - currentCanonicalAliasDistance / currentCanonicalAliasMaxLength);

          const currentAliasPhoneticDistance = levenshtein(aliasKey.phoneticCompact, queryKeys.phoneticCompact);
          const currentAliasPhoneticMaxLength = Math.max(aliasKey.phoneticCompact.length, queryKeys.phoneticCompact.length, 1);
          aliasPhoneticSimilarity = Math.max(
            aliasPhoneticSimilarity,
            1 - currentAliasPhoneticDistance / currentAliasPhoneticMaxLength,
          );
          const currentCanonicalAliasPhoneticDistance = levenshtein(aliasKey.phoneticCompact, canonicalQueryKeys.phoneticCompact);
          const currentCanonicalAliasPhoneticMaxLength = Math.max(aliasKey.phoneticCompact.length, canonicalQueryKeys.phoneticCompact.length, 1);
          aliasPhoneticSimilarity = Math.max(
            aliasPhoneticSimilarity,
            1 - currentCanonicalAliasPhoneticDistance / currentCanonicalAliasPhoneticMaxLength,
          );
        }

        score += aliasBoost;
        score += Math.round(aliasSimilarity * 240);
        score += Math.round(aliasPhoneticSimilarity * 280);

        if (availableStock > 0) {
          score += Math.min(availableStock, 25);
        }

        if (score === 0) return null;

        return {
          product,
          score,
          nameLength: productName.length,
          similarity: Math.max(similarity, canonicalSimilarity, aliasSimilarity),
          phoneticSimilarity: Math.max(phoneticSimilarity, canonicalPhoneticSimilarity, aliasPhoneticSimilarity),
          availableStock,
        };
      })
      .filter(
        (entry): entry is {
          product: any;
          score: number;
          nameLength: number;
          similarity: number;
          phoneticSimilarity: number;
          availableStock: number;
        } => entry !== null,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.phoneticSimilarity - a.phoneticSimilarity ||
          b.similarity - a.similarity ||
          b.availableStock - a.availableStock ||
          a.nameLength - b.nameLength,
      );

    if (rankedMatches.length === 0) return null;
    if (rankedMatches.length === 1) return rankedMatches[0].product;

    const [best, second] = rankedMatches;
    if (best.similarity >= 0.76 || best.phoneticSimilarity >= 0.8) return best.product;
    if (best.score >= second.score + 70) return best.product;
    if (best.score >= 700 && best.score >= Math.round(second.score * 1.12)) return best.product;

    return null;
  };

  const addExistingProductToCartByVoice = (product: any, quantity = 1) => {
    const unitConfig = {
      primaryUnit: product.primaryUnit,
      secondaryUnit: product.secondaryUnit,
      unitConversion: product.unitConversion,
    };
    const defaultUnit = getDefaultSalesUnit(unitConfig);
    const basePrice = Number(product.price || 0);
    const baseCostPrice = Number(product.costPrice || 0);
    const defaultPrice = deriveUnitPriceFromBase(basePrice, unitConfig, defaultUnit);

    if (defaultPrice <= 0) {
      setPendingProduct({
        productId: product.id,
        name: product.name,
        price: defaultPrice.toString(),
        quantity: quantity.toString(),
        baseCostPrice,
        unit: defaultUnit,
        primaryUnit: getPrimaryUnit(unitConfig),
        secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
        unitConversion: product.unitConversion ?? null,
      });
      return false;
    }

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
            ? { ...item, quantity: item.quantity + quantity }
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
          quantity,
          unit: defaultUnit,
          primaryUnit: getPrimaryUnit(unitConfig),
          secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
          unitConversion: product.unitConversion ?? null,
        },
      ];
    });
    setSearchTerm("");
    return true;
  };

  const createCartItemFromProduct = (
    product: any,
    quantity: number,
    requestedUnit?: UnitOption | null,
  ): CartItem => {
    const unitConfig = {
      primaryUnit: product.primaryUnit,
      secondaryUnit: product.secondaryUnit,
      unitConversion: product.unitConversion,
    };
    const availableUnits = new Set<UnitOption>([
      getPrimaryUnit(unitConfig),
      ...(hasSecondaryUnit(unitConfig) ? [product.secondaryUnit as UnitOption] : []),
    ]);
    const defaultUnit = getDefaultSalesUnit(unitConfig);
    const unit = requestedUnit && availableUnits.has(requestedUnit) ? requestedUnit : defaultUnit;
    const basePrice = Number(product.price || 0);
    const baseCostPrice = Number(product.costPrice || 0);

    return {
      tempId: crypto.randomUUID(),
      productId: product.id,
      name: product.name,
      price: deriveUnitPriceFromBase(basePrice, unitConfig, unit),
      basePrice,
      costPrice: deriveUnitPriceFromBase(baseCostPrice, unitConfig, unit),
      baseCostPrice,
      quantity,
      unit,
      primaryUnit: getPrimaryUnit(unitConfig),
      secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
      unitConversion: product.unitConversion ?? null,
    };
  };

  const mergeCartItems = (existingCart: CartItem[], itemsToAdd: CartItem[]) => {
    const nextCart = [...existingCart];

    for (const nextItem of itemsToAdd) {
      const existingIndex = nextCart.findIndex(
        (item) =>
          item.productId === nextItem.productId &&
          item.name.trim().toLowerCase() === nextItem.name.trim().toLowerCase() &&
          item.unit === nextItem.unit &&
          Math.abs(item.price - nextItem.price) < 0.0001,
      );

      if (existingIndex >= 0) {
        nextCart[existingIndex] = {
          ...nextCart[existingIndex],
          quantity: nextCart[existingIndex].quantity + nextItem.quantity,
        };
      } else {
        nextCart.push(nextItem);
      }
    }

    return nextCart;
  };

  const addPreviousBillItemsToCart = async () => {
    if (!selectedCustomer) {
      toast({
        title: "Select customer",
        description: "Choose the customer first, then use Previous Bill.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingPreviousBill(true);
    try {
      const previousBill = await fetchPreviousBill(selectedCustomer);

      if (!previousBill || previousBill.items.length === 0) {
        toast({
          title: "No previous bill",
          description: "This customer does not have an earlier completed bill.",
          variant: "destructive",
        });
        return;
      }

      const itemsToAdd: CartItem[] = previousBill.items.map((item) => {
        const unit = UNIT_OPTIONS.includes(item.unit as UnitOption) ? (item.unit as UnitOption) : "PCS";
        const matchedProduct = products?.find((product) => product.id === item.productId);
        const quantity = Math.max(1, Number(item.quantity || 1));
        const price = Math.max(0, Number(item.price || 0));

        if (matchedProduct) {
          const unitConfig = {
            primaryUnit: matchedProduct.primaryUnit,
            secondaryUnit: matchedProduct.secondaryUnit,
            unitConversion: matchedProduct.unitConversion,
          };
          const baseCostPrice = Number(matchedProduct.costPrice || 0);
          const costPrice = deriveUnitPriceFromBase(baseCostPrice, unitConfig, unit);

          return {
            tempId: crypto.randomUUID(),
            productId: matchedProduct.id,
            name: item.name,
            price,
            basePrice: normalizeUnitPriceToBase(price, unitConfig, unit),
            costPrice,
            baseCostPrice,
            quantity,
            unit,
            primaryUnit: getPrimaryUnit(unitConfig),
            secondaryUnit: hasSecondaryUnit(unitConfig) ? (matchedProduct.secondaryUnit as UnitOption) : null,
            unitConversion: matchedProduct.unitConversion ?? null,
          };
        }

        return {
          tempId: crypto.randomUUID(),
          productId: item.productId ?? undefined,
          name: item.name,
          price,
          basePrice: price,
          costPrice: Math.max(0, Number(item.costPrice || 0)),
          baseCostPrice: Math.max(0, Number(item.costPrice || 0)),
          quantity,
          unit,
          primaryUnit: unit,
          secondaryUnit: null,
          unitConversion: null,
        };
      });

      setCart((prev) => mergeCartItems(prev, itemsToAdd));
      toast({
        title: "Previous bill added",
        description: `${itemsToAdd.length} item${itemsToAdd.length === 1 ? "" : "s"} copied into this bill.`,
      });
    } catch (error) {
      toast({
        title: "Could not load previous bill",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPreviousBill(false);
    }
  };

  const addBulkItemsToCart = () => {
    const lines = bulkAddText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast({ title: "Nothing to add", description: "Paste one item per line.", variant: "destructive" });
      return;
    }

    const itemsToAdd: CartItem[] = [];
    let matchedProducts = 0;
    let customItems = 0;
    let selectedCustomerName: string | null = null;

    for (const line of lines) {
      const parsed = parseBulkItemLine(line);

      if (!parsed) {
        const customer = findCustomerByVoice(line);
        if (customer) {
          setSelectedCustomer(customer.id);
          selectedCustomerName = customer.name;
        } else {
          itemsToAdd.push({
            tempId: crypto.randomUUID(),
            name: line,
            price: 0,
            basePrice: 0,
            costPrice: 0,
            baseCostPrice: 0,
            quantity: 1,
            unit: "PCS",
            primaryUnit: "PCS",
            secondaryUnit: null,
            unitConversion: null,
          });
          customItems += 1;
        }
        continue;
      }

      const product = findProductByVoice(parsed.name);

      if (product) {
        itemsToAdd.push(createCartItemFromProduct(product, parsed.quantity, parsed.unit));
        matchedProducts += 1;
        continue;
      }

      const unit = parsed.unit ?? "PCS";
      itemsToAdd.push({
        tempId: crypto.randomUUID(),
        name: parsed.name,
        price: 0,
        basePrice: 0,
        costPrice: 0,
        baseCostPrice: 0,
        quantity: parsed.quantity,
        unit,
        primaryUnit: unit,
        secondaryUnit: null,
        unitConversion: null,
      });
      customItems += 1;
    }

    if (itemsToAdd.length === 0) {
      toast({
        title: "No items found",
        description: "Paste item, quantity, and unit.",
        variant: "destructive",
      });
      return;
    }

    setCart((prev) => mergeCartItems(prev, itemsToAdd));
    setSearchTerm("");
    setBulkAddText("");
    setIsBulkAddOpen(false);

    const descriptionParts = [
      `${itemsToAdd.length} item${itemsToAdd.length === 1 ? "" : "s"} added`,
      matchedProducts > 0 ? `${matchedProducts} matched product${matchedProducts === 1 ? "" : "s"}` : null,
      customItems > 0 ? `${customItems} custom row${customItems === 1 ? "" : "s"} need selling and cost price` : null,
      selectedCustomerName ? `customer set to ${selectedCustomerName}` : null,
    ].filter(Boolean);

    toast({
      title: "Bulk items added",
      description: descriptionParts.join(". "),
    });
  };

  const billingVoiceCommands = useMemo(
    () => [
      {
        label: "Billing shortcuts",
        examples: ["bill to pulav and besan and mirchi and save", "pulav besan mirchi save"],
        run: ({ raw, normalized }: { raw: string; normalized: string }) => {
          let nextCustomerId = selectedCustomer;
          let nextCart = [...cart];
          let nextPaidAmount = paidAmount;
          let shouldSave = false;
          let shouldOpenPayment = false;

          const addProductLocally = (product: any, quantity = 1) => {
            const unitConfig = {
              primaryUnit: product.primaryUnit,
              secondaryUnit: product.secondaryUnit,
              unitConversion: product.unitConversion,
            };
            const defaultUnit = getDefaultSalesUnit(unitConfig);
            const basePrice = Number(product.price || 0);
            const baseCostPrice = Number(product.costPrice || 0);
            const defaultPrice = deriveUnitPriceFromBase(basePrice, unitConfig, defaultUnit);

            if (defaultPrice <= 0) {
              setPendingProduct({
                productId: product.id,
                name: product.name,
                price: defaultPrice.toString(),
                quantity: quantity.toString(),
                baseCostPrice,
                unit: defaultUnit,
                primaryUnit: getPrimaryUnit(unitConfig),
                secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
                unitConversion: product.unitConversion ?? null,
              });
              return false;
            }

            nextCart = [
              ...nextCart,
              {
                tempId: crypto.randomUUID(),
                productId: product.id,
                name: product.name,
                price: defaultPrice,
                basePrice,
                costPrice: deriveUnitPriceFromBase(baseCostPrice, unitConfig, defaultUnit),
                baseCostPrice,
                quantity,
                unit: defaultUnit,
                primaryUnit: getPrimaryUnit(unitConfig),
                secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
                unitConversion: product.unitConversion ?? null,
              },
            ];
            return true;
          };

          const processStep = (stepRaw: string, stepNormalized: string): string | null => {
            const parsedLine = parseBillingLineCommand(stepRaw);
            if (parsedLine) {
              const product = findProductByVoice(parsedLine.productName);
              if (!product) return `I could not find ${parsedLine.productName} in products.`;

              const unitConfig = {
                primaryUnit: product.primaryUnit,
                secondaryUnit: product.secondaryUnit,
                unitConversion: product.unitConversion,
              };
              const unit = parsedLine.unit || getDefaultSalesUnit(unitConfig);
              const baseSellPrice =
                parsedLine.sellingPrice != null
                  ? normalizeUnitPriceToBase(parsedLine.sellingPrice, unitConfig, unit)
                  : Number(product.price || 0);
              const baseCostPrice =
                parsedLine.costPrice != null
                  ? normalizeUnitPriceToBase(parsedLine.costPrice, unitConfig, unit)
                  : Number(product.costPrice || 0);

              nextCart = [
                ...nextCart,
                {
                  tempId: crypto.randomUUID(),
                  productId: product.id,
                  name: product.name,
                  price: deriveUnitPriceFromBase(baseSellPrice, unitConfig, unit),
                  basePrice: baseSellPrice,
                  costPrice: deriveUnitPriceFromBase(baseCostPrice, unitConfig, unit),
                  baseCostPrice,
                  quantity: parsedLine.quantity,
                  unit,
                  primaryUnit: getPrimaryUnit(unitConfig),
                  secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
                  unitConversion: product.unitConversion ?? null,
                },
              ];
              return `${product.name} added.`;
            }

            if (["save", "save bill", "complete bill", "complete order"].includes(stepNormalized)) {
              if (nextCart.length === 0) return "The current bill is empty.";
              shouldSave = true;
              return "Ready to save bill.";
            }

            if (["open payment", "checkout"].includes(stepNormalized)) {
              if (nextCart.length === 0) return "The current bill is empty.";
              shouldOpenPayment = true;
              return "Ready to open payment.";
            }

            const customerMatch = stepNormalized.match(/^(customer|select customer|bill to|to)\s+(.+)$/);
            if (customerMatch) {
              const customer = findCustomerByVoice(customerMatch[2].trim());
              if (!customer) return `I could not uniquely match ${customerMatch[2].trim()}.`;
              nextCustomerId = customer.id;
              return `Selected customer ${customer.name}.`;
            }

            const paidMatch = stepNormalized.match(/^(paid|amount received)\s+(.+)$/);
            if (paidMatch) {
              const amount = parseSpokenAmount(paidMatch[2]);
              if (amount == null) return "I could not understand that amount.";
              nextPaidAmount = String(amount);
              return `Paid amount set to ${amount}.`;
            }

            if (stepNormalized.startsWith("search ") || stepNormalized.startsWith("find ")) {
              const query = stepNormalized.replace(/^(search|find)\s+/, "").trim();
              setSearchTerm(query);
              return `Searching for ${query}.`;
            }

            const product = findProductByVoice(stepRaw);
            if (product) {
              const added = addProductLocally(product, 1);
              return added ? `${product.name} added.` : `${product.name} needs price confirmation.`;
            }

            return null;
          };

          const sequenceParts = normalized
            .split(/\s+(?:and|then)\s+|,\s*/)
            .map((part) => part.trim())
            .filter(Boolean);

          if (sequenceParts.length > 1) {
            const stepMessages: string[] = [];
            for (const part of sequenceParts) {
              const result = processStep(part, part);
              if (!result) return null;
              stepMessages.push(result);
            }

            setSelectedCustomer(nextCustomerId);
            setCart(nextCart);
            setPaidAmount(nextPaidAmount);
            if (shouldOpenPayment) {
              setIsPaymentOpen(true);
            }
            if (shouldSave) {
              submitBill(Number(nextPaidAmount || 0), nextCart, nextCustomerId ?? undefined);
            }
            return stepMessages.join(" ");
          }

          const compactParts = normalized.split(" ").filter(Boolean);
          if (compactParts.length >= 3 && compactParts[compactParts.length - 1] === "save") {
            const customer = findCustomerByVoice(compactParts[0]);
            if (!customer) return null;
            nextCustomerId = customer.id;
            const productNames = compactParts.slice(1, -1);
            const stepMessages = [`Selected customer ${customer.name}.`];
            for (const productName of productNames) {
              const product = findProductByVoice(productName);
              if (!product) return `I could not find ${productName} in products.`;
              const added = addProductLocally(product, 1);
              stepMessages.push(added ? `${product.name} added.` : `${product.name} needs price confirmation.`);
            }
            setSelectedCustomer(nextCustomerId);
            setCart(nextCart);
            submitBill(Number(nextPaidAmount || 0), nextCart, nextCustomerId ?? undefined);
            stepMessages.push("Saving bill now.");
            return stepMessages.join(" ");
          }

          return null;
        },
      },
      {
        label: "Add bill item",
        examples: ["besan 5kg", "mirchi 2 kg 140", "besan 5 kg selling price 80"],
        run: ({ raw }: { raw: string; normalized: string }) => {
          const parsed = parseBillingLineCommand(raw);
          if (!parsed) return null;

          const product = findProductByVoice(parsed.productName);

          if (!product) {
            return `I could not find ${parsed.productName} in products. Use Custom Item if it is new.`;
          }

          const unitConfig = {
            primaryUnit: product.primaryUnit,
            secondaryUnit: product.secondaryUnit,
            unitConversion: product.unitConversion,
          };
          const unit = parsed.unit || getDefaultSalesUnit(unitConfig);
          const baseSellPrice =
            parsed.sellingPrice != null
              ? normalizeUnitPriceToBase(parsed.sellingPrice, unitConfig, unit)
              : Number(product.price || 0);
          const baseCostPrice =
            parsed.costPrice != null
              ? normalizeUnitPriceToBase(parsed.costPrice, unitConfig, unit)
              : Number(product.costPrice || 0);

          setCart((prev) => [
            ...prev,
            {
              tempId: crypto.randomUUID(),
              productId: product.id,
              name: product.name,
              price: deriveUnitPriceFromBase(baseSellPrice, unitConfig, unit),
              basePrice: baseSellPrice,
              costPrice: deriveUnitPriceFromBase(baseCostPrice, unitConfig, unit),
              baseCostPrice,
              quantity: parsed.quantity,
              unit,
              primaryUnit: getPrimaryUnit(unitConfig),
              secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
              unitConversion: product.unitConversion ?? null,
            },
          ]);
          return `${product.name} added to bill.`;
        },
      },
      {
        label: "Add product by name",
        examples: ["besan", "allam paste", "b e s a n"],
        run: ({ raw, normalized }: { raw: string; normalized: string }) => {
          const tokens = normalized.split(" ").filter(Boolean);
          const looksLikeSpelledLetters = tokens.length > 1 && tokens.every((token) => token.length === 1);
          const reservedPrefixes = [
            "search ",
            "find ",
            "customer ",
            "select customer ",
            "bill to ",
            "to ",
            "paid ",
            "amount received ",
            "date ",
            "bill date ",
            "open ",
            "create product ",
            "add product ",
          ];
          const reservedCommands = new Set([
            "save",
            "save bill",
            "complete bill",
            "complete order",
            "open payment",
            "checkout",
            "cancel bill",
            "clear bill",
          ]);

          if (!normalized) return null;
          if (!looksLikeSpelledLetters) {
            if (reservedCommands.has(normalized)) return null;
            if (reservedPrefixes.some((prefix) => normalized.startsWith(prefix))) return null;
          }

          const product = findProductByVoice(looksLikeSpelledLetters ? raw : normalized);
          if (!product) return null;
          const added = addExistingProductToCartByVoice(product, 1);
          return added
            ? `${product.name} added to bill.`
            : `${product.name} needs a price confirmation before adding.`;
        },
      },
      {
        label: "Search products",
        examples: ["search rice", "find besan"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^(search|find)\s+(.+)$/);
          if (!match) return null;
          setSearchTerm(match[2].trim());
          return `Searching for ${match[2].trim()}.`;
        },
      },
      {
        label: "Select customer",
        examples: ["customer pulav", "bill to famous"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^(customer|select customer|bill to|to)\s+(.+)$/);
          if (!match) return null;
          const customer = findCustomerByVoice(match[2].trim());
          if (!customer) return `I could not uniquely match ${match[2].trim()}. Please use the customer dropdown.`;
          setSelectedCustomer(customer.id);
          return `Selected customer ${customer.name}.`;
        },
      },
      {
        label: "Set paid amount",
        examples: ["paid 5000", "amount received 2500"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^(paid|amount received)\s+(.+)$/);
          if (!match) return null;
          const amount = parseSpokenAmount(match[2]);
          if (amount == null) return "I could not understand that amount.";
          setPaidAmount(String(amount));
          return `Paid amount set to ${amount}.`;
        },
      },
      {
        label: "Set bill date",
        examples: ["date 2026-04-01", "bill date 2026-04-01"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          const match = normalized.match(/^(date|bill date)\s+(\d{4}-\d{2}-\d{2})$/);
          if (!match) return null;
          try {
            setBillDate(parseISTDateOnly(match[2]));
            setBillDateManuallyChanged(true);
            return `Bill date set to ${match[2]}.`;
          } catch {
            return "That date format looks invalid.";
          }
        },
      },
      {
        label: "Open payment",
        examples: ["open payment", "checkout", "save"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          if (!["open payment", "checkout"].includes(normalized)) return null;
          if (cart.length === 0) return "The current bill is empty.";
          handleCheckout();
          return "Opening payment.";
        },
      },
      {
        label: "Save bill directly",
        examples: ["save", "save bill", "complete bill"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          if (!["save", "save bill", "complete bill", "complete order"].includes(normalized)) return null;
          if (cart.length === 0) return "The current bill is empty.";
          submitBill(Number(paidAmount || 0));
          return "Saving bill now.";
        },
      },
      {
        label: "Cancel bill",
        examples: ["cancel bill", "clear bill"],
        run: ({ normalized }: { raw: string; normalized: string }) => {
          if (!["cancel bill", "clear bill"].includes(normalized)) return null;
          setConfirmCancelOpen(true);
          return "Opening cancel confirmation.";
        },
      },
    ],
      [cart, customers, paidAmount, products, selectedCustomer],
    );


  const filteredProducts = useMemo(() => {
    if (!products || !searchTerm) return products || [];
    const lower = searchTerm.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(lower));
  }, [products, searchTerm]);

  const cartStockUsageByProductId = useMemo(() => {
    const usage = new Map<number, number>();

    for (const item of cart) {
      if (!item.productId) continue;
      const usedQuantity = toBaseQuantity(
        item.quantity,
        {
          primaryUnit: item.primaryUnit,
          secondaryUnit: item.secondaryUnit,
          unitConversion: item.unitConversion,
        },
        item.unit,
      );
      usage.set(item.productId, (usage.get(item.productId) ?? 0) + usedQuantity);
    }

    return usage;
  }, [cart]);

  const openProductPriceDialog = async (product: any) => {
    const unitConfig = {
      primaryUnit: product.primaryUnit,
      secondaryUnit: product.secondaryUnit,
      unitConversion: product.unitConversion,
    };
    const defaultUnit = getDefaultSalesUnit(unitConfig);
    const basePrice = Number(product.price || 0);
    const baseCostPrice = Number(product.costPrice || 0);
    const defaultPrice = deriveUnitPriceFromBase(basePrice, unitConfig, defaultUnit);
    const rememberedItem =
      selectedCustomer != null
        ? await fetchLastBilledItemMemory({ customerId: selectedCustomer, productId: product.id }).catch(() => null)
        : null;
    const rememberedUnit =
      rememberedItem && UNIT_OPTIONS.includes(rememberedItem.unit as UnitOption)
        ? (rememberedItem.unit as UnitOption)
        : defaultUnit;
    const rememberedPrice = rememberedItem?.price ?? defaultPrice;
    const rememberedQuantity = rememberedItem?.quantity ?? 1;
    const rememberedCostPrice = baseCostPrice;

    if (rememberedPrice > 0) {
      setCart(prev => {
        const existing = prev.find((item) =>
          item.productId === product.id &&
          item.unit === rememberedUnit &&
          Math.abs(item.price - rememberedPrice) < 0.0001
        );
        if (existing) {
          return prev.map(item =>
            item.productId === product.id &&
            item.unit === rememberedUnit &&
            Math.abs(item.price - rememberedPrice) < 0.0001
              ? { ...item, quantity: item.quantity + rememberedQuantity }
              : item
          );
        }

        return [...prev, {
          tempId: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          price: rememberedPrice,
          basePrice: normalizeUnitPriceToBase(rememberedPrice, unitConfig, rememberedUnit),
          costPrice: deriveUnitPriceFromBase(rememberedCostPrice, unitConfig, rememberedUnit),
          baseCostPrice: rememberedCostPrice,
          quantity: rememberedQuantity,
          unit: rememberedUnit,
          primaryUnit: getPrimaryUnit(unitConfig),
          secondaryUnit: hasSecondaryUnit(unitConfig) ? (product.secondaryUnit as UnitOption) : null,
          unitConversion: product.unitConversion ?? null,
        }];
      });
      return;
    }

    setPendingProduct({
      productId: product.id,
      name: product.name,
      price: rememberedPrice.toString(),
      quantity: rememberedQuantity.toString(),
      baseCostPrice: rememberedCostPrice,
      unit: rememberedUnit,
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
    const nextQuantity = Math.max(1, Number(pendingProduct.quantity || 1));
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
            ? { ...item, quantity: item.quantity + nextQuantity } 
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
        quantity: nextQuantity,
        unit: pendingProduct.unit,
        primaryUnit: pendingProduct.primaryUnit,
        secondaryUnit: pendingProduct.secondaryUnit ?? null,
        unitConversion: pendingProduct.unitConversion ?? null,
      }];
    });
    setPendingProduct(null);
  };

  const addCustomItem = () => {
    const trimmedName = customItem.name.trim();
    const price = Number(customItem.price);
    const costPrice = Number(customItem.costPrice);
    const quantity = normalizeQuantityInputForUnit(customItem.quantity || 1, customItem.unit);

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
      setCart(prev => [...prev, {
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
      }]);
      setCustomItem(createEmptyCustomItem());
      setAddCustomItemToProducts(false);
      setIsCustomItemOpen(false);
    };

    if (addCustomItemToProducts) {
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

  const updateQuantity = (tempId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const setQuantity = (tempId: string, quantity: number | string) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        const newQty = Math.max(1, normalizeQuantityInputForUnit(quantity, item.unit));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const setGramQuantityDraft = (tempId: string, value: string) => {
    setGramQuantityDrafts((current) => ({ ...current, [tempId]: value }));
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0 || value.endsWith(".")) return;
    setQuantity(tempId, value);
  };

  const clearGramQuantityDraft = (tempId: string) => {
    setGramQuantityDrafts((current) => {
      const next = { ...current };
      delete next[tempId];
      return next;
    });
  };

  const commitGramQuantityDraft = (tempId: string) => {
    const draft = gramQuantityDrafts[tempId];
    if (draft === undefined || draft.trim() === "") {
      clearGramQuantityDraft(tempId);
      return;
    }

    setQuantity(tempId, draft);
    clearGramQuantityDraft(tempId);
  };

  const openGramQuantityPicker = (tempId: string) => {
    const targetItem = cart.find((item) => item.tempId === tempId);
    if (!targetItem || targetItem.unit !== "GRAMS") return;
    setGramQuantityPickerItemId(tempId);
  };

  const applyGramQuantity = (quantity: number) => {
    if (!gramQuantityPickerItemId) return;
    setQuantity(gramQuantityPickerItemId, quantity);
    clearGramQuantityDraft(gramQuantityPickerItemId);
  };

  const applyCustomGramQuantity = (quantity: number) => {
    setCustomItem((current) => ({ ...current, quantity: quantity.toString() }));
  };

  const setCustomItemQuantity = (value: string) => {
    if (customItem.unit === "GRAMS") {
      setCustomItem((current) => ({ ...current, quantity: value }));
      return;
    }

    setCustomItem((current) => ({
      ...current,
      quantity: value,
    }));
  };

  const commitCustomGramQuantity = () => {
    if (customItem.unit !== "GRAMS") return;
    setCustomItem((current) => ({
      ...current,
      quantity: String(normalizeQuantityInputForUnit(current.quantity, "GRAMS")),
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

  const setCostPrice = (tempId: string, costPrice: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        const nextCostPrice = Math.max(0, costPrice);
        return {
          ...item,
          costPrice: nextCostPrice,
          baseCostPrice: normalizeUnitPriceToBase(
            nextCostPrice,
            {
              primaryUnit: item.primaryUnit,
              secondaryUnit: item.secondaryUnit,
              unitConversion: item.unitConversion,
            },
            item.unit,
          ),
        };
      }),
    );
  };

  const setCustomCartItemName = (tempId: string, name: string) => {
    setCart((prev) => prev.map((item) => (item.tempId === tempId ? { ...item, name } : item)));
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

    if (unit !== "GRAMS") {
      setGramQuantityPickerItemId((current) => (current === tempId ? null : current));
    }
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
    .filter((charge) => charge.label && Number.isFinite(charge.amountNumber));
  const nonRoundOffCharges = normalizedExtraCharges.filter(
    (charge) => charge.label.toLowerCase() !== ROUND_OFF_LABEL.toLowerCase(),
  );
  const baseExtraChargesTotal = nonRoundOffCharges.reduce((sum, charge) => sum + charge.amountNumber, 0);
  const baseBillTotal = cartTotal + baseExtraChargesTotal;
  const baseGrandTotal = baseBillTotal + oldBalance;
  const extraChargesTotal = normalizedExtraCharges.reduce((sum, charge) => sum + charge.amountNumber, 0);
  const billTotal = cartTotal + extraChargesTotal;
  const grandTotal = billTotal + oldBalance;
  const hasDraftBill =
    cart.length > 0 ||
    extraCharges.length > 0 ||
    pendingProduct !== null ||
    customItem.name.trim().length > 0 ||
    customItem.price.trim().length > 0 ||
    customItem.costPrice.trim().length > 0 ||
    selectedCustomer !== null ||
    paidAmount.trim().length > 0;
  const billDateLabel = billDate ? formatDate(billDate, "PPP") : "Today";

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

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Empty Cart", description: "Add items before checkout", variant: "destructive" });
      return;
    }
    setPaidAmount("");
    setIsPaymentOpen(true);
  };

  const submitBill = (
    paymentOverride?: number,
    cartOverride?: CartItem[],
    customerOverride?: number,
  ) => {
    const billCart = cartOverride ?? cart;
    const billCustomerId = customerOverride ?? selectedCustomer ?? undefined;
    const payment = paymentOverride ?? Number(paidAmount);
    if (isNaN(payment) || payment < 0) return;
    if (billCart.length === 0) return;
    const appliedCustomer = (customers || []).find((customer) => customer.id === billCustomerId);
    const appliedOldBalance = Math.max(0, Number(appliedCustomer?.balance || 0));
    const appliedCartTotal = billCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const appliedGrandTotal = appliedCartTotal + extraChargesTotal + appliedOldBalance;
    const appliedPayment = payment;
  
      createBill({
        customerId: billCustomerId,
        items: billCart.map(i => ({
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
      paymentAccountId: appliedPayment > 0 ? paymentAccountId ?? undefined : undefined,
      date: billDate ? toISTDateTimeStringForApi(billDate) : undefined,
    }, {
      onSuccess: () => {
        toast({ title: "Bill Created", description: "Transaction saved successfully" });
        clearBillDraft();
      },
      onError: (error) => {
        toast({
          title: "Could not save bill",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="h-[calc(100vh-64px)] md:h-screen flex flex-col md:flex-row overflow-hidden bg-background">
      
      {/* Left: Cart Section */}
      <div className="flex-1 flex flex-col h-full border-r border-border relative z-0">
        <div className="p-3 border-b border-border bg-card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-display font-bold text-xl">Current Bill</h2>
          </div>
          
          {/* Customer Selector */}
          <div className="flex gap-2">
            <select 
              className="flex-1 h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedCustomer || ""}
              onChange={(e) => setSelectedCustomer(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Walk-in Customer</option>
              {customers?.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
            <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" title="New Customer">
              <UserPlus className="w-4 h-4" />
            </Button>
            <Popover open={isBillDatePickerOpen} onOpenChange={setIsBillDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-9 justify-start text-left font-normal shrink-0",
                    !billDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {billDateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={billDate}
                  onSelect={(date) => {
                    if (!date) return;
                    setBillDate(date);
                    setBillDateManuallyChanged(true);
                    setIsBillDatePickerOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
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
            [...cart].reverse().map((item, index) => (
              <div key={item.tempId} className="bg-card p-2.5 rounded-xl border border-border shadow-sm flex items-center justify-between group animate-in slide-in-from-left-2 duration-300">
                <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {cart.length - index}
                </div>
                <div className="flex-1">
                  {item.productId ? (
                    <h4 className="font-medium line-clamp-1">{item.name}</h4>
                  ) : (
                    <Input
                      value={item.name}
                      onChange={(e) => setCustomCartItemName(item.tempId, e.target.value)}
                      className="h-8 max-w-sm bg-background font-medium"
                      placeholder="Custom item name"
                    />
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>Selling Price</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={item.price}
                      onChange={(e) => setSellingPrice(item.tempId, Number(e.target.value) || 0)}
                      className="h-8 w-28 font-mono"
                      onFocus={(e) => e.target.select()}
                    />
                    <span>/ {item.unit}</span>
                    {!item.productId && (
                      <>
                        <span className="text-muted-foreground/60">|</span>
                        <span>Cost Price</span>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={item.costPrice}
                          onChange={(e) => setCostPrice(item.tempId, Number(e.target.value) || 0)}
                          className="h-8 w-28 font-mono"
                          onFocus={(e) => e.target.select()}
                        />
                        <span>/ {item.unit}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="font-bold font-mono text-sm">{formatCurrencyINR(item.price * item.quantity)}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-border rounded-lg bg-background">
                      <button 
                        onClick={() => updateQuantity(item.tempId, -1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted text-lg font-medium"
                      >-</button>
                      <Popover
                        open={gramQuantityPickerItemId === item.tempId}
                        onOpenChange={(open) => {
                          setGramQuantityPickerItemId(open ? item.tempId : null);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <div>
                            <Input
                              type="number"
                              min={item.unit === "GRAMS" ? "0" : "1"}
                              step="1"
                              value={item.unit === "GRAMS" ? gramQuantityDrafts[item.tempId] ?? item.quantity : item.quantity}
                              onChange={(e) =>
                                item.unit === "GRAMS"
                                  ? setGramQuantityDraft(item.tempId, e.target.value)
                                  : setQuantity(item.tempId, e.target.value)
                              }
                              className="w-12 h-8 text-center text-sm font-medium border-0 focus-visible:ring-0 p-0"
                              onFocus={(e) => {
                                e.target.select();
                                if (item.unit === "GRAMS") {
                                  openGramQuantityPicker(item.tempId);
                                }
                              }}
                              onBlur={() => {
                                if (item.unit === "GRAMS") {
                                  commitGramQuantityDraft(item.tempId);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (item.unit === "GRAMS" && e.key === "Enter") {
                                  e.preventDefault();
                                  commitGramQuantityDraft(item.tempId);
                                }
                              }}
                            />
                          </div>
                        </PopoverTrigger>
                        {item.unit === "GRAMS" && (
                          <PopoverContent side="top" align="center" className="w-auto p-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">Quick grams</div>
                            <div className="flex flex-wrap gap-2">
                              {GRAM_QUICK_OPTIONS.map((quantity) => (
                                <Button
                                  key={quantity}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => applyGramQuantity(quantity)}
                                >
                                  {quantity}g
                                </Button>
                              ))}
                            </div>
                          </PopoverContent>
                        )}
                      </Popover>
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
                      {getAvailableUnits({
                        primaryUnit: item.primaryUnit,
                        secondaryUnit: item.secondaryUnit,
                        unitConversion: item.unitConversion,
                      }).map((unit) => (
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
        <div className="p-3 bg-card border-t border-border shadow-up-lg z-10">
          <div className="space-y-2.5 mb-3">
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-2.5 text-sm">
              <div>
                <div className="text-[11px] text-muted-foreground">Bill Total</div>
                <div className="font-semibold font-mono">{formatCurrencyINR(billTotal)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Old Balance</div>
                <div className={cn("font-semibold font-mono", oldBalance > 0 ? "text-red-500" : "text-muted-foreground")}>
                  {formatCurrencyINR(oldBalance)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Grand Total</div>
                <div className="font-bold font-mono text-primary">{formatCurrencyINR(grandTotal)}</div>
              </div>
            </div>

            <Collapsible open={chargesOpen} onOpenChange={setChargesOpen}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  This Bill Total: <span className="font-semibold text-foreground">{formatCurrencyINR(cartTotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={applyRoundOff}>
                    Round Off
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-primary">
                      <Plus className="w-4 h-4 mr-1" /> {chargesOpen ? "Hide Charges" : "Extra Charges"}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>

              <CollapsibleContent className="space-y-2 pt-1">
                {extraCharges.map((charge) => (
                  <div key={charge.id} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
                    <Input
                      placeholder="Charge name"
                      value={charge.label}
                      onChange={(e) => updateExtraCharge(charge.id, "label", e.target.value)}
                      className="h-8"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={charge.amount}
                      onChange={(e) => updateExtraCharge(charge.id, "amount", e.target.value)}
                      className="h-8 font-mono"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeExtraCharge(charge.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex items-center gap-3">
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-primary" onClick={addExtraChargeRow}>
                    <Plus className="w-4 h-4 mr-2" /> Add Extra Charge
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-10 text-sm text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmCancelOpen(true)}
              disabled={!hasDraftBill}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 text-sm"
              onClick={addPreviousBillItemsToCart}
              disabled={!selectedCustomer || isLoadingPreviousBill}
              title={!selectedCustomer ? "Select a customer first" : "Copy items from this customer's previous bill"}
            >
              <History className="w-4 h-4 mr-2" />
              {isLoadingPreviousBill ? "Loading..." : "Previous"}
            </Button>
            <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-10 text-sm">
                  <ClipboardList className="w-4 h-4 mr-2" /> Bulk Add
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Items in Bulk</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="text-sm text-muted-foreground">
                    Paste one item per line. You can include a customer line, then items like "Besan 5 kgs" or "Zeera 250 grms".
                  </div>
                  <Textarea
                    value={bulkAddText}
                    onChange={(e) => setBulkAddText(e.target.value)}
                    placeholder={"99 Kirana\nBesan 5 kgs\nSujji rava 6 kgs\nZeera 250 grms"}
                    className="min-h-[220px] font-mono text-sm"
                    autoFocus
                  />
                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Matched products use saved product prices. Unmatched lines are added as custom rows with selling price 0 and cost price 0 so you can edit both before saving.
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsBulkAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={addBulkItemsToCart}>
                    Add Items
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
             <Dialog
               open={isCustomItemOpen}
               onOpenChange={(open) => {
                 setIsCustomItemOpen(open);
                 setAddCustomItemToProducts(false);
               }}
             >
             <DialogTrigger asChild>
                <Button variant="outline" className="h-10 text-sm">
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
                      <Input 
                        type="number" 
                        placeholder="Cost Price" 
                        value={customItem.costPrice} 
                        onChange={e => setCustomItem({...customItem, costPrice: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={customItem.unit}
                        onChange={(e) => {
                          const nextUnit = e.target.value as UnitOption;
                          setCustomItem({ ...customItem, unit: nextUnit });
                          if (nextUnit !== "GRAMS") {
                            setIsCustomGramPickerOpen(false);
                          }
                        }}
                      >
                        {UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <Popover open={isCustomGramPickerOpen} onOpenChange={setIsCustomGramPickerOpen}>
                        <PopoverTrigger asChild>
                          <div>
                            <Input 
                              type="number" 
                              placeholder="Qty" 
                              value={customItem.quantity} 
                              onChange={(e) => setCustomItemQuantity(e.target.value)}
                              onFocus={(e) => {
                                e.target.select();
                                if (customItem.unit === "GRAMS") {
                                  setIsCustomGramPickerOpen(true);
                                }
                              }}
                              onBlur={commitCustomGramQuantity}
                              onKeyDown={(e) => {
                                if (customItem.unit === "GRAMS" && e.key === "Enter") {
                                  e.preventDefault();
                                  commitCustomGramQuantity();
                                }
                              }}
                            />
                          </div>
                        </PopoverTrigger>
                        {customItem.unit === "GRAMS" && (
                          <PopoverContent side="top" align="center" className="w-auto p-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">Quick grams</div>
                            <div className="flex flex-wrap gap-2">
                              {GRAM_QUICK_OPTIONS.map((quantity) => (
                                <Button
                                  key={quantity}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => applyCustomGramQuantity(quantity)}
                                >
                                  {quantity}g
                                </Button>
                              ))}
                            </div>
                          </PopoverContent>
                        )}
                      </Popover>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={addCustomItemToProducts}
                        onChange={(e) => setAddCustomItemToProducts(e.target.checked)}
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
              className="h-10 text-sm font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
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
                  const baseUnit = getBaseUnit(unitConfig);
                  const primaryUnit = getPrimaryUnit(unitConfig);
                    const isWeightDisplayInKg =
                      baseUnit === "GRAMS" || (!hasSecondaryUnit(unitConfig) && primaryUnit === "GRAMS");
                    const defaultUnit = isWeightDisplayInKg ? "KG" : getDefaultSalesUnit(unitConfig);
                    const displayPrice = isWeightDisplayInKg
                      ? Number(product.price || 0) * 1000
                      : deriveUnitPriceFromBase(Number(product.price || 0), unitConfig, defaultUnit);
                    const remainingStock = Math.max(
                      0,
                      Number(product.stock || 0) - (cartStockUsageByProductId.get(product.id) ?? 0),
                    );
                    const stockLabel = formatStockAvailability(
                      remainingStock,
                      isWeightDisplayInKg ? "KG" : baseUnit,
                      baseUnit,
                    );
                    return (
                      <>
                        <div className="font-medium text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">{product.name}</div>
                        <div className="mt-auto font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                          <div className="flex items-baseline gap-1.5">
                            <span>{formatCurrencyINR(displayPrice)} / {defaultUnit}</span>
                            <span className="text-[10px] font-medium text-primary/70">Stock {stockLabel}</span>
                          </div>
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
                    step="1"
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={pendingProduct.quantity}
                    onChange={(e) =>
                      setPendingProduct((current) =>
                        current ? { ...current, quantity: e.target.value } : current,
                      )
                    }
                    onFocus={(e) => e.target.select()}
                    className="h-12 text-lg font-mono"
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

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all items, charges, selected customer, and the saved draft for the current bill.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Billing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={clearBillDraft}
            >
              Cancel Bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VoiceAssistant
        title="Billing Voice Helper"
        subtitle="Speak short commands to search, choose customer, set amount, or open payment."
        commands={billingVoiceCommands}
      />

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
                    step="0.01"
                    min="0"
                    className="pl-10 h-12 text-lg font-mono"
                    value={paidAmount}
                    placeholder="0 if not received"
                    onChange={(e) => setPaidAmount(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave this blank if no money was received. Only the amount entered here will be recorded as received.
                </p>
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
              {Number(paidAmount) > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Add Received Amount To Account</label>
                  <select
                    className="h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={paymentAccountId ?? ""}
                    onChange={(e) => setPaymentAccountId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Do not add to account</option>
                    {(accounts || []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    If selected, the received amount will be added into that account with a note like customer money.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Bill Date (Optional)</label>
                <Popover open={isPaymentBillDatePickerOpen} onOpenChange={setIsPaymentBillDatePickerOpen}>
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
                      {billDate ? formatDate(billDate, "PPP") : <span>Pick a date (defaults to today)</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={billDate}
                      onSelect={(date) => {
                        if (!date) return;
                        setBillDate(date);
                        setBillDateManuallyChanged(true);
                        setIsPaymentBillDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => {
                setIsPaymentOpen(false);
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
