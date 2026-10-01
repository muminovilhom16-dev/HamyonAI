import type { Token } from './normalize';
import {
  AMBIGUOUS_UNIT_WORDS,
  FRACTION_WORDS,
  HUNDRED_WORDS,
  UNIT_WORDS,
  parseDigits,
  scaleOf,
  type Scale,
} from './numbers';

export type Currency = 'UZS' | 'USD';

export interface AmountMatch {
  /** Whole units (so'm or dollars). */
  value: number;
  currency: Currency;
  /** Token index range [startIdx, endIdx) in the token list, incl. currency tokens. */
  startIdx: number;
  endIdx: number;
  /** "ming", "k", "mln" etc. were present. */
  hasScale: boolean;
  /** Currency was written explicitly (so'm, $, dollar). */
  explicitCurrency: boolean;
  /** Bare small number interpreted as thousands ("taksi 20" → 20 000). */
  assumedThousands: boolean;
  /** "+500 ming" style sign prefix. */
  sign: '+' | '-' | null;
}

const USD_STEMS = ['usd', 'dollar', 'dollor', 'dolar', 'doll'];
const UZS_STEMS = ['som', 'sum', 'uzs', 'sym'];

// Quantities and measures: "2 ta non", "3 kg", "5 litr" are not money.
const QUANTITY_STEMS = ['ta', 'dona', 'kg', 'kilo', 'gr', 'gramm', 'litr', 'l', 'sht', 'shtuk', 'metr', 'km', 'oy', 'kun', 'soat', 'yil', 'yosh', 'chas', 'minut', 'god', 'let', 'dney', 'den', 'kusok'];
const QUANTITY_EXACT = new Set(['ta', 'l', 'm2', 'sm', 'mm']);

function currencyOf(t: Token | undefined): Currency | null {
  if (!t) return null;
  if (t.kind === 'symbol') return t.raw === '$' ? 'USD' : null;
  if (t.kind !== 'word') return null;
  if (USD_STEMS.some((s) => t.fold.startsWith(s))) return 'USD';
  if (UZS_STEMS.some((s) => t.fold === s || t.fold.startsWith(s + 'l') || t.fold.startsWith(s + 'g') || t.fold.startsWith(s + 'd'))) return 'UZS';
  return null;
}

function isQuantity(t: Token | undefined): boolean {
  if (!t || t.kind !== 'word') return false;
  return QUANTITY_EXACT.has(t.fold) || QUANTITY_STEMS.some((s) => t.fold === s || (s.length >= 3 && t.fold.startsWith(s)));
}

const isUnitWord = (t: Token) => t.kind === 'word' && UNIT_WORDS[t.fold] !== undefined;
const isNumberish = (t: Token | undefined, afterDigit = false): boolean =>
  !!t &&
  (t.kind === 'number' ||
    (t.kind === 'word' &&
      (UNIT_WORDS[t.fold] !== undefined ||
        HUNDRED_WORDS.has(t.fold) ||
        FRACTION_WORDS[t.fold] !== undefined ||
        scaleOf(t.fold, afterDigit) !== null)));

/**
 * Finds money amounts in a token list. Deterministic and conservative:
 * anything uncertain is reported with flags so the caller can lower
 * confidence; nothing is invented.
 */
export function extractAmounts(tokens: Token[]): AmountMatch[] {
  const out: AmountMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    const r = readAmount(tokens, i);
    if (r) {
      out.push(r);
      i = r.endIdx;
    } else {
      i++;
    }
  }
  return out;
}

