import { percentagesTenths, type Language, type WalletCategory } from '@hamyon/core';
import { formatMoney } from '../format';
import { t } from '../i18n';
import { b, bar, esc } from './html';

export interface PeriodSummary {
  expenseUzs: number;
  incomeUzs: number;
  byCategory: Array<{ categoryId: string | null; totalUzs: number }>;
}

/**
 * Body of a period report, `maxLines` long at most (TZ §33: whole report ≤ 5 lines):
 *   💸 Xarajat: <b>1 250 000 so'm</b>
 *   💰 Daromad: <b>6 000 000 so'm</b>
 *   🛒 Oziq-ovqat ▰▰▰▱▱ 52%
 *   …top categories fill the remaining lines.
 */
export function summaryLines(lang: Language, sum: PeriodSummary, categories: WalletCategory[], maxLines = 4): string[] {
  const lines = [`💸 ${t(lang, 'expenseLabel')}: ${b(formatMoney(sum.expenseUzs, 'UZS', lang))}`];
  if (sum.incomeUzs > 0) lines.push(`💰 ${t(lang, 'incomeLabel')}: ${b(formatMoney(sum.incomeUzs, 'UZS', lang))}`);
  const pct = percentagesTenths(sum.byCategory.map((c) => c.totalUzs));
  sum.byCategory.slice(0, Math.max(0, maxLines - lines.length)).forEach((c, idx) => {
    const cat = categories.find((x) => x.id === c.categoryId);
    const name = cat ? `${cat.icon ?? '🏷'} ${esc(cat.name)}` : `❓ ${t(lang, 'uncategorized')}`;
    const share = pct[idx]! / 1000;
    lines.push(`${name}  ${bar(share)} ${Math.round(share * 100)}% · ${formatMoney(c.totalUzs, 'UZS', lang)}`);
  });
  return lines;
}
