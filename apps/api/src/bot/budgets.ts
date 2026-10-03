import { InlineKeyboard, type Bot } from 'grammy';
import {
  AppError,
  budgetCrossings,
  budgetStatus,
  createPending,
  cancelAwaitingReplies,
  extractAmounts,
  listWalletCategories,
  localDate,
  removeBudget,
  resolvePending,
  setBudget,
  tokenize,
  type BudgetStatus,
  type Language,
  type Transaction,
  type User,
} from '@hamyon/core';
import { formatMoney, groupDigits } from '../format';
import { t, tf } from '../i18n';
import { cardEnv, categoryKeyboard, resolveCatRef } from './cards';
import type { BotContext, BotServices } from './context';
import { b, bar, esc } from './html';

const UUID = '[0-9a-f-]{36}';
const MONTHS: Record<Language, string[]> = {
  uz_latn: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  uz_cyrl: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'],
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
};

interface BudgetPendingPayload { categoryId: string | null }

const label = (lang: Language, s: BudgetStatus) =>
  s.categoryId === null ? `💰 ${t(lang, 'budgetTotal')}` : `${s.icon ?? '🏷'} ${s.name ?? ''}`;

const statusOf = (s: BotServices, user: User, walletId: string) =>
  budgetStatus(s.db, { userId: user.id, walletId, timeZone: user.timezone, now: s.now(), lang: user.language });

/** "🎯 Byudjet · oktabr" + one block per budget with a bar and what is left. */
export function budgetText(lang: Language, month: number, list: BudgetStatus[]): string {
  const title = b(`${t(lang, 'budgetTitle')} · ${MONTHS[lang][month]}`);
  if (list.length === 0) return `${title}\n\n${t(lang, 'budgetEmpty')}`;
  const blocks = list.map((x) => {
    const pct = Math.round((x.spentUzs / x.limitUzs) * 100);
    const left = x.limitUzs - x.spentUzs;
    const tail = left >= 0 ? `${formatMoney(left, 'UZS', lang)} ${t(lang, 'budgetLeft')}` : `${formatMoney(-left, 'UZS', lang)} ${t(lang, 'budgetOver')}`;
    return `${esc(label(lang, x))}  ${bar(x.spentUzs / x.limitUzs)} ${b(`${pct}%`)}${pct >= 100 ? ' 🔴' : pct >= 80 ? ' ⚠️' : ''}\n    ${groupDigits(x.spentUzs)} / ${formatMoney(x.limitUzs, 'UZS', lang)} · ${tail}`;
  });
  return `${title}\n\n${blocks.join('\n')}`;
}

function budgetKeyboard(lang: Language, list: BudgetStatus[]): InlineKeyboard {
  const kb = new InlineKeyboard().text(t(lang, 'budgetAdd'), 'bg:add').row();
  list.forEach((x, i) => {
    kb.text(`🗑 ${label(lang, x)}`, `bg:del:${x.id}`);
    if (i % 2 === 1) kb.row();
  });
  return kb;
}

async function showBudgets(ctx: BotContext, s: BotServices, edit: boolean) {
  const user = ctx.user!;
  const list = await statusOf(s, user, ctx.walletId!);
  const month = Number(localDate(s.now(), user.timezone).slice(5, 7)) - 1;
  const text = budgetText(user.language, month, list);
  const reply_markup = budgetKeyboard(user.language, list);
  if (edit) await ctx.editMessageText(text, { reply_markup });
  else await ctx.reply(text, { reply_markup });
}

/** Saves a limit; false (and a message) when the plan's budget count is reached. */
async function saveBudget(ctx: BotContext, s: BotServices, categoryId: string | null, amountUzs: number): Promise<boolean> {
  const user = ctx.user!;
  const plan = (user.plan in s.plans ? user.plan : 'free') as keyof typeof s.plans;
  try {
    await setBudget(s.db, { userId: user.id, walletId: ctx.walletId!, categoryId, amountUzs, maxBudgets: s.plans[plan].budgets });
    return true;
  } catch (err) {
    if (err instanceof AppError && err.message === 'budget limit') {
      await ctx.reply(t(user.language, 'budgetPlanLimit'));
      return false;
    }
    throw err;
  }
}

const TOTAL_WORDS = ['umumiy', 'jami', 'hammasi', 'умумий', 'жами', 'всего', 'общий', 'все'];

