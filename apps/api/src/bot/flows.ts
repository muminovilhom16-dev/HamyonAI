import { InlineKeyboard, type Bot } from 'grammy';
import {
  AppError,
  RateUnavailableError,
  addDays,
  cancelAwaitingReplies,
  createPending,
  createTransaction,
  extractAmounts,
  getOpenPending,
  getTransactionForUser,
  latestAwaitingReply,
  learnRule,
  listUserRules,
  listWalletCategories,
  localDate,
  logAIUsage,
  parseRuleBased,
  patternFromText,
  resolvePending,
  runPipeline,
  softDeleteTransaction,
  deleteDebtEvent,
  DEBT_TYPES,
  toCategoryOptions,
  tokenize,
  undoDelete,
  updatePendingPayload,
  updateTransaction,
  type ParsedTransaction,
  type PipelineItem,
  type Transaction,
  type User,
} from '@hamyon/core';
import { formatMoney } from '../format';
import { t } from '../i18n';
import {
  cardEnv,
  cardText,
  categoryKeyboard,
  dateKeyboard,
  parsedFields,
  resolveCatRef,
  txFields,
  txKeyboard,
  type CardEnv,
} from './cards';
import type { BotContext, BotServices } from './context';
import { answerCounterparty, continueDebt, debtPayloadFrom, isDebtPayload, replyDebtCard, renderDebtCard, type PendingDebtPayload } from './debts';
import { afterFirstTransaction } from './onboarding';

/** Parsed item waiting for the user, stored in pending_inputs.payload. */
export type InputSource = 'text' | 'voice';

interface PendingTxPayload {
  tx: ParsedTransaction;
  rawInput: string;
  source?: InputSource;
  candidates: string[];
  categoryPending: boolean;
}
interface AskAmountPayload { text: string }
interface EditAmountPayload { txId?: string; pendingId?: string }

const UUID = '[0-9a-f-]{36}';

async function envFor(s: BotServices, user: User, walletId: string): Promise<CardEnv> {
  const categories = await listWalletCategories(s.db, walletId, user.language);
  return cardEnv(user.language, user.timezone, s.now(), categories);
}

function fin(s: BotServices) {
  return { db: s.db, fx: s.fx, now: s.now };
}

/** Saves a confirmed parsed transaction and sends/edits its card. */
async function saveAndShow(
  ctx: BotContext,
  s: BotServices,
  tx: ParsedTransaction,
  rawInput: string,
  opts: { categoryPending?: boolean; edit?: boolean; source?: InputSource },
): Promise<Transaction | null> {
  const user = ctx.user!;
  let saved: Transaction;
  try {
    saved = await createTransaction(fin(s), {
      walletId: ctx.walletId!,
      userId: user.id,
      timeZone: user.timezone,
      tx,
      source: opts.source ?? 'text',
      rawInput,
      categoryPending: opts.categoryPending ?? false,
    });
  } catch (err) {
    if (err instanceof RateUnavailableError) {
      await ctx.reply(t(user.language, 'rateUnavailable'));
      return null;
    }
    throw err;
  }
  const env = await envFor(s, user, ctx.walletId!);
  const text = cardText(txFields(saved, env, user.timezone), env);
  const reply_markup = txKeyboard(saved, env, user.timezone);
  if (opts.edit) await ctx.editMessageText(text, { reply_markup });
  else await ctx.reply(text, { reply_markup });
  return saved;
}

async function askCategory(ctx: BotContext, s: BotServices, pendingId: string, p: PendingTxPayload, edit: boolean) {
  const user = ctx.user!;
  const env = await envFor(s, user, ctx.walletId!);
  const transcript = p.source === 'voice' ? p.rawInput : null;
  const text = cardText(parsedFields(p.tx, env, true, transcript), env, t(user.language, 'pickCategory'));
  const reply_markup = categoryKeyboard(env, p.tx.type === 'income' ? 'income' : 'expense', `pc:${pendingId}`, { first: p.candidates });
  if (edit) await ctx.editMessageText(text, { reply_markup });
  else await ctx.reply(text, { reply_markup });
}

