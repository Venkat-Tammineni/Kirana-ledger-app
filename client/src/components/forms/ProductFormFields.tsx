import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deriveUnitPriceFromBase,
  getAvailableUnits,
  getBaseUnit,
  getPrimaryUnit,
  getUnitMultiplierToBase,
  hasSecondaryUnit,
  normalizeUnitPriceToBase,
  UNIT_OPTIONS,
  type UnitOption,
} from "@shared/units";

export type ProductDraft = {
  name: string;
  price: string;
  priceInputUnit: UnitOption;
  costPrice: string;
  costPriceInputUnit: UnitOption;
  primaryUnit: UnitOption;
  hasSecondaryUnit: boolean;
  secondaryUnit: UnitOption;
  unitConversion: string;
  sku: string;
  stock: string;
  stockInputUnit: UnitOption;
  lowStockThreshold: string;
};

type Props = {
  value: ProductDraft;
  onChange: (next: ProductDraft) => void;
  onStockChange?: () => void;
  onLowStockThresholdChange?: () => void;
  onStockInputUnitChange?: () => void;
};

function getFirstDifferentUnit(unit: UnitOption): UnitOption {
  return UNIT_OPTIONS.find((option) => option !== unit) || "PCS";
}

function formatConvertedNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(3)).toString();
}

function convertUnitPrice(value: string, unitConfig: Parameters<typeof normalizeUnitPriceToBase>[1], fromUnit: UnitOption, toUnit: UnitOption): string {
  if (value.trim() === "") return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;

  const basePrice = normalizeUnitPriceToBase(numericValue, unitConfig, fromUnit);
  return formatConvertedNumber(deriveUnitPriceFromBase(basePrice, unitConfig, toUnit));
}

function convertQuantity(value: string, unitConfig: Parameters<typeof getUnitMultiplierToBase>[0], fromUnit: UnitOption, toUnit: UnitOption): string {
  if (value.trim() === "") return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;

  const baseQuantity = numericValue * getUnitMultiplierToBase(unitConfig, fromUnit);
  const nextMultiplier = getUnitMultiplierToBase(unitConfig, toUnit);
  if (!nextMultiplier) return value;

  return formatConvertedNumber(baseQuantity / nextMultiplier);
}

export function ProductFormFields({
  value,
  onChange,
  onStockChange,
  onLowStockThresholdChange,
  onStockInputUnitChange,
}: Props) {
  const unitConfig = {
    primaryUnit: value.primaryUnit,
    secondaryUnit: value.hasSecondaryUnit ? value.secondaryUnit : null,
    unitConversion: value.hasSecondaryUnit ? Number(value.unitConversion || 0) : null,
  };
  const showSecondary = hasSecondaryUnit(unitConfig);
  const primaryUnit = getPrimaryUnit(unitConfig);
  const baseUnit = getBaseUnit(unitConfig);
  const availableUnits = getAvailableUnits(unitConfig);

  return (
    <div className="space-y-3 py-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Product Name</label>
          <Input
            placeholder="e.g. Rice Bag"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">SKU (Optional)</label>
          <Input
            placeholder="Barcode"
            value={value.sku}
            onChange={(e) => onChange({ ...value, sku: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Unit Setup</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Secondary Unit</span>
            <Switch
              checked={value.hasSecondaryUnit}
                onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  hasSecondaryUnit: checked,
                  secondaryUnit: checked
                    ? value.secondaryUnit === value.primaryUnit
                      ? getFirstDifferentUnit(value.primaryUnit)
                      : value.secondaryUnit
                    : value.secondaryUnit,
                  unitConversion: checked ? value.unitConversion || "2" : "",
                  priceInputUnit: checked ? value.priceInputUnit : value.primaryUnit,
                  costPriceInputUnit: checked ? value.costPriceInputUnit : value.primaryUnit,
                })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary Unit</label>
            <Select
              value={value.primaryUnit}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  primaryUnit: next as UnitOption,
                  secondaryUnit:
                    value.secondaryUnit === next ? getFirstDifferentUnit(next as UnitOption) : value.secondaryUnit,
                  priceInputUnit:
                    value.priceInputUnit === value.primaryUnit ? (next as UnitOption) : value.priceInputUnit,
                  costPriceInputUnit:
                    value.costPriceInputUnit === value.primaryUnit ? (next as UnitOption) : value.costPriceInputUnit,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {value.hasSecondaryUnit && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Secondary Unit</label>
                <Select
                  value={value.secondaryUnit}
                  onValueChange={(next) => onChange({ ...value, secondaryUnit: next as UnitOption })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.filter((unit) => unit !== value.primaryUnit).map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Conversion</label>
                <Input
                  type="number"
                  min="2"
                  placeholder="e.g. 1000"
                  value={value.unitConversion}
                  onChange={(e) => onChange({ ...value, unitConversion: e.target.value })}
                />
              </div>
            </>
          )}
        </div>

      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div>
          <p className="text-sm font-medium">Pricing</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Selling Price</label>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0.00"
                value={value.price}
                onChange={(e) => onChange({ ...value, price: e.target.value })}
              />
              <Select
                value={value.priceInputUnit}
                onValueChange={(next) => {
                  const nextUnit = next as UnitOption;
                  onChange({
                    ...value,
                    price: convertUnitPrice(value.price, unitConfig, value.priceInputUnit, nextUnit),
                    priceInputUnit: nextUnit,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Cost Price</label>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0.00"
                value={value.costPrice}
                onChange={(e) => onChange({ ...value, costPrice: e.target.value })}
              />
              <Select
                value={value.costPriceInputUnit}
                onValueChange={(next) => {
                  const nextUnit = next as UnitOption;
                  onChange({
                    ...value,
                    costPrice: convertUnitPrice(value.costPrice, unitConfig, value.costPriceInputUnit, nextUnit),
                    costPriceInputUnit: nextUnit,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Stock</label>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <Input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0"
              value={value.stock}
              onChange={(e) => {
                onStockChange?.();
                onChange({ ...value, stock: e.target.value });
              }}
            />
            <Select
              value={value.stockInputUnit}
              onValueChange={(next) => {
                const nextUnit = next as UnitOption;
                onStockInputUnitChange?.();
                onChange({
                  ...value,
                  stock: convertQuantity(value.stock, unitConfig, value.stockInputUnit, nextUnit),
                  lowStockThreshold: convertQuantity(value.lowStockThreshold, unitConfig, value.stockInputUnit, nextUnit),
                  stockInputUnit: nextUnit,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableUnits.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Low Stock Alert</label>
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="10"
            value={value.lowStockThreshold}
            onChange={(e) => {
              onLowStockThresholdChange?.();
              onChange({ ...value, lowStockThreshold: e.target.value });
            }}
          />
        </div>
      </div>
    </div>
  );
}

