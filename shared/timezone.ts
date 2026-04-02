const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const istFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function assertValidDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return date;
}

export function dateFromISTParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - IST_OFFSET_MS);
}

export function parseISTDateOnly(value: string) {
  const match = value.trim().match(DATE_ONLY_PATTERN);
  if (!match) {
    throw new Error("Invalid date");
  }

  return dateFromISTParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function parseISTDateTime(value: string | Date) {
  if (value instanceof Date) {
    return assertValidDate(new Date(value));
  }

  const trimmed = value.trim();
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return parseISTDateOnly(trimmed);
  }

  const localMatch = trimmed.match(DATE_TIME_PATTERN);
  if (localMatch) {
    return dateFromISTParts(
      Number(localMatch[1]),
      Number(localMatch[2]),
      Number(localMatch[3]),
      Number(localMatch[4]),
      Number(localMatch[5]),
      Number(localMatch[6] || 0),
      Number((localMatch[7] || "0").padEnd(3, "0")),
    );
  }

  return assertValidDate(new Date(trimmed));
}

export function getISTParts(value: string | Date) {
  const date = value instanceof Date ? assertValidDate(new Date(value)) : parseISTDateTime(value);
  const parts = Object.fromEntries(
    istFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getISTDateKey(value: string | Date) {
  const parts = getISTParts(value);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function getISTDayBounds(value: string | Date) {
  const parts = getISTParts(value);
  return {
    start: dateFromISTParts(parts.year, parts.month, parts.day, 0, 0, 0, 0),
    end: dateFromISTParts(parts.year, parts.month, parts.day, 23, 59, 59, 999),
  };
}

export function getISTMonthBounds(value: string | Date) {
  const parts = getISTParts(value);
  const start = dateFromISTParts(parts.year, parts.month, 1, 0, 0, 0, 0);
  const nextMonthYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const end = new Date(dateFromISTParts(nextMonthYear, nextMonth, 1, 0, 0, 0, 0).getTime() - 1);

  return { start, end };
}

export function toISTDateTimeString(value: Date) {
  const parts = getISTParts(value);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function formatIST(value: string | Date, pattern = "dd MMM yyyy") {
  const normalizedPattern = pattern === "PPP" ? "dd MMM yyyy" : pattern;
  const parts = getISTParts(value);
  const hour12 = parts.hour % 12 || 12;
  const tokens: Record<string, string> = {
    yyyy: pad(parts.year, 4),
    MMM: MONTH_NAMES[parts.month - 1],
    MM: pad(parts.month),
    dd: pad(parts.day),
    hh: pad(hour12),
    mm: pad(parts.minute),
    a: parts.hour >= 12 ? "PM" : "AM",
  };

  return normalizedPattern.replace(/yyyy|MMM|MM|dd|hh|mm|a/g, (token) => tokens[token] ?? token);
}
