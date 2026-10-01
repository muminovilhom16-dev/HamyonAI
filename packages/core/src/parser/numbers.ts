import { foldWord } from './normalize';

/**
 * Number-word dictionaries. Values are in hundredths (×100) so halves
 * ("yarim", "полтора") and decimals ("1,5 mln") stay exact integers.
 * Russian words are written in Cyrillic and folded with the same
 * normalizer as user input, so both sides always agree.
 */

const fold = (words: Record<string, number>) =>
  Object.fromEntries(Object.entries(words).map(([w, v]) => [foldWord(w), v]));

// Units and tens (added to the current group).
export const UNIT_WORDS: Record<string, number> = fold({
  // Uzbek (apostrophes are folded away, so "to'rt" == "tort")
  bir: 1, ikki: 2, uch: 3, "to'rt": 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9,
  "o'n": 10, yigirma: 20, "o'ttiz": 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90,
  // common misspellings
  yigrma: 20, igirma: 20, elik: 50, toqqiz: 9, tokkiz: 9, sakiz: 8, yeti: 7,
  // Russian
  один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15,
  шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
});

// "o'n" folds to "on", which is also an English/Russian-looking token; it is
// accepted only next to other number words (see amount.ts).
export const AMBIGUOUS_UNIT_WORDS = new Set(['on', 'bir']);

export const HUNDRED_WORDS = new Set(['yuz'].map(foldWord));

/** Fractions added to the current group, in hundredths. */
export const FRACTION_WORDS: Record<string, number> = fold({ yarim: 50, полтора: 150, полторы: 150, пол: 50 });

export type Scale = 1_000 | 1_000_000 | 1_000_000_000;

const THOUSAND_STEMS = ['ming', 'mng', 'tys', 'tysh'];
const THOUSAND_EXACT = new Set(['k', 'min', 'mig', 'tis', 'тыс'].map(foldWord));
const MILLION_STEMS = ['million', 'milion', 'millon', 'mln'];
const MILLION_EXACT = new Set(['m', 'mil']);
const BILLION_STEMS = ['milliard', 'mlrd'];

/**
 * Scale words. `afterDigit` allows short forms that are only safe right
 * after a number ("1.5m", "20k").
 */
export function scaleOf(fold: string, afterDigit: boolean): Scale | null {
  if (BILLION_STEMS.some((s) => fold.startsWith(s))) return 1_000_000_000;
  if (MILLION_STEMS.some((s) => fold.startsWith(s))) return 1_000_000;
  if (afterDigit && MILLION_EXACT.has(fold)) return 1_000_000;
  if (THOUSAND_STEMS.some((s) => fold.startsWith(s))) return 1_000;
  if (THOUSAND_EXACT.has(fold) && (afterDigit || fold !== 'k')) return 1_000;
  return null;
}

/** Parses "20", "1.5", "1,5", "20.000", "1 500 000" into hundredths. */
export function parseDigits(raw: string): bigint | null {
  let s = raw.replace(/^[+-]/, '').replace(/[  ]/g, '');
  // A separator followed by exactly three digits is grouping: "20.000", "1,500,000".
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const int = BigInt(m[1]!);
  const frac = m[2] ? BigInt(m[2].padEnd(2, '0')) : 0n;
  return int * 100n + frac;
}
