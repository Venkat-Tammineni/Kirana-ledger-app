export const UNIT_OPTIONS = [
  "PCS",
  "BAG",
  "KG",
  "GRAMS",
  "BOTTLES",
  "BOXES",
  "CANS",
  "DOZENS",
  "LITRE",
] as const;

export type UnitOption = (typeof UNIT_OPTIONS)[number];

type UnitShape = {
  primaryUnit?: string | null;
  secondaryUnit?: string | null;
  unitConversion?: number | string | null;
};

function isWeightUnit(unit?: string | null): unit is "KG" | "GRAMS" {
  return unit === "KG" || unit === "GRAMS";
}

export function hasSecondaryUnit(value: UnitShape): boolean {
  return Boolean(
    value.secondaryUnit &&
    value.primaryUnit &&
    value.secondaryUnit !== value.primaryUnit &&
    Number(value.unitConversion || 0) > 1,
  );
}

export function getPrimaryUnit(value: UnitShape): UnitOption {
  return (value.primaryUnit || "PCS") as UnitOption;
}

export function getBaseUnit(value: UnitShape): UnitOption {
  if (!hasSecondaryUnit(value) && isWeightUnit(value.primaryUnit)) {
    return "GRAMS";
  }

  return (hasSecondaryUnit(value) ? value.secondaryUnit : value.primaryUnit || "PCS") as UnitOption;
}

export function getUnitConversion(value: UnitShape): number {
  return hasSecondaryUnit(value) ? Number(value.unitConversion || 1) : 1;
}

export function getDefaultSalesUnit(value: UnitShape): UnitOption {
  const primaryUnit = getPrimaryUnit(value);
  const baseUnit = getBaseUnit(value);
  if (isWeightUnit(primaryUnit) && isWeightUnit(baseUnit)) return "KG";
  if (!hasSecondaryUnit(value) && isWeightUnit(primaryUnit)) return "KG";
  return baseUnit;
}

export function getAvailableUnits(value: UnitShape): UnitOption[] {
  const primaryUnit = getPrimaryUnit(value);
  const baseUnit = getBaseUnit(value);

  if (!hasSecondaryUnit(value) && isWeightUnit(primaryUnit)) {
    return ["KG", "GRAMS"];
  }

  return Array.from(new Set([primaryUnit, baseUnit]));
}

export function getUnitMultiplierToBase(value: UnitShape, unit?: string | null): number {
  if (!unit) return 1;
  const primaryUnit = getPrimaryUnit(value);
  const baseUnit = getBaseUnit(value);
  if (unit === baseUnit) return 1;
  if (hasSecondaryUnit(value) && unit === getPrimaryUnit(value)) {
    return getUnitConversion(value);
  }
  if (!hasSecondaryUnit(value) && isWeightUnit(primaryUnit)) {
    if (unit === "KG" && baseUnit === "GRAMS") return 1000;
    if (unit === "GRAMS" && baseUnit === "KG") return 0.001;
  }
  return 1;
}

export function toBaseQuantity(quantity: number, value: UnitShape, unit?: string | null): number {
  const baseQuantity = quantity * getUnitMultiplierToBase(value, unit);
  return Math.max(0, Number(baseQuantity.toFixed(3)));
}

export function fromBaseQuantity(baseQuantity: number, value: UnitShape, unit?: string | null): number {
  const multiplier = getUnitMultiplierToBase(value, unit);
  if (!multiplier) return baseQuantity;
  return baseQuantity / multiplier;
}

export function deriveUnitPriceFromBase(basePrice: number, value: UnitShape, unit?: string | null): number {
  return basePrice * getUnitMultiplierToBase(value, unit);
}

export function normalizeUnitPriceToBase(price: number, value: UnitShape, unit?: string | null): number {
  const multiplier = getUnitMultiplierToBase(value, unit);
  if (!multiplier) return price;
  return price / multiplier;
}
