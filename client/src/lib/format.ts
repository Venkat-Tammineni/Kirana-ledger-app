import { formatIST, toISTDateTimeString, getISTParts } from "@shared/timezone";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCurrencyINR(value: number) {
  return inr.format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: string | Date, pattern = "dd MMM yyyy") {
  return formatIST(value, pattern);
}

export function formatDateTime(value: string | Date, pattern = "dd MMM yyyy, hh:mm a") {
  return formatIST(value, pattern);
}

export function toISTDateTimeStringForApi(value: Date) {
  return toISTDateTimeString(value);
}

export function toISTDateInputValue(value: string) {
  return `${value}T00:00:00`;
}

export function toDateInputString(value: Date) {
  const parts = getISTParts(value);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
