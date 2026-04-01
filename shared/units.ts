export const UNIT_OPTIONS = [
  "PCS",
  "BAG",
  "KG",
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
  return (hasSecondaryUnit(value) ? value.secondaryUnit : value.primaryUnit || "PCS") as UnitOption;
}

export function getUnitConversion(value: UnitShape): number {
  return hasSecondaryUnit(value) ? Number(value.unitConversion || 1) : 1;
}

export function getDefaultSalesUnit(value: UnitShape): UnitOption {
  return hasSecondaryUnit(value) ? getPrimaryUnit(value) : getBaseUnit(value);
}

export function getUnitMultiplierToBase(value: UnitShape, unit?: string | null): number {
  if (!unit) return 1;
  if (hasSecondaryUnit(value) && unit === getPrimaryUnit(value)) {
    return getUnitConversion(value);
  }
  return 1;
}

export function toBaseQuantity(quantity: number, value: UnitShape, unit?: string | null): number {
  return Math.max(0, Math.round(quantity * getUnitMultiplierToBase(value, unit)));
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

