import { InlineKeyboard, type Bot } from 'grammy';
import {
  AppError,
  cancelAwaitingReplies,
  contributeToGoal,
  createGoal,
  createPending,
  extractAmounts,
  getOpenPending,
  listGoals,
  localDate,
  removeGoal,
  resolvePending,
  tokenize,
  type Goal,
  type Language,
} from '@hamyon/core';
import { formatDay, formatMoney, groupDigits } from '../format';
import { t, tf } from '../i18n';
import type { BotContext, BotServices } from './context';
import { b, bar, esc } from './html';

const UUID = '[0-9a-f-]{36}';

/** "maqsadga 200 ming", "мақсадга 200 минг", "на цель 200к", "в копилку 50к". */
const GOAL_PREFIX = /^\s*(maqsad(ga|imga)?|мақсад(га|имга)?|на\s+цель|в\s+копилку|копилка)\b[\s:,-]*/iu;

export function goalsText(lang: Language, list: Goal[], year: string): string {
  const title = b(t(lang, 'goalsTitle'));
  if (list.length === 0) return `${title}\n\n${t(lang, 'goalsEmpty')}`;
  const blocks = list.map((g) => {
    const pct = Math.min(100, Math.floor((g.savedAmount / g.targetAmount) * 100));
    const extra = [
      g.targetDate ? formatDay(g.targetDate, lang, year) : null,
      g.perMonth ? tf(lang, 'goalPerMonth', { amount: formatMoney(g.perMonth, g.currency, lang) }) : null,
    ].filter(Boolean);
    return `${g.completed ? '✅' : '🎯'} ${b(esc(g.name))}  ${bar(g.savedAmount / g.targetAmount)} ${b(`${pct}%`)}\n    ${groupDigits(g.savedAmount)} / ${formatMoney(g.targetAmount, g.currency, lang)}${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
  });
  return `${title}\n\n${blocks.join('\n')}`;
}

const goalsOf = (ctx: BotContext, s: BotServices) =>
  listGoals(s.db, { userId: ctx.user!.id, walletId: ctx.walletId!, timeZone: ctx.user!.timezone, now: s.now() });

async function showGoals(ctx: BotContext, s: BotServices, edit: boolean) {
  const user = ctx.user!;
  const list = await goalsOf(ctx, s);
  const kb = new InlineKeyboard().text(t(user.language, 'goalNew'), 'gl:new').row();
  for (const g of list) {
    kb.text(tf(user.language, 'goalAddMoney', { name: g.name }).slice(0, 40), `gl:add:${g.id}`).text('🗑', `gl:del:${g.id}`).row();
  }
  const text = goalsText(user.language, list, localDate(s.now(), user.timezone).slice(0, 4));
  if (edit) await ctx.editMessageText(text, { reply_markup: kb });
  else await ctx.reply(text, { reply_markup: kb });
}

/** Adds money to a goal and replies with the result (and a congratulation when reached). */
async function contribute(ctx: BotContext, s: BotServices, goalId: string, amount: number) {
  const user = ctx.user!;
  let r: Awaited<ReturnType<typeof contributeToGoal>>;
  try {
    r = await contributeToGoal(s.db, { userId: user.id, goalId, amount, timeZone: user.timezone, now: s.now() });
  } catch (err) {
    if (err instanceof AppError && err.message === 'more than saved') {
      await ctx.reply(t(user.language, 'goalTooMuch'));
      return;
    }
    throw err;
  }
  const g = r.goal;
  const head = tf(user.language, amount > 0 ? 'goalSaved' : 'goalWithdrawn', {
    name: g.name,
    amount: formatMoney(Math.abs(amount), g.currency, user.language),
  });
  const pct = Math.min(100, Math.floor((g.savedAmount / g.targetAmount) * 100));
  const progress = `${bar(g.savedAmount / g.targetAmount)} ${b(`${pct}%`)} · ${groupDigits(g.savedAmount)} / ${formatMoney(g.targetAmount, g.currency, user.language)}`;
  await ctx.reply([head, progress, ...(r.justCompleted ? ['', tf(user.language, 'goalDone', { name: g.name })] : [])].join('\n'));
}

const signedAmount = (text: string): number | null => {
  const amounts = extractAmounts(tokenize(text));
  if (amounts.length !== 1) return null;
  return /^\s*[-−]/.test(text) ? -amounts[0]!.value : amounts[0]!.value;
};

/** Replies to goal prompts. */
export async function answerGoalText(ctx: BotContext, s: BotServices, pendingId: string, text: string) {
  const user = ctx.user!;
  const amounts = extractAmounts(tokenize(text));
  const name = text
    .replace(/[-+]?\d[\d\s.,]*/g, ' ')
    .replace(/\b(ming|mln|million|milliard|k|kk|so'?m|сум|сўм|тыс\w*|млн|минг|\$|dollar)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (amounts.length !== 1 || !name) {
    await ctx.reply(t(user.language, 'goalNotUnderstood'));
    return;
  }
  if (!(await resolvePending(s.db, pendingId, s.now()))) return;
  try {
    await createGoal(s.db, { userId: user.id, walletId: ctx.walletId!, name, targetAmount: amounts[0]!.value, currency: amounts[0]!.currency ?? user.currency });
  } catch (err) {
    if (err instanceof AppError && err.message === 'too many') return void (await ctx.reply(t(user.language, 'genericError')));
    throw err;
  }
  await showGoals(ctx, s, false);
}

export async function answerGoalAmount(ctx: BotContext, s: BotServices, pendingId: string, payload: unknown, text: string): Promise<boolean> {
  const amount = signedAmount(text);
  if (amount === null) return false;
  if (!(await resolvePending(s.db, pendingId, s.now()))) return true;
  await contribute(ctx, s, (payload as { goalId: string }).goalId, amount);
  return true;
}

/** "maqsadga 200 ming": true when the message was a goal contribution. */
export async function tryGoalShortcut(ctx: BotContext, s: BotServices, text: string): Promise<boolean> {
  const m = GOAL_PREFIX.exec(text);
  if (!m) return false;
  const user = ctx.user!;
  const amount = signedAmount(text.slice(m[0].length));
  if (amount === null) return false;
  const open = (await goalsOf(ctx, s)).filter((g) => !g.completed || amount < 0);
  if (open.length === 0) {
    await showGoals(ctx, s, false);
    return true;
  }
  if (open.length === 1) {
    await contribute(ctx, s, open[0]!.id, amount);
    return true;
  }
  const p = await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'goal_pick', payload: { amount }, now: s.now(), ttlMinutes: 30 });
  const kb = new InlineKeyboard();
  for (const g of open) kb.text(`🎯 ${g.name}`.slice(0, 40), `gl:pick:${p.id}:${g.id}`).row();
  await ctx.reply(`${b(formatMoney(Math.abs(amount), user.currency, user.language))}\n${t(user.language, 'goalPick')}`, { reply_markup: kb });
  return true;
}

export function registerGoals(bot: Bot<BotContext>, s: BotServices): void {
  bot.command(['maqsad', 'maqsadlar'], (ctx) => showGoals(ctx, s, false));

  bot.callbackQuery('gl:new', async (ctx) => {
    const user = ctx.user!;
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'goal_text', payload: {}, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(user.language, 'goalAskText'));
  });

  bot.callbackQuery(new RegExp(`^gl:add:(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const goal = (await goalsOf(ctx, s)).find((g) => g.id === ctx.match[1]);
    if (!goal) throw new AppError('not_found');
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'goal_amount', payload: { goalId: goal.id }, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.reply(tf(user.language, 'goalAskAmount', { name: goal.name }));
  });

  bot.callbackQuery(new RegExp(`^gl:pick:(${UUID}):(${UUID})$`), async (ctx) => {
    const user = ctx.user!;
    const pending = await getOpenPending(s.db, user.id, ctx.match[1]!, s.now());
    if (!pending || pending.kind !== 'goal_pick') {
      await ctx.answerCallbackQuery({ text: t(user.language, 'expired') });
      return;
    }
    await ctx.answerCallbackQuery();
    if (!(await resolvePending(s.db, pending.id, s.now()))) return;
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    await contribute(ctx, s, ctx.match[2]!, (pending.payload as { amount: number }).amount);
  });

  bot.callbackQuery(new RegExp(`^gl:del:(${UUID})$`), async (ctx) => {
    await removeGoal(s.db, ctx.user!.id, ctx.match[1]!);
    await ctx.answerCallbackQuery({ text: t(ctx.user!.language, 'deleted') });
    await showGoals(ctx, s, true);
  });
}
