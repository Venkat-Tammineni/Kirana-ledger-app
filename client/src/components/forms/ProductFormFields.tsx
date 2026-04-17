import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyINR } from "@/lib/format";
import {
  deriveUnitPriceFromBase,
  fromBaseQuantity,
  getBaseUnit,
  getPrimaryUnit,
  hasSecondaryUnit,
  normalizeUnitPriceToBase,
  toBaseQuantity,
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

  const salePriceNumber = Number(value.price || 0);
  const costPriceNumber = Number(value.costPrice || 0);
  const baseSalePrice = normalizeUnitPriceToBase(salePriceNumber, unitConfig, value.priceInputUnit);
  const baseCostPrice = normalizeUnitPriceToBase(costPriceNumber, unitConfig, value.costPriceInputUnit);
  const primarySalePrice = deriveUnitPriceFromBase(baseSalePrice, unitConfig, primaryUnit);
  const secondarySalePrice = deriveUnitPriceFromBase(baseSalePrice, unitConfig, baseUnit);
  const primaryCostPrice = deriveUnitPriceFromBase(baseCostPrice, unitConfig, primaryUnit);
  const secondaryCostPrice = deriveUnitPriceFromBase(baseCostPrice, unitConfig, baseUnit);
  const stockNumber = Number(value.stock || 0);
  const lowStockThresholdNumber = Number(value.lowStockThreshold || 0);
  const baseStockQuantity = toBaseQuantity(stockNumber, unitConfig, value.stockInputUnit);
  const baseLowStockThreshold = toBaseQuantity(lowStockThresholdNumber, unitConfig, value.stockInputUnit);
  const primaryStockQuantity = fromBaseQuantity(baseStockQuantity, unitConfig, primaryUnit);
  const secondaryStockQuantity = fromBaseQuantity(baseStockQuantity, unitConfig, baseUnit);

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
            <p className="text-xs text-muted-foreground">Base storage always uses the lower unit.</p>
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

        <div className="text-xs text-muted-foreground">
          {showSecondary
            ? `1 ${primaryUnit} = ${Number(value.unitConversion || 0)} ${baseUnit}. Stock and prices will be stored in ${baseUnit}.`
            : `Single-unit item. Stock and prices will be stored in ${baseUnit}.`}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div>
          <p className="text-sm font-medium">Pricing</p>
          <p className="text-xs text-muted-foreground">Enter the price in either unit and the other side will auto-derive.</p>
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
                onValueChange={(next) => onChange({ ...value, priceInputUnit: next as UnitOption })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[primaryUnit, ...(showSecondary ? [baseUnit] : [])].map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Stored base price: {formatCurrencyINR(baseSalePrice)} / {baseUnit}
            </div>
            {showSecondary && (
              <div className="text-xs text-muted-foreground">
                {formatCurrencyINR(primarySalePrice)} / {primaryUnit} and {formatCurrencyINR(secondarySalePrice)} / {baseUnit}
              </div>
            )}
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
                onValueChange={(next) => onChange({ ...value, costPriceInputUnit: next as UnitOption })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[primaryUnit, ...(showSecondary ? [baseUnit] : [])].map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground">
              Stored base cost: {formatCurrencyINR(baseCostPrice)} / {baseUnit}
            </div>
            {showSecondary && (
              <div className="text-xs text-muted-foreground">
                {formatCurrencyINR(primaryCostPrice)} / {primaryUnit} and {formatCurrencyINR(secondaryCostPrice)} / {baseUnit}
              </div>
            )}
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
                onStockInputUnitChange?.();
                onChange({ ...value, stockInputUnit: next as UnitOption });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[primaryUnit, ...(showSecondary ? [baseUnit] : [])].map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Stored stock: {baseStockQuantity} {baseUnit}
          </div>
          {showSecondary && (
            <div className="text-xs text-muted-foreground">
              {primaryStockQuantity} {primaryUnit} and {secondaryStockQuantity} {baseUnit}
            </div>
          )}
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
          <div className="text-xs text-muted-foreground">
            Threshold uses {value.stockInputUnit} input and stores as {baseLowStockThreshold} {baseUnit}.
          </div>
        </div>
      </div>
    </div>
  );
}

