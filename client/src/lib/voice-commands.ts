import type { UnitOption } from "@shared/units";

const UNIT_ALIASES: Array<{ pattern: RegExp; unit: UnitOption }> = [
  { pattern: /\bkg\b|\bkilo\b|\bkilos\b|\bkilogram\b|\bkilograms\b/, unit: "KG" },
  { pattern: /\bg\b|\bgram\b|\bgrams\b/, unit: "GRAMS" },
  { pattern: /\bpcs\b|\bpiece\b|\bpieces\b/, unit: "PCS" },
  { pattern: /\blitre\b|\bliter\b|\bliters\b|\blitres\b|\bl\b/, unit: "LITRE" },
  { pattern: /\bbag\b|\bbags\b/, unit: "BAG" },
  { pattern: /\bbottle\b|\bbottles\b/, unit: "BOTTLES" },
  { pattern: /\bbox\b|\bboxes\b/, unit: "BOXES" },
  { pattern: /\bcan\b|\bcans\b/, unit: "CANS" },
  { pattern: /\bdozen\b|\bdozens\b/, unit: "DOZENS" },
];

export function normalizeVoiceUnit(raw?: string | null): UnitOption | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  const direct = UNIT_ALIASES.find(({ pattern }) => pattern.test(normalized));
  return direct?.unit ?? null;
}

export function parseSpokenAmount(value: string) {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function parseBillingLineCommand(input: string): {
  productName: string;
  quantity: number;
  unit: UnitOption | null;
  sellingPrice: number | null;
  costPrice: number | null;
} | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const sellingMatch = normalized.match(/\bselling price\s+(\d+(?:\.\d+)?)/);
  const costMatch = normalized.match(/\bcost price\s+(\d+(?:\.\d+)?)/);

  let working = normalized
    .replace(/\bselling price\s+\d+(?:\.\d+)?/g, "")
    .replace(/\bcost price\s+\d+(?:\.\d+)?/g, "")
    .replace(/\s+/g, " ")
    .trim();

  let match =
    working.match(/^(.+?)\s+(\d+(?:\.\d+)?)([a-zA-Z]+)(?:\s+(\d+(?:\.\d+)?))?$/) ||
    working.match(/^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+([a-zA-Z]+))?(?:\s+(\d+(?:\.\d+)?))?$/);

  if (!match) return null;

  const productName = match[1].trim();
  const quantity = Number(match[2]);
  const unit = normalizeVoiceUnit(match[3] || null);
  const trailingPrice = match[4] ? Number(match[4]) : null;

  if (!productName || !Number.isFinite(quantity) || quantity <= 0) return null;

  return {
    productName,
    quantity,
    unit,
    sellingPrice: sellingMatch ? Number(sellingMatch[1]) : trailingPrice,
    costPrice: costMatch ? Number(costMatch[1]) : null,
  };
}

export function compactVoiceText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeVoiceWord(word: string) {
  return word
    .toLowerCase()
    .replace(/(.)\1+/g, "$1")
    .replace(/^all?am$/, "alam")
    .replace(/^basmat?hi$/, "basmati")
    .replace(/^vinegar$/, "vineger")
    .replace(/^sauce$/, "sause")
    .replace(/^chilli$/, "chili")
    .replace(/^chilly$/, "chili")
    .replace(/^colour$/, "color");
}

function toPhoneticVoiceWord(word: string) {
  const simplified = normalizeVoiceWord(word)
    .replace(/ph/g, "f")
    .replace(/gh/g, "g")
    .replace(/dh/g, "d")
    .replace(/th/g, "t")
    .replace(/bh/g, "b")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/v/g, "w");

  if (simplified.length <= 1) return simplified;
  return simplified[0] + simplified.slice(1).replace(/[aeiou]/g, "");
}

export function createVoiceSearchKeys(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,!?;:()/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized
    .split(" ")
    .map((token) => normalizeVoiceWord(token))
    .filter(Boolean);

  const phoneticTokens = tokens.map((token) => toPhoneticVoiceWord(token)).filter(Boolean);

  return {
    normalized: tokens.join(" "),
    tokens,
    compact: tokens.join(""),
    phoneticTokens,
    phoneticCompact: phoneticTokens.join(""),
  };
}

export function parseCreateProductVoiceCommand(input: string): {
  name: string;
  sellingPrice: number;
  costPrice: number;
  unit: UnitOption;
} | null {
  const normalized = input.trim().toLowerCase();
  const match = normalized.match(
    /^(add product|create product)\s+(.+?)\s+selling price\s+(\d+(?:\.\d+)?)\s+cost price\s+(\d+(?:\.\d+)?)\s+([a-zA-Z]+)$/,
  );

  if (!match) return null;

  const unit = normalizeVoiceUnit(match[5]);
  if (!unit) return null;

  return {
    name: match[2].trim(),
    sellingPrice: Number(match[3]),
    costPrice: Number(match[4]),
    unit,
  };
}

export function parseVoiceDateInput(input: string): Date | null {
  const trimmed = input.trim();

  let match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
  }

  match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00`);
  }

  return null;
}