/**
 * Lines to append to a saved expense card when it pushed a budget past 80% or 100%.
 * A reply to the user's own message, so it is not a proactive notification.
 */
export async function budgetAlertLines(s: BotServices, user: User, tx: Transaction): Promise<string[]> {
  if (tx.type !== 'expense' || tx.deletedAt) return [];
  const after = await statusOf(s, user, tx.walletId);
  if (after.length === 0) return [];
  return budgetCrossings(after, { categoryId: tx.categoryId, amountUzs: tx.amountUzs }).map((x) =>
    tf(user.language, x.threshold >= 100 ? 'budgetAlert100' : 'budgetAlert80', {
      name: x.categoryId === null ? t(user.language, 'budgetTotal') : x.name ?? '',
      pct: String(Math.round((x.spentUzs / x.limitUzs) * 100)),
      spent: groupDigits(x.spentUzs),
      limit: formatMoney(x.limitUzs, 'UZS', user.language),
    }),
  );
}

/** Reply to the "write the limit" prompt. */
export async function answerBudgetAmount(ctx: BotContext, s: BotServices, pendingId: string, payload: unknown, amount: number) {
  if (!(await resolvePending(s.db, pendingId, s.now()))) return;
  const { categoryId } = payload as BudgetPendingPayload;
  if (await saveBudget(ctx, s, categoryId, amount)) await showBudgets(ctx, s, false);
}

export function registerBudgets(bot: Bot<BotContext>, s: BotServices): void {
  bot.command('byudjet', async (ctx) => {
    const user = ctx.user!;
    const args = (ctx.match ?? '').trim();
    if (!args) return showBudgets(ctx, s, false);

    // "/byudjet oziq-ovqat 2 mln" or "/byudjet umumiy 5 mln"
    const amounts = extractAmounts(tokenize(args));
    const words = args
      .replace(/[\d.,]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !/^(ming|mln|million|k|kk|so'?m|сум|сўм|тыс|млн|минг)$/i.test(w));
    const query = words.join(' ').toLowerCase();
    const cats = (await listWalletCategories(s.db, ctx.walletId!, user.language)).filter((c) => c.kind === 'expense' && !c.isHidden);
    const isTotal = TOTAL_WORDS.includes(query);
    const cat = isTotal ? null : cats.find((c) => c.name.toLowerCase() === query) ?? cats.find((c) => query && c.name.toLowerCase().startsWith(query));
    if (amounts.length !== 1 || amounts[0]!.currency === 'USD' || (!isTotal && !cat)) {
      // Not understood: walk through it with buttons.
      return showBudgets(ctx, s, false);
    }
    if (await saveBudget(ctx, s, isTotal ? null : cat!.id, amounts[0]!.value)) await showBudgets(ctx, s, false);
  });

  bot.callbackQuery('bg:add', async (ctx) => {
    const user = ctx.user!;
    const categories = await listWalletCategories(s.db, ctx.walletId!, user.language);
    const env = cardEnv(user.language, user.timezone, s.now(), categories);
    const kb = new InlineKeyboard().text(`💰 ${t(user.language, 'budgetTotal')}`, 'bg:c:all').row();
    const grid = categoryKeyboard(env, 'expense', 'bg:c');
    for (const row of grid.inline_keyboard) kb.row(...row);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(user.language, 'budgetPick'), { reply_markup: kb });
  });

  bot.callbackQuery(/^bg:c:([a-z_0-9]+)$/, async (ctx) => {
    const user = ctx.user!;
    const ref = ctx.match[1]!;
    let payload: BudgetPendingPayload = { categoryId: null };
    let name = t(user.language, 'budgetTotal');
    if (ref !== 'all') {
      const categories = await listWalletCategories(s.db, ctx.walletId!, user.language);
      const cat = resolveCatRef(categories, ref);
      if (!cat || cat.kind !== 'expense') throw new AppError('validation');
      payload = { categoryId: cat.id };
      name = cat.name;
    }
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'budget_amount', payload, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(tf(user.language, 'budgetAskAmount', { name }));
  });

  bot.callbackQuery(new RegExp(`^bg:del:(${UUID})$`), async (ctx) => {
    await removeBudget(s.db, ctx.user!.id, ctx.match[1]!);
    await ctx.answerCallbackQuery({ text: t(ctx.user!.language, 'deleted') });
    await showBudgets(ctx, s, true);
  });
}