async function handleItem(ctx: BotContext, s: BotServices, item: PipelineItem, rawInput: string, source: InputSource): Promise<boolean> {
  const user = ctx.user!;
  const transcript = source === 'voice' ? rawInput : null;
  const payload: PendingTxPayload = {
    tx: item.tx,
    rawInput,
    source,
    candidates: item.categoryCandidates,
    categoryPending: item.categoryPending,
  };
  const pend = (kind: 'confirm_amount' | 'confirm_category' | 'ask_person_kind') =>
    createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind, payload, now: s.now() });

  switch (item.decision) {
    case 'save':
      return (await saveAndShow(ctx, s, item.tx, rawInput, { categoryPending: item.categoryPending, source })) !== null;
    case 'confirm_amount': {
      const p = await pend('confirm_amount');
      const env = await envFor(s, user, ctx.walletId!);
      await ctx.reply(cardText(parsedFields(item.tx, env, false, transcript), env, t(user.language, 'confirmAmountQ')), {
        reply_markup: new InlineKeyboard()
          .text(`✅ ${formatMoney(item.tx.amount, item.tx.currency, user.language)}`, `pa:${p.id}`)
          .text(t(user.language, 'otherAmount'), `pe:${p.id}`),
      });
      return false;
    }
    case 'confirm_category': {
      const p = await pend('confirm_category');
      await askCategory(ctx, s, p.id, payload, false);
      return false;
    }
    case 'ask_person_kind': {
      const p = await pend('ask_person_kind');
      const who = item.tx.counterparty ? `${item.tx.counterparty} — ` : '';
      await ctx.reply(`${who}${formatMoney(item.tx.amount, item.tx.currency, user.language)}\n${t(user.language, 'personKindQ')}`, {
        reply_markup: new InlineKeyboard()
          .text(t(user.language, 'debtGiven'), `pk:${p.id}:d`)
          .text(t(user.language, 'expense'), `pk:${p.id}:e`),
      });
      return false;
    }
    case 'debt': {
      // Debt is never an expense (TZ rule 1): it goes to the debt engine.
      const dp = debtPayloadFrom(item, rawInput, s.confidenceThreshold, source);
      if (item.amountConfidence < s.confidenceThreshold) {
        const p = await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'confirm_amount', payload: dp, now: s.now() });
        const who = item.tx.counterparty ? ` — ${item.tx.counterparty}` : '';
        const heard = transcript ? `🎙 «${transcript}»\n\n` : '';
        await ctx.reply(`${heard}${formatMoney(item.tx.amount, item.tx.currency, user.language)}${who}\n${t(user.language, 'confirmAmountQ')}`, {
          reply_markup: new InlineKeyboard()
            .text(`✅ ${formatMoney(item.tx.amount, item.tx.currency, user.language)}`, `pa:${p.id}`)
            .text(t(user.language, 'otherAmount'), `pe:${p.id}`),
        });
        return false;
      }
      return continueDebt(ctx, s, dp, { edit: false });
    }
  }
}

/** A short reply that is only an amount ("50 ming"): no content words. */
function amountOnly(text: string, today: string): number | null {
  const parsed = parseRuleBased(text, { today });
  if (parsed.items.length !== 1 || parsed.contentTokens.length > 0) return null;
  const amounts = extractAmounts(tokenize(text));
  return amounts.length === 1 ? amounts[0]!.value : null;
}

