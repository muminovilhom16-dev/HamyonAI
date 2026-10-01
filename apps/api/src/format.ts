import type { Language } from '@hamyon/core';

/** "1 250 000" — integer only, grouped by spaces (TZ §30). */
export function groupDigits(n: number): string {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const SOM: Record<Language, string> = { uz_latn: "so'm", uz_cyrl: 'сўм', ru: 'сум' };

export function formatMoney(amount: number, currency: 'UZS' | 'USD', lang: Language): string {
  return currency === 'USD' ? `$${groupDigits(amount)}` : `${groupDigits(amount)} ${SOM[lang]}`;
}

const MONTHS: Record<Language, string[]> = {
  uz_latn: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  uz_cyrl: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const TODAY: Record<Language, string> = { uz_latn: 'Bugun', uz_cyrl: 'Бугун', ru: 'Сегодня' };
const YESTERDAY: Record<Language, string> = { uz_latn: 'Kecha', uz_cyrl: 'Кеча', ru: 'Вчера' };

/** "1-sentabr" / "1-сентябр" / "1 сентября" (+ year if not the current one). Never "M09 01" (TZ §29). */
export function formatDay(date: string, lang: Language, currentYear?: string): string {
  const [y, m, d] = date.split('-');
  const day = String(Number(d));
  const month = MONTHS[lang][Number(m) - 1]!;
  const base = lang === 'ru' ? `${day} ${month}` : `${day}-${month}`;
  return currentYear && y !== currentYear ? `${base} ${y}` : base;
}

/** "Bugun", "Kecha", or a formatted day. */
export function formatDateLabel(date: string, today: string, yesterday: string, lang: Language): string {
  if (date === today) return TODAY[lang];
  if (date === yesterday) return YESTERDAY[lang];
  return formatDay(date, lang, today.slice(0, 4));
}
