import { InlineKeyboard, type Bot } from 'grammy';
import { and, eq, inArray } from 'drizzle-orm';
import {
  AppError,
  RateUnavailableError,
  addDays,
  cleanCounterparty,
  createDebt,
  createPending,
  deleteDebtEvent,
  getDebtForUser,
  getOpenPending,
  getTransactionForUser,
  listOpenDebts,
  localDate,
  recordRepayment,
  resolvePending,
  setDebtDueDate,
  undoDebtEvent,
  type ParsedTransaction,
  type PipelineItem,
  type Transaction,
  type User,
} from '@hamyon/core';
import { schema } from '@hamyon/db';
import { formatDateLabel, formatDay, formatMoney } from '../format';
import { t, tf } from '../i18n';
import type { BotContext, BotServices } from './context';

/** Debt item waiting for the user (direction / name / return direction). */
export interface PendingDebtPayload {
  debt: true;
  tx: ParsedTransaction;
  rawInput: string;
  source?: 'text' | 'voice';
  returnDirection: 'to_me' | 'by_me' | null;
  typeUncertain: boolean;
}

const UUID = '[0-9a-f-]{36}';
const fin = (s: BotServices) => ({ db: s.db, fx: s.fx, now: s.now });

export const isDebtPayload = (p: unknown): p is PendingDebtPayload => !!p && (p as PendingDebtPayload).debt === true;

function dates(s: BotServices, user: User) {
  const today = localDate(s.now(), user.timezone);
  return { today, yesterday: addDays(today, -1), year: today.slice(0, 4) };
}

/** Text + keyboard for a debt event card. */
export async function renderDebtCard(s: BotServices, user: User, tx: Transaction): Promise<{ text: string; reply_markup: InlineKeyboard }> {
  const lang = user.language;
  const d = dates(s, user);
  const debt = tx.debtId ? await getDebtForUser(s.db, user.id, tx.debtId).catch(() => null) : null;
  const when = formatDateLabel(localDate(tx.occurredAt, user.timezone), d.today, d.yesterday, lang);
  const lines: string[] = [];
  const kb = new InlineKeyboard();

  if (tx.type === 'debt_return') {
    lines.push(t(lang, 'debtReturnTitle'), tx.counterparty ?? '', formatMoney(tx.amount, tx.currency, lang));
    if (debt) {
      const open = await s.db
        .select({ remaining: schema.debts.remaining, status: schema.debts.status, deletedAt: schema.debts.deletedAt })
        .from(schema.debts)
        .where(
          and(
            eq(schema.debts.walletId, debt.walletId),
            eq(schema.debts.counterpartyKey, debt.counterpartyKey),
            eq(schema.debts.direction, debt.direction),
            eq(schema.debts.currency, debt.currency),
          ),
        );
      const remaining = open.filter((r) => r.status === 'open' && !r.deletedAt).reduce((a, r) => a + r.remaining, 0);
      lines.push(remaining === 0 ? t(lang, 'debtClosed') : `${t(lang, 'remainingLabel')}: ${formatMoney(remaining, tx.currency, lang)}`);
    }
    lines.push(when);
  } else {
    lines.push(t(lang, tx.type === 'debt_given' ? 'debtGivenTitle' : 'debtTakenTitle'), tx.counterparty ?? '', formatMoney(tx.amount, tx.currency, lang));
    if (debt && debt.remaining !== debt.total) lines.push(`${t(lang, 'remainingLabel')}: ${formatMoney(debt.remaining, debt.currency, lang)}`);
    lines.push(when);
    if (debt?.dueDate) lines.push(`${t(lang, 'dueLabel')}: ${formatDay(debt.dueDate, lang, d.year)}`);
    if (debt) kb.text(t(lang, 'setDue'), `dd:${debt.id}`);
  }
  if (tx.note) lines.splice(2, 0, tx.note);
  kb.text(t(lang, 'delete'), `ddel:${tx.id}`);
  const heard = tx.source === 'voice' && tx.rawInput ? `🎙 «${tx.rawInput}»\n\n` : '';
  return { text: heard + lines.filter(Boolean).join('\n'), reply_markup: kb };
}

async function showCard(ctx: BotContext, s: BotServices, tx: Transaction, edit: boolean) {
  const card = await renderDebtCard(s, ctx.user!, tx);
  if (edit) await ctx.editMessageText(card.text, { reply_markup: card.reply_markup });
  else await ctx.reply(card.text, { reply_markup: card.reply_markup });
}

/**
 * Drives a debt item to completion: asks direction / person when unknown,
 * then records the debt or repayment. Returns true when something was saved.
 */
