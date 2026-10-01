import type { Currency, Lang } from './api';

/** "1 250 000" (TZ §30). */
export const group = (n: number) => Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const SOM: Record<Lang, string> = { uz_latn: "so'm", uz_cyrl: 'сўм', ru: 'сум' };

export function money(amount: number, currency: Currency, lang: Lang): string {
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  return currency === 'USD' ? `${sign}$${group(abs)}` : `${sign}${group(abs)} ${SOM[lang]}`;
}

const SCALE: Record<Lang, { k: string; m: string }> = {
  uz_latn: { k: 'ming', m: 'mln' },
  uz_cyrl: { k: 'минг', m: 'млн' },
  ru: { k: 'тыс', m: 'млн' },
};

/** Chart labels: "1,2 mln", "850 ming" (TZ §30). */
export function compact(n: number, lang: Lang): string {
  const abs = Math.abs(n);
  const s = SCALE[lang];
  const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  if (abs >= 1_000_000) return `${oneDecimal(n / 1_000_000)} ${s.m}`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)} ${s.k}`;
  return group(n);
}

const MONTHS: Record<Lang, string[]> = {
  uz_latn: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  uz_cyrl: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};

/** "1-sentabr" / "1 сентября" (+year when different) — never "M09 01" (TZ §29). */
export function day(date: string, lang: Lang, currentYear?: string): string {
  const [y, m, d] = date.split('-');
  const month = MONTHS[lang][Number(m) - 1];
  const base = lang === 'ru' ? `${Number(d)} ${month}` : `${Number(d)}-${month}`;
  return currentYear && y !== currentYear ? `${base} ${y}` : base;
}

/** "1-sentabr, 10:58". */
export const dayTime = (date: string, time: string, lang: Lang, currentYear?: string) => `${day(date, lang, currentYear)}, ${time}`;

/** 345 tenths → "34,5%". */
export const percent = (tenths: number) => `${(tenths / 10).toFixed(1).replace('.', ',')}%`;

/** Parses "45 000" / "45000" typed in a form into an integer (no floats for money). */
export function parseAmountInput(s: string): number | null {
  const digits = s.replace(/[\s  ]/g, '');
  if (!/^\d{1,15}$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}
