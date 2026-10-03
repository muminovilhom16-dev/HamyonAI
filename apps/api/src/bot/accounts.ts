import { InlineKeyboard, type Bot } from 'grammy';
import {
  AppError,
  accountHint,
  cancelAwaitingReplies,
  createAccount,
  createPending,
  extractAmounts,
  listAccounts,
  resolvePending,
  stripAccountWords,
  tokenize,
  updateAccount,
  type Account,
  type Language,
} from '@hamyon/core';
import { formatMoney } from '../format';
import { t } from '../i18n';
import type { BotContext, BotServices } from './context';
import { b, esc } from './html';

const UUID = '[0-9a-f-]{36}';

export function accountsText(lang: Language, list: Account[]): string {
  const title = b(t(lang, 'accountsTitle'));
  if (list.length === 0) return `${title}\n\n${t(lang, 'accountsEmpty')}`;
  const lines = list.map(
    (a) => `${a.kind === 'cash' ? '💵' : '💳'} ${esc(a.name)}${a.isDefault ? ` (${t(lang, 'accountDefault')})` : ''} — ${b(formatMoney(a.balance, a.currency, lang))}`,
  );
  return `${title}\n\n${lines.join('\n')}`;
}

async function showAccounts(ctx: BotContext, s: BotServices, edit: boolean) {
  const user = ctx.user!;
  const list = await listAccounts(s.db, { userId: user.id, walletId: ctx.walletId! });
  const kb = new InlineKeyboard().text(t(user.language, 'accountAdd'), 'ac:add').row();
  for (const a of list) {
    if (!a.isDefault) kb.text(`⭐ ${a.name}`.slice(0, 30), `ac:def:${a.id}`);
    kb.text(`🗑 ${a.name}`.slice(0, 30), `ac:arch:${a.id}`).row();
  }
  const text = accountsText(user.language, list);
  if (edit) await ctx.editMessageText(text, { reply_markup: kb });
  else await ctx.reply(text, { reply_markup: kb });
}

/** Reply to "name and balance": «Humo 1,2 mln», «naqd 300 ming», «Uzcard». */
export async function answerAccountText(ctx: BotContext, s: BotServices, pendingId: string, text: string) {
  const user = ctx.user!;
  if (!(await resolvePending(s.db, pendingId, s.now()))) return;
  const kind = accountHint(text) ?? 'card';
  const amounts = extractAmounts(tokenize(text));
  const words = text.replace(/[-+]?\d[\d\s.,]*/g, ' ').replace(/(?<!\p{L})(ming|mln|million|k|kk|so'?m|сум|сўм|тыс\p{L}*|млн|минг)(?!\p{L})/giu, ' ');
  const name = (stripAccountWords(words.replace(/\s+/g, ' ').trim()) ?? '') || t(user.language, kind === 'cash' ? 'accountCash' : 'accountCard');
  // Keep a recognizable card name ("Humo", "Uzcard") even though it is also a hint word.
  const cardName = /(?<!\p{L})(humo|uzcard|visa|mastercard|хумо|узкард)(?!\p{L})/iu.exec(text)?.[0];
  try {
    await createAccount(s.db, {
      userId: user.id,
      walletId: ctx.walletId!,
      name: cardName ? cardName[0]!.toUpperCase() + cardName.slice(1) : name,
      kind,
      currency: amounts[0]?.currency === 'USD' ? 'USD' : 'UZS',
      openingBalance: amounts[0]?.value ?? 0,
    });
  } catch (err) {
    if (err instanceof AppError && err.message === 'too many') return void (await ctx.reply(t(user.language, 'accountTooMany')));
    throw err;
  }
  await showAccounts(ctx, s, false);
}

export function registerAccounts(bot: Bot<BotContext>, s: BotServices): void {
  bot.command(['hisoblar', 'hisob', 'kartalar'], (ctx) => showAccounts(ctx, s, false));

  bot.callbackQuery('ac:add', async (ctx) => {
    const user = ctx.user!;
    await cancelAwaitingReplies(s.db, user.id, s.now());
    await createPending(s.db, { userId: user.id, walletId: ctx.walletId!, kind: 'account_text', payload: {}, now: s.now(), ttlMinutes: 30 });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(user.language, 'accountAskText'));
  });

  bot.callbackQuery(new RegExp(`^ac:(def|arch):(${UUID})$`), async (ctx) => {
    await updateAccount(s.db, ctx.user!.id, ctx.match[2]!, ctx.match[1] === 'def' ? { isDefault: true } : { archived: true });
    await ctx.answerCallbackQuery({ text: t(ctx.user!.language, ctx.match[1] === 'def' ? 'settingsSaved' : 'deleted') });
    await showAccounts(ctx, s, true);
  });
}