export async function processText(ctx: BotContext, s: BotServices, text: string, source: InputSource = 'text'): Promise<void> {
  const user = ctx.user!;
  const today = localDate(s.now(), user.timezone);

  // A reply to "write the amount" prompts.
  const awaiting = await latestAwaitingReply(s.db, user.id, s.now());
  if (awaiting) {
    const amount = amountOnly(text, today);
    if (awaiting.kind === 'edit_amount' && amount !== null) {
      await resolvePending(s.db, awaiting.id, s.now());
      const target = awaiting.payload as EditAmountPayload;
      if (target.txId) {
        const tx = await updateTransaction(fin(s), user.id, target.txId, { amount }, user.timezone);
        const env = await envFor(s, user, ctx.walletId!);
        await ctx.reply(cardText(txFields(tx, env, user.timezone), env), { reply_markup: txKeyboard(tx, env, user.timezone) });
        return;
      }
      if (target.pendingId) {
        const pending = await getOpenPending(s.db, user.id, target.pendingId, s.now());
        if (!pending) {
          await ctx.reply(t(user.language, 'expired'));
          return;
        }
        const p = pending.payload as PendingTxPayload | PendingDebtPayload;
        await continueAfterAmount(ctx, s, pending.id, { ...p, tx: { ...p.tx, amount } }, false);
        return;
      }
    }
    if (
      awaiting.kind === 'ask_counterparty' &&
      parseRuleBased(text, { today }).items.length === 0 &&
      text.trim().split(/\s+/).length <= 4 &&
      isDebtPayload(awaiting.payload)
    ) {
      if (await answerCounterparty(ctx, s, awaiting.id, awaiting.payload, text)) await afterFirstTransaction(ctx, s);
      return;
    }
    if (awaiting.kind === 'ask_amount' && amount !== null) {
      await resolvePending(s.db, awaiting.id, s.now());
      text = `${(awaiting.payload as AskAmountPayload).text} ${text}`;
    } else {
      // Anything else is a new message; drop the stale prompt.
      await cancelAwaitingReplies(s.db, user.id, s.now());
    }
  }

  const categories = await listWalletCategories(s.db, ctx.walletId!, user.language);
  const result = await runPipeline({
    text,
    today,
    language: user.language,
    categories: toCategoryOptions(categories),
    userRules: await listUserRules(s.db, user.id, ctx.walletId!),
    ai: s.ai,
    confidenceThreshold: s.confidenceThreshold,
    onAIError: (err) => s.log.warn({ aiError: err.reason }, 'AI unavailable, using rule parser'),
  });
  if (result.usage) await logAIUsage(s.db, user.id, 'parse_text', result.usage, result.ai === 'used');

  if (result.kind === 'no_amount') {
    // Never guess (TZ §61: "bugun bozorga bordim" → ask amount).
    await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'ask_amount', payload: { text: result.maskedText }, now: s.now() });
    const heard = source === 'voice' ? `🎙 «${result.maskedText}»\n\n` : '';
    await ctx.reply(`${heard}${t(user.language, 'askAmount')}`);
    return;
  }

  let savedAny = false;
  for (const item of result.items) {
    if (await handleItem(ctx, s, item, result.maskedText, source)) savedAny = true;
  }
  if (savedAny) await afterFirstTransaction(ctx, s);
}

/** After the amount is settled: save, or ask for the category if still unknown. */
async function continueAfterAmount(
  ctx: BotContext,
  s: BotServices,
  pendingId: string,
  p: PendingTxPayload | PendingDebtPayload,
  edit: boolean,
) {
  if (isDebtPayload(p)) {
    const amountSettled = { ...p, tx: { ...p.tx, confidence: Math.max(p.tx.confidence, 0.8) } };
    if (await continueDebt(ctx, s, amountSettled, { edit, consumedPendingId: pendingId })) await afterFirstTransaction(ctx, s);
    return;
  }
  const needsCategory = p.tx.category_id === null && !p.categoryPending;
  if (needsCategory) {
    await updatePendingPayload(s.db, pendingId, p);
    await askCategory(ctx, s, pendingId, p, edit);
    return;
  }
  if (!(await resolvePending(s.db, pendingId, s.now()))) return; // double tap
  const saved = await saveAndShow(ctx, s, { ...p.tx, confidence: Math.max(p.tx.confidence, 0.8) }, p.rawInput, {
    categoryPending: p.categoryPending,
    edit,
    source: p.source ?? 'text',
  });
  if (saved) await afterFirstTransaction(ctx, s);
}

