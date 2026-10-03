import { InlineKeyboard, type Bot } from 'grammy';
import {
  AppError,
  cancelAwaitingReplies,
  createPending,
  createRecurring,
  getOpenPending,
  handleRecurring,
  listRecurring,
  listWalletCategories,
  localDate,
  parseRuleBased,
  removeRecurring,
  resolvePending,
  type Language,
  type RecurringPayment,
} from '@hamyon/core';
import { formatDay, formatMoney } from '../format';
import { t, tf } from '../i18n';
import { budgetAlertLines } from './budgets';
import { cardEnv, cardText, txFields, txKeyboard } from './cards';
import type { BotContext, BotServices } from './context';
import { b, esc } from './html';

const UUID = '[0-9a-f-]{36}';

interface DayPayload { amount: number; currency: 'UZS' | 'USD'; categoryKey: string | null; note: string }

const fin = (s: BotServices) => ({ db: s.db, fx: s.fx, now: s.now });

export function recurringText(lang: Language, list: RecurringPayment[], year: string): string {
  const title = b(t(lang, 'recurringTitle'));
  if (list.length === 0) return `${title}\n\n${t(lang, 'recurringEmpty')}`;
  const lines = list.map(
    (r) =>
      `${r.categoryIcon ?? '🔁'} ${b(esc(r.note))} — ${b(formatMoney(r.amount, r.currency, lang))}\n    ${tf(lang, 'recurringDay', { day: String(r.dayOfMonth) })} · ${t(lang, 'recurringNext')}: ${formatDay(r.nextDate, lang, year)}`,
  );
  return `${title}\n\n${lines.join('\n')}`;
}

async function showList(ctx: BotContext, s: BotServices, edit: boolean) {
  const user = ctx.user!;
  const list = await listRecurring(s.db, { userId: user.id, walletId: ctx.walletId!, timeZone: user.timezone, now: s.now(), lang: user.language });
  const year = localDate(s.now(), user.timezone).slice(0, 4);
  const kb = new InlineKeyboard().text(t(user.language, 'recurringAdd'), 'rc:add').row();
  list.forEach((r, i) => {
    kb.text(`🗑 ${r.note}`.slice(0, 40), `rc:del:${r.id}`);
    if (i % 2 === 1) kb.row();
  });
  const text = recurringText(user.language, list, year);
  if (edit) await ctx.editMessageText(text, { reply_markup: kb });
  else await ctx.reply(text, { reply_markup: kb });
}

/** Reply to "write the payment": parse name + amount, then ask the day of month. */
export async function answerRecurringText(ctx: BotContext, s: BotServices, pendingId: string, text: string): Promise<void> {
  const user = ctx.user!;
  const parsed = parseRuleBased(text, { today: localDate(s.now(), user.timezone) });
  const item = parsed.items.length === 1 ? parsed.items[0]!.tx : null;
  if (!item || item.type !== 'expense') {
    await ctx.reply(t(user.language, 'recurringNotUnderstood'));
    return; // keep the prompt open for another try
  }
  if (!(await resolvePending(s.db, pendingId, s.now()))) return;
  const note = (item.note ?? text).trim().slice(0, 100);
  const payload: DayPayload = { amount: item.amount, currency: item.currency, categoryKey: item.category_id, note };
  const p = await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'recurring_day', payload, now: s.now(), ttlMinutes: 30 });
  const kb = new InlineKeyboard();
  for (let d = 1; d <= 28; d++) {
    kb.text(String(d), `rc:d:${p.id}:${d}`);
    if (d % 7 === 0) kb.row();
  }
  await ctx.reply(`${b(esc(note))} — ${b(formatMoney(item.amount, item.currency, user.language))}\n${tf(user.language, 'recurringAskDay', { name: note })}`, { reply_markup: kb });
}

export function registerRecurring(bot: Bot<BotContext>, s: BotServices): void {
  bot.command(['obunalar', 'obuna'], (ctx) => showList(ctx, s, false));

  bot.callbackQuery('rc:add', async (ctx) => {
    const user = ctx.user!;
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'recurring_text', payload: {}, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(user.language, 'recurringAskText'));
  });

  bot.callbackQuery(new RegExp(`^rc:d:(${UUID}):([1-9]|1\\d|2[0-8])$`), async (ctx) => {
    const user = ctx.user!;
    const pending = await getOpenPending(s.db, user.id, ctx.match[1]!, s.now());
    if (!pending || pending.kind !== 'recurring_day') {
      await ctx.answerCallbackQuery({ text: t(user.language, 'expired') });
      return;
    }
    const p = pending.payload as DayPayload;
    const cats = await listWalletCategories(s.db, pending.walletId, user.language);
    const cat = p.categoryKey ? cats.find((c) => c.key === p.categoryKey || c.id === p.categoryKey) : undefined;
    try {
      await createRecurring(s.db, {
        userId: user.id,
        walletId: pending.walletId,
        categoryId: cat && cat.kind === 'expense' ? cat.id : null,
        amount: p.amount,
        currency: p.currency,
        note: p.note,
        dayOfMonth: Number(ctx.match[2]),
      });
    } catch (err) {
      if (err instanceof AppError && err.message === 'too many') {
        await ctx.answerCallbackQuery({ text: t(user.language, 'recurringTooMany'), show_alert: true });
        return;
      }
      throw err;
    }
    await resolvePending(s.db, pending.id, s.now());
    await ctx.answerCallbackQuery({ text: t(user.language, 'settingsSaved') });
    await showList(ctx, s, true);
  });

  bot.callbackQuery(new RegExp(`^rc:del:(${UUID})$`), async (ctx) => {
    await removeRecurring(s.db, ctx.user!.id, ctx.match[1]!);
    await ctx.answerCallbackQuery({ text: t(ctx.user!.language, 'deleted') });
    await showList(ctx, s, true);
  });

  // From the due-day reminder: record the expense or skip this month.
  bot.callbackQuery(new RegExp(`^rc:(pay|skip):(${UUID}):(\\d{4}-\\d{2})$`), async (ctx) => {
    const user = ctx.user!;
    const r = await handleRecurring(fin(s), {
      userId: user.id,
      id: ctx.match[2]!,
      month: ctx.match[3]!,
      action: ctx.match[1] === 'pay' ? 'pay' : 'skip',
      timeZone: user.timezone,
    });
    if (r.status === 'already') {
      await ctx.answerCallbackQuery({ text: t(user.language, 'recurringAlready') });
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
      return;
    }
    await ctx.answerCallbackQuery();
    if (r.status === 'skipped') {
      await ctx.editMessageText(t(user.language, 'recurringSkipped'));
      return;
    }
    const tx = r.tx!;
    const categories = await listWalletCategories(s.db, tx.walletId, user.language);
    const env = cardEnv(user.language, user.timezone, s.now(), categories);
    const alerts = await budgetAlertLines(s, user, tx);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env) + (alerts.length ? `\n\n${alerts.join('\n')}` : ''), {
      reply_markup: txKeyboard(tx, env, user.timezone),
    });
  });
}
