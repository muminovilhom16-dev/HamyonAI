import { InlineKeyboard, type Bot } from 'grammy';
import {
  addDays,
  listRecentTransactions,
  monthInsights,
  listWalletCategories,
  localDate,
  periodRange,
  summarize,
  type Language,
  type MonthInsights,
  type Period,
} from '@hamyon/core';
import { formatDateLabel, formatMoney, groupDigits } from '../format';
import { t, tf, type MessageKey } from '../i18n';
import type { BotContext, BotServices } from './context';
import { b, esc } from './html';
import { sendMenu } from './menu';
import { summaryLines } from './summary';
import { guideOfferKeyboard } from './guide';

const TITLES: Record<Period, MessageKey> = { day: 'reportDay', week: 'reportWeek', month: 'reportMonth' };

/** "📅 Kuniga ~30 000 · oy oxiriga ~930 000 so'm · o'tgan oyga nisbatan +12%". */
export function insightLine(lang: Language, i: MonthInsights): string {
  const parts = [tf(lang, 'insightAvg', { amount: groupDigits(i.dailyAverageUzs) })];
  if (i.forecastUzs !== null) parts.push(tf(lang, 'insightForecast', { amount: formatMoney(i.forecastUzs, 'UZS', lang) }));
  if (i.changePct !== null && Math.abs(i.changePct) >= 5) parts.push(tf(lang, 'insightChange', { pct: `${i.changePct > 0 ? '+' : ''}${i.changePct}%` }));
  return parts.join(' · ');
}

/** Short report, max 5 lines (TZ §33). Debts excluded. */
async function report(ctx: BotContext, s: BotServices, period: Period) {
  const user = ctx.user!;
  const lang = user.language;
  const { from, to } = periodRange(period, s.now(), user.timezone);
  const sum = await summarize(s.db, user.id, ctx.walletId!, from, to);
  const title = b(t(lang, TITLES[period]));
  if (sum.count === 0) {
    await ctx.reply(`${title}\n\n${t(lang, 'noRecords')}`);
    return;
  }
  const cats = await listWalletCategories(s.db, ctx.walletId!, lang);
  // Month: one pace line (average, forecast, vs last month) instead of a category line.
  const insight = period === 'month' ? insightLine(lang, await monthInsights(s.db, { userId: user.id, walletId: ctx.walletId!, timeZone: user.timezone, now: s.now() })) : null;
  const body = summaryLines(lang, sum, cats, insight ? 3 : 4);
  await ctx.reply([title, '', ...body, ...(insight ? [insight] : [])].join('\n'));
}

export function registerReports(bot: Bot<BotContext>, s: BotServices): void {
  bot.command('bugun', (ctx) => report(ctx, s, 'day'));
  bot.command('hafta', (ctx) => report(ctx, s, 'week'));
  bot.command('oy', (ctx) => report(ctx, s, 'month'));

  // TZ §19: last 20 records, each with edit and delete.
  bot.command('oxirgi', async (ctx) => {
    const user = ctx.user!;
    const lang = user.language;
    const rows = await listRecentTransactions(s.db, user.id, ctx.walletId!, 20);
    if (rows.length === 0) {
      await ctx.reply(t(lang, 'noRecords'));
      return;
    }
    const cats = await listWalletCategories(s.db, ctx.walletId!, lang);
    const today = localDate(s.now(), user.timezone);
    const yesterday = addDays(today, -1);
    const lines: string[] = [];
    let lastDay = '';
    rows.forEach((r, i) => {
      const day = localDate(r.occurredAt, user.timezone);
      if (day !== lastDay) {
        lines.push('', b(`📅 ${formatDateLabel(day, today, yesterday, lang)}`));
        lastDay = day;
      }
      const isDebt = r.type === 'debt_given' || r.type === 'debt_taken' || r.type === 'debt_return';
      const cat = cats.find((c) => c.id === r.categoryId);
      const label = isDebt
        ? `🤝 ${t(lang, 'debtLabel')}${r.counterparty ? ` · ${esc(r.counterparty)}` : ''}`
        : cat
          ? `${cat.icon ?? '🏷'} ${esc(cat.name)}`
          : `❓ ${t(lang, 'uncategorized')}`;
      const money = b(`${r.type === 'income' ? '+' : ''}${formatMoney(r.amount, r.currency, lang)}`);
      const note = r.note && r.note.toLowerCase() !== (cat?.name ?? '').toLowerCase() ? ` · ${esc(r.note)}` : '';
      lines.push(`${i + 1}. ${money} · ${label}${note}`);
    });
    const kb = new InlineKeyboard();
    rows.forEach((r, i) => kb.text(`✏️ ${i + 1}`, `open:${r.id}`).text(`🗑 ${i + 1}`, `ldel:${r.id}`).row());
    await ctx.reply(`${b(t(lang, 'recentTitle'))}\n${lines.join('\n')}`, { reply_markup: kb });
  });

  bot.command(['yordam', 'help'], async (ctx) => {
    const lang = ctx.user!.language;
    await sendMenu(ctx, s, t(lang, 'help'));
    if (s.guideVideo) await ctx.reply(t(lang, 'guideOffer'), { reply_markup: guideOfferKeyboard(lang) });
  });
}