function readAmount(tokens: Token[], from: number): AmountMatch | null {
  let i = from;
  let currency: Currency | null = null;
  let explicitCurrency = false;
  let startIdx = from;

  // Leading currency: "$50", "USD 50"
  if (tokens[i]?.kind === 'symbol' || currencyOf(tokens[i]) === 'USD') {
    const c = currencyOf(tokens[i]);
    if (c && tokens[i + 1]?.kind === 'number') {
      currency = c;
      explicitCurrency = true;
      i++;
    }
  }

  const first = tokens[i];
  if (!first || !isNumberish(first)) return null;
  if (first.kind === 'word' && scaleOf(first.fold, false) && !UNIT_WORDS[first.fold]) {
    // A bare scale word ("ming") with no number before it is not an amount.
    return null;
  }
  // "bir"/"on" alone are ordinary words unless followed by more number words.
  if (first.kind === 'word' && AMBIGUOUS_UNIT_WORDS.has(first.fold) && !isNumberish(tokens[i + 1])) return null;

  // State machine over number tokens, values in hundredths.
  let total = 0n;
  let current = 0n;
  let hasScale = false;
  let lastScale: Scale | null = null;
  let consumedAny = false;
  let prev: Token | null = null;
  let sign: '+' | '-' | null = null;
  let sawDigits = false;

  while (i < tokens.length) {
    const t = tokens[i]!;
    const afterDigit = prev?.kind === 'number';
    if (t.kind === 'number') {
      // Two bare numbers in a row ("5 12") are separate amounts.
      if (prev && (prev.kind === 'number' || isUnitWord(prev) || HUNDRED_WORDS.has(prev.fold))) break;
      // A number after a completed scale group must be smaller ("1 mln 200 ming").
      // Long digit runs are phone/account numbers, not amounts.
      if (/^[+-]?\d{11,}$/.test(t.raw)) {
        if (!consumedAny) return null;
        break;
      }
      const v = parseDigits(t.raw);
      if (v === null) break;
      if (!consumedAny && /^[+-]/.test(t.raw)) sign = t.raw[0] as '+' | '-';
      if (isQuantity(tokens[i + 1])) {
        if (!consumedAny) return null;
        break;
      }
      current += v;
      sawDigits = true;
    } else if (t.kind === 'word' && UNIT_WORDS[t.fold] !== undefined) {
      if (prev?.kind === 'number') break;
      current += BigInt(UNIT_WORDS[t.fold]!) * 100n;
    } else if (t.kind === 'word' && HUNDRED_WORDS.has(t.fold)) {
      current = (current === 0n ? 100n : current) * 100n;
    } else if (t.kind === 'word' && FRACTION_WORDS[t.fold] !== undefined) {
      current += BigInt(FRACTION_WORDS[t.fold]!);
    } else if (t.kind === 'word' && scaleOf(t.fold, afterDigit)) {
      const scale = scaleOf(t.fold, afterDigit)!;
      if (lastScale !== null && scale >= lastScale) break;
      total += (current === 0n ? 100n : current) * BigInt(scale);
      current = 0n;
      hasScale = true;
      lastScale = scale;
    } else {
      break;
    }
    consumedAny = true;
    prev = t;
    i++;
  }
  if (!consumedAny) return null;

  let hundredths = total + current;
  // Word-only numbers without a scale ("bir", "yigirma") are too ambiguous.
  if (!sawDigits && !hasScale) return null;
  if (hundredths <= 0n) return null;

  // Trailing currency: "50 $", "50 dollar", "25 000 so'm"
  const trailing = currencyOf(tokens[i]);
  if (trailing) {
    if (currency && currency !== trailing) return null;
    currency = trailing;
    explicitCurrency = true;
    i++;
  }
  currency ??= 'UZS';

  // Whole units only (TZ: no tiyin, no cents).
  if (hundredths % 100n !== 0n) return null;
  let value = hundredths / 100n;

  // Bare small UZS number: "taksi 20" probably means 20 000 (TZ §8). Flag it.
  let assumedThousands = false;
  if (!hasScale && currency === 'UZS' && !explicitCurrency && value < 1000n) {
    value *= 1000n;
    assumedThousands = true;
  }

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    value: Number(value),
    currency,
    startIdx,
    endIdx: i,
    hasScale,
    explicitCurrency,
    assumedThousands,
    sign,
  };
}