export function registerTransactionFlows(bot: Bot<BotContext>, s: BotServices): void {
  bot.on('message:text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    await processText(ctx, s, ctx.message.text);
  });

  // ─── Saved transaction card ───
  bot.callbackQuery(new RegExp(`^card:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const tx = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    const env = await envFor(s, user, tx.walletId);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env), { reply_markup: txKeyboard(tx, env, user.timezone) });
    await ctx.answerCallbackQuery();
  });

  // From /oxirgi: open the card / delete as a new message, keeping the list intact.
  bot.callbackQuery(new RegExp(`^open:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const tx = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    await ctx.answerCallbackQuery();
    if (tx.deletedAt) return;
    if (DEBT_TYPES.has(tx.type)) {
      await replyDebtCard(ctx, s, tx.id);
      return;
    }
    const env = await envFor(s, user, tx.walletId);
    await ctx.reply(cardText(txFields(tx, env, user.timezone), env), { reply_markup: txKeyboard(tx, env, user.timezone) });
  });

  bot.callbackQuery(new RegExp(`^ldel:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const target = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    if (DEBT_TYPES.has(target.type)) {
      let deleted: Transaction;
      try {
        deleted = await deleteDebtEvent(fin(s), user.id, target.id);
      } catch (err) {
        if (err instanceof AppError && err.code === 'validation') {
          await ctx.answerCallbackQuery({ text: t(user.language, 'debtHasPayments'), show_alert: true });
          return;
        }
        throw err;
      }
      await ctx.answerCallbackQuery();
      const card = await renderDebtCard(s, user, deleted);
      await ctx.reply(`${t(user.language, 'deleted')}\n${card.text}`, {
        reply_markup: new InlineKeyboard().text(t(user.language, 'undo'), `dundo:${deleted.id}`),
      });
      return;
    }
    const tx = await softDeleteTransaction(fin(s), user.id, target.id);
    const env = await envFor(s, user, tx.walletId);
    await ctx.answerCallbackQuery();
    await ctx.reply(`${t(user.language, 'deleted')}\n${cardText(txFields(tx, env, user.timezone), env)}`, {
      reply_markup: new InlineKeyboard().text(t(user.language, 'undo'), `undo:${tx.id}`),
    });
  });

  bot.callbackQuery(new RegExp(`^cat:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const tx = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    const env = await envFor(s, user, tx.walletId);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env, t(user.language, 'pickCategory')), {
      reply_markup: categoryKeyboard(env, tx.type === 'income' ? 'income' : 'expense', `sc:${tx.id}`, { back: `card:${tx.id}` }),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(new RegExp(`^sc:(${UUID}):([a-z_0-9]+)$`), async (ctx) => {
    const user = ctx.user!;
    const current = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    const env = await envFor(s, user, current.walletId);
    const cat = resolveCatRef(env.categories, ctx.match[2]!);
    if (!cat) throw new AppError('validation');
    const tx = await updateTransaction(fin(s), user.id, current.id, { categoryKey: cat.key }, user.timezone);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env), { reply_markup: txKeyboard(tx, env, user.timezone) });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(new RegExp(`^amt:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const tx = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: tx.walletId, kind: 'edit_amount', payload: { txId: tx.id }, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.reply(t(user.language, 'enterAmount'));
  });

  bot.callbackQuery(new RegExp(`^dt:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const tx = await getTransactionForUser(s.db, user.id, ctx.match[1]!);
    const env = await envFor(s, user, tx.walletId);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env, t(user.language, 'pickDate')), {
      reply_markup: dateKeyboard(env, tx.id),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(new RegExp(`^sd:(${UUID}):([012])$`), async (ctx) => {
    const user = ctx.user!;
    const date = addDays(localDate(s.now(), user.timezone), -Number(ctx.match[2]));
    const tx = await updateTransaction(fin(s), user.id, ctx.match[1]!, { date }, user.timezone);
    const env = await envFor(s, user, tx.walletId);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env), { reply_markup: txKeyboard(tx, env, user.timezone) });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(new RegExp(`^del:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const tx = await softDeleteTransaction(fin(s), user.id, ctx.match[1]!);
    const env = await envFor(s, user, tx.walletId);
    await ctx.editMessageText(`${t(user.language, 'deleted')}\n${cardText(txFields(tx, env, user.timezone), env)}`, {
      reply_markup: new InlineKeyboard().text(t(user.language, 'undo'), `undo:${tx.id}`),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(new RegExp(`^undo:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const { ok, tx } = await undoDelete(fin(s), user.id, ctx.match[1]!);
    if (!ok) {
      await ctx.answerCallbackQuery({ text: t(user.language, 'undoExpired') });
      await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      return;
    }
    const env = await envFor(s, user, tx.walletId);
    await ctx.editMessageText(cardText(txFields(tx, env, user.timezone), env), { reply_markup: txKeyboard(tx, env, user.timezone) });
    await ctx.answerCallbackQuery({ text: t(user.language, 'restored') });
  });

  // ─── Pending (not yet saved) items ───
  const withPending = async (ctx: BotContext, id: string) => {
    const pending = await getOpenPending(s.db, ctx.user!.id, id, s.now());
    if (!pending) {
      await ctx.answerCallbackQuery({ text: t(ctx.user!.language, 'expired') });
      return null;
    }
    return pending;
  };

  bot.callbackQuery(new RegExp(`^pa:(${UUID})$`), async (ctx) => {
    const pending = await withPending(ctx, ctx.match[1]!);
    if (!pending) return;
    await ctx.answerCallbackQuery();
    await continueAfterAmount(ctx, s, pending.id, pending.payload as PendingTxPayload | PendingDebtPayload, true);
  });

  bot.callbackQuery(new RegExp(`^pe:(${UUID})$`), async (ctx) => {
    const pending = await withPending(ctx, ctx.match[1]!);
    if (!pending) return;
    const user = ctx.user!;
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: pending.walletId, kind: 'edit_amount', payload: { pendingId: pending.id }, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.reply(t(user.language, 'enterAmount'));
  });

  bot.callbackQuery(new RegExp(`^pc:(${UUID}):([a-z_0-9]+)$`), async (ctx) => {
    const pending = await withPending(ctx, ctx.match[1]!);
    if (!pending) return;
    const user = ctx.user!;
    const p = pending.payload as PendingTxPayload;
    const categories = await listWalletCategories(s.db, pending.walletId, user.language);
    const cat = resolveCatRef(categories, ctx.match[2]!);
    if (!cat) throw new AppError('validation');
    await ctx.answerCallbackQuery();
    if (!(await resolvePending(s.db, pending.id, s.now()))) return;
    // The user's choice teaches the next parse (TZ §10).
    const pattern = patternFromText(p.tx.note);
    if (pattern) await learnRule(s.db, user.id, pending.walletId, pattern, cat.id);
    const saved = await saveAndShow(ctx, s, { ...p.tx, category_id: cat.key, confidence: 1 }, p.rawInput, { edit: true, source: p.source ?? 'text' });
    if (saved) await afterFirstTransaction(ctx, s);
  });

  bot.callbackQuery(new RegExp(`^pk:(${UUID}):([de])$`), async (ctx) => {
    const pending = await withPending(ctx, ctx.match[1]!);
    if (!pending) return;
    const user = ctx.user!;
    await ctx.answerCallbackQuery();
    const p = pending.payload as PendingTxPayload;
    if (ctx.match[2] === 'd') {
      const dp: PendingDebtPayload = {
        debt: true,
        tx: { ...p.tx, type: 'debt_given', category_id: null },
        rawInput: p.rawInput,
        source: p.source ?? 'text',
        returnDirection: null,
        typeUncertain: false,
      };
      if (await continueDebt(ctx, s, dp, { edit: true, consumedPendingId: pending.id })) await afterFirstTransaction(ctx, s);
      return;
    }
    await askCategory(ctx, s, pending.id, { ...p, tx: { ...p.tx, type: 'expense' } }, true);
  });

  // Callback for an item we can no longer find: answer without leaking details.
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery({ text: t(ctx.user?.language ?? 'uz_latn', 'expired') });
  });
}

