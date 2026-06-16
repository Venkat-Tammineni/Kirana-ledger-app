type BillNumberLike =
  | { id?: number | null }
  | number
  | null
  | undefined;

function resolveBillNumber(value: BillNumberLike, fallbackId?: number | null) {
  if (typeof value === "number") {
    return value;
  }

  return value?.id ?? fallbackId ?? null;
}

export function getBillDisplayNumber(value: BillNumberLike, fallbackId?: number | null) {
  return resolveBillNumber(value, fallbackId);
}

export function formatBillLabel(value: BillNumberLike, fallbackId?: number | null) {
  const billNumber = resolveBillNumber(value, fallbackId);
  return billNumber == null ? "#" : `#${billNumber}`;
}

export function formatInvoiceNumber(value: BillNumberLike, fallbackId?: number | null) {
  const billNumber = resolveBillNumber(value, fallbackId);
  return billNumber == null ? "INV" : `INV-${billNumber}`;
}