export async function continueDebt(
  ctx: BotContext,
  s: BotServices,
  p: PendingDebtPayload,
  opts: { edit: boolean; consumedPendingId?: string },
): Promise<boolean> {
  const user = ctx.user!;
  const lang = user.language;
  if (opts.consumedPendingId && !(await resolvePending(s.db, opts.consumedPendingId, s.now()))) return false;
  const send = (text: string, reply_markup?: InlineKeyboard) =>
    opts.edit ? ctx.editMessageText(text, reply_markup ? { reply_markup } : {}) : ctx.reply(text, reply_markup ? { reply_markup } : {});
  const pend = (kind: 'ask_debt_direction' | 'ask_counterparty') =>
    createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind, payload: p, now: s.now() });

  if (p.typeUncertain) {
    const pending = await pend('ask_debt_direction');
    await send(
      `${formatMoney(p.tx.amount, p.tx.currency, lang)}\n${t(lang, 'askDebtDirection')}`,
      new InlineKeyboard().text(t(lang, 'debtGiven'), `dk:${pending.id}:g`).text(t(lang, 'debtTaken'), `dk:${pending.id}:t`),
    );
    return false;
  }
  if (!p.tx.counterparty) {
    await pend('ask_counterparty');
    await send(t(lang, 'askCounterparty'));
    return false;
  }

  try {
    if (p.tx.type === 'debt_given' || p.tx.type === 'debt_taken') {
      const { tx } = await createDebt(fin(s), {
        walletId: ctx.walletId!,
        userId: user.id,
        timeZone: user.timezone,
        direction: p.tx.type === 'debt_given' ? 'given' : 'taken',
        counterparty: p.tx.counterparty,
        amount: p.tx.amount,
        currency: p.tx.currency,
        date: p.tx.date,
        source: p.source ?? 'text',
        rawInput: p.rawInput,
        confidence: p.tx.confidence,
      });
      await showCard(ctx, s, tx, opts.edit);
      return true;
    }

    const r = await recordRepayment(fin(s), {
      walletId: ctx.walletId!,
      userId: user.id,
      timeZone: user.timezone,
      counterparty: p.tx.counterparty,
      returnDirection: p.returnDirection,
      amount: p.tx.amount,
      currency: p.tx.currency,
      date: p.tx.date,
      source: p.source ?? 'text',
      rawInput: p.rawInput,
    });
    switch (r.kind) {
      case 'ok':
        await showCard(ctx, s, r.tx, opts.edit);
        return true;
      case 'no_debt':
        await send(tf(lang, 'noDebtFound', { name: p.tx.counterparty }));
        return false;
      case 'ambiguous_person':
        await send(tf(lang, 'ambiguousPerson', { names: r.names.join(', ') }));
        return false;
      case 'ambiguous_direction': {
        const pending = await pend('ask_debt_direction');
        await send(
          `${p.tx.counterparty} — ${formatMoney(p.tx.amount, p.tx.currency, lang)}\n${t(lang, 'askReturnDirection')}`,
          new InlineKeyboard().text(t(lang, 'returnToMe'), `dr:${pending.id}:m`).text(t(lang, 'returnByMe'), `dr:${pending.id}:i`),
        );
        return false;
      }
      case 'currency_mismatch':
        await send(tf(lang, 'debtCurrencyMismatch', { currency: r.currency }));
        return false;
      case 'overpayment':
        await send(tf(lang, 'overpayment', {
          remaining: formatMoney(r.remaining, r.currency, lang),
          amount: formatMoney(p.tx.amount, p.tx.currency, lang),
        }));
        return false;
    }
  } catch (err) {
    if (err instanceof RateUnavailableError) {
      await send(t(lang, 'rateUnavailable'));
      return false;
    }
    throw err;
  }
}

/** Entry point from the text pipeline for `decision: 'debt'` items. */
export function debtPayloadFrom(item: PipelineItem, rawInput: string, threshold: number, source: 'text' | 'voice' = 'text'): PendingDebtPayload {
  return {
    debt: true,
    tx: item.tx,
    rawInput,
    source,
    returnDirection: item.returnDirection,
    typeUncertain: item.tx.type !== 'debt_return' && item.typeConfidence < threshold,
  };
}

/** Reply to "Kim bilan?": a short text with no amount is the person's name. */
export async function answerCounterparty(ctx: BotContext, s: BotServices, pendingId: string, payload: PendingDebtPayload, text: string) {
  const name = cleanCounterparty(text);
  return continueDebt(ctx, s, { ...payload, tx: { ...payload.tx, counterparty: name } }, { edit: false, consumedPendingId: pendingId });
}

