import { formatIST, toISTDateTimeString } from "@shared/timezone";

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
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
