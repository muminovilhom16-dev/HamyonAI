import { InlineKeyboard, type Bot } from 'grammy';
import {
  listRecentTransactions,
  listWalletCategories,
  localDate,
  periodRange,
  summarize,
  type Period,
} from '@hamyon/core';
import { formatDay, formatMoney } from '../format';
import { t, type MessageKey } from '../i18n';
import type { BotContext, BotServices } from './context';

const TITLES: Record<Period, MessageKey> = { day: 'reportDay', week: 'reportWeek', month: 'reportMonth' };

/** Short report, max 5 lines (TZ §33). Debts excluded. */
async function report(ctx: BotContext, s: BotServices, period: Period) {
  const user = ctx.user!;
  const lang = user.language;
  const { from, to } = periodRange(period, s.now(), user.timezone);
  const sum = await summarize(s.db, user.id, ctx.walletId!, from, to);
  if (sum.count === 0) {
    await ctx.reply(`${t(lang, TITLES[period])}\n\n${t(lang, 'noRecords')}`);
    return;
  }
  const lines = [t(lang, TITLES[period]), '', `${t(lang, 'expenseLabel')}: ${formatMoney(sum.expenseUzs, 'UZS', lang)}`];
  if (sum.incomeUzs > 0) lines.push(`${t(lang, 'incomeLabel')}: ${formatMoney(sum.incomeUzs, 'UZS', lang)}`);
  const top = sum.byCategory[0];
  if (top) {
    const cats = await listWalletCategories(s.db, ctx.walletId!, lang);
    const name = cats.find((c) => c.id === top.categoryId)?.name ?? t(lang, 'uncategorized');
    lines.push(`${t(lang, 'topCategory')}: ${name} — ${formatMoney(top.totalUzs, 'UZS', lang)}`);
  }
  await ctx.reply(lines.join('\n'));
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
    const year = localDate(s.now(), user.timezone).slice(0, 4);
    const lines = rows.map((r, i) => {
      const cat = cats.find((c) => c.id === r.categoryId)?.name ?? t(lang, 'uncategorized');
      const money = `${r.type === 'income' ? '+' : ''}${formatMoney(r.amount, r.currency, lang)}`;
      const note = r.note ? ` · ${r.note}` : '';
      return `${i + 1}. ${money} · ${cat}${note} · ${formatDay(localDate(r.occurredAt, user.timezone), lang, year)}`;
    });
    const kb = new InlineKeyboard();
    rows.forEach((r, i) => kb.text(`✏️ ${i + 1}`, `open:${r.id}`).text(`🗑 ${i + 1}`, `ldel:${r.id}`).row());
    await ctx.reply(`${t(lang, 'recentTitle')}\n\n${lines.join('\n')}`, { reply_markup: kb });
  });

  bot.command('yordam', (ctx) => ctx.reply(t(ctx.user!.language, 'help')));
  bot.command('help', (ctx) => ctx.reply(t(ctx.user!.language, 'help')));
}
