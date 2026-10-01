import { Bot, InlineKeyboard, type Api, type RawApi } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { ensureUser, issueLoginToken, AppError } from '@hamyon/core';
import { t } from '../i18n';
import type { BotContext, BotServices } from './context';
import { registerDebtFlows } from './debts';
import { registerTransactionFlows } from './flows';
import { registerOnboarding } from './onboarding';
import { registerReports } from './reports';

export type { BotContext, BotServices } from './context';

export interface BotDeps extends BotServices {
  token: string;
  defaults?: { currency?: 'UZS' | 'USD'; timezone?: string; reminderTime?: string };
  apiRoot?: string;
  /** Pre-fetched bot info (tests, or to skip getMe on startup). */
  botInfo?: UserFromGetMe;
  /** Hook to wrap Telegram API calls (tests capture outgoing messages). */
  configureApi?: (api: Api<RawApi>) => void;
}

export function createBot(deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.token, {
    ...(deps.botInfo && { botInfo: deps.botInfo }),
    ...(deps.apiRoot && { client: { apiRoot: deps.apiRoot } }),
  });
  deps.configureApi?.(bot.api);

  // Error boundary first: bot.catch() is polling-only, so webhook mode needs this.
  // Internal errors are logged; the user sees only a localized generic message.
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      // User provisioning failed (DB unavailable): let the webhook return 5xx
      // so Telegram re-delivers the update instead of losing the message.
      if (!ctx.user) throw error;
      const lang = ctx.user.language;
      if (error instanceof AppError && (error.code === 'not_found' || error.code === 'forbidden')) {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: t(lang, 'expired') }).catch(() => {});
        return;
      }
      deps.log.error({ err: error, updateId: ctx.update.update_id }, 'bot handler failed');
      try {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        await ctx.reply(t(lang, 'genericError'));
      } catch {
        // Delivery failure must not mask the original error.
      }
    }
  });

  // Only private chats in MVP; groups are ignored silently.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    if (!ctx.from || ctx.from.is_bot) return;
    const { user, personalWalletId, created } = await ensureUser(
      deps.db,
      {
        telegramId: ctx.from.id,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        languageCode: ctx.from.language_code ?? null,
      },
      deps.defaults,
    );
    ctx.user = user;
    ctx.walletId = personalWalletId;
    if (created) deps.log.info({ event: 'user_created' }, 'new user');
    await next();
  });

  registerOnboarding(bot, deps);
  registerReports(bot, deps);

  bot.command('web', async (ctx) => {
    const user = ctx.user!;
    if (!deps.webLoginUrl) {
      await ctx.reply(t(user.language, 'webUnavailable'));
      return;
    }
    const { token } = await issueLoginToken(deps.db, deps.auth, user.id);
    const url = deps.webLoginUrl(token);
    const keyboard = url.startsWith('https://') ? new InlineKeyboard().url(t(user.language, 'webLinkButton'), url) : undefined;
    await ctx.reply(`${t(user.language, 'webLink')}\n${url}`, {
      ...(keyboard && { reply_markup: keyboard }),
      link_preview_options: { is_disabled: true },
    });
  });

  registerDebtFlows(bot, deps);
  registerTransactionFlows(bot, deps);

  // Unknown commands → help.
  bot.on('message:text', (ctx) => ctx.reply(t(ctx.user!.language, 'help')));

  return bot;
}
