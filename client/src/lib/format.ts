import { format } from "date-fns";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCurrencyINR(value: number) {
  return inr.format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: string | Date, pattern = "dd MMM yyyy") {
  return format(new Date(value), pattern);
}

export function formatDateTime(value: string | Date, pattern = "dd MMM yyyy, hh:mm a") {
  return format(new Date(value), pattern);
}