export function registerDebtFlows(bot: Bot<BotContext>, s: BotServices): void {
  const withPending = async (ctx: BotContext, id: string) => {
    const pending = await getOpenPending(s.db, ctx.user!.id, id, s.now());
    if (!pending || !isDebtPayload(pending.payload)) {
      await ctx.answerCallbackQuery({ text: t(ctx.user!.language, 'expired') });
      return null;
    }
    return pending as typeof pending & { payload: PendingDebtPayload };
  };

  bot.callbackQuery(new RegExp(`^dk:(${UUID}):([gt])$`), async (ctx) => {
    const pending = await withPending(ctx, ctx.match[1]!);
    if (!pending) return;
    await ctx.answerCallbackQuery();
    const type = ctx.match[2] === 'g' ? 'debt_given' : 'debt_taken';
    await continueDebt(ctx, s, { ...pending.payload, typeUncertain: false, tx: { ...pending.payload.tx, type } }, {
      edit: true,
      consumedPendingId: pending.id,
    });
  });

  bot.callbackQuery(new RegExp(`^dr:(${UUID}):([mi])$`), async (ctx) => {
    const pending = await withPending(ctx, ctx.match[1]!);
    if (!pending) return;
    await ctx.answerCallbackQuery();
    await continueDebt(ctx, s, { ...pending.payload, returnDirection: ctx.match[2] === 'm' ? 'to_me' : 'by_me' }, {
      edit: true,
      consumedPendingId: pending.id,
    });
  });

  // Due date menu, keyed by debt id.
  bot.callbackQuery(new RegExp(`^dd:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const debt = await getDebtForUser(s.db, user.id, ctx.match[1]!);
    const lang = user.language;
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({
      reply_markup: new InlineKeyboard()
        .text(t(lang, 'dueWeek'), `dds:${debt.id}:7`)
        .text(t(lang, 'due2Weeks'), `dds:${debt.id}:14`)
        .text(t(lang, 'dueMonth'), `dds:${debt.id}:30`)
        .row()
        .text(t(lang, 'dueNone'), `dds:${debt.id}:0`),
    });
  });

  bot.callbackQuery(new RegExp(`^dds:(${UUID}):(0|7|14|30)$`), async (ctx) => {
    const user = ctx.user!;
    const days = Number(ctx.match[2]);
    const due = days === 0 ? null : addDays(localDate(s.now(), user.timezone), days);
    const debt = await setDebtDueDate(fin(s), user.id, ctx.match[1]!, due);
    const [tx] = await s.db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.debtId, debt.id), inArray(schema.transactions.type, ['debt_given', 'debt_taken'])))
      .limit(1);
    await ctx.answerCallbackQuery();
    if (tx) await showCard(ctx, s, tx, true);
  });

  bot.callbackQuery(new RegExp(`^ddel:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    let tx: Transaction;
    try {
      tx = await deleteDebtEvent(fin(s), user.id, ctx.match[1]!);
    } catch (err) {
      if (err instanceof AppError && err.code === 'validation') {
        await ctx.answerCallbackQuery({ text: t(user.language, 'debtHasPayments'), show_alert: true });
        return;
      }
      throw err;
    }
    await ctx.answerCallbackQuery();
    const card = await renderDebtCard(s, user, tx);
    await ctx.editMessageText(`${t(user.language, 'deleted')}\n${card.text}`, {
      reply_markup: new InlineKeyboard().text(t(user.language, 'undo'), `dundo:${tx.id}`),
    });
  });

  bot.callbackQuery(new RegExp(`^dundo:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const { ok, tx } = await undoDebtEvent(fin(s), user.id, ctx.match[1]!);
    if (!ok) {
      await ctx.answerCallbackQuery({ text: t(user.language, 'undoExpired') });
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      return;
    }
    await ctx.answerCallbackQuery({ text: t(user.language, 'restored') });
    await showCard(ctx, s, tx, true);
  });

  // TZ §15: /qarzlar — open debts per person, with due dates.
  bot.command('qarzlar', async (ctx) => {
    const user = ctx.user!;
    const lang = user.language;
    const rows = await listOpenDebts(s.db, user.id, ctx.walletId!);
    if (rows.length === 0) {
      await ctx.reply(`${t(lang, 'debtsTitle')}\n\n${t(lang, 'noDebts')}`);
      return;
    }
    const year = localDate(s.now(), user.timezone).slice(0, 4);
    const line = (r: (typeof rows)[number]) =>
      `• ${r.counterparty} — ${formatMoney(r.remaining, r.currency, lang)}${r.nearestDue ? ` (${t(lang, 'dueLabel').toLowerCase()}: ${formatDay(r.nearestDue, lang, year)})` : ''}`;
    const given = rows.filter((r) => r.direction === 'given');
    const taken = rows.filter((r) => r.direction === 'taken');
    const parts = [t(lang, 'debtsTitle')];
    if (given.length) parts.push('', t(lang, 'owedToMe'), ...given.map(line));
    if (taken.length) parts.push('', t(lang, 'iOwe'), ...taken.map(line));
    await ctx.reply(parts.join('\n'));
  });
}

/** Opens a debt card as a new message (from /oxirgi). */
export async function replyDebtCard(ctx: BotContext, s: BotServices, txId: string): Promise<void> {
  const tx = await getTransactionForUser(s.db, ctx.user!.id, txId);
  if (tx.deletedAt) return;
  await showCard(ctx, s, tx, false);
}
