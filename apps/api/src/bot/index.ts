import { Bot, Context, InlineKeyboard, type Api, type RawApi } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from '@hamyon/db';
import { schema } from '@hamyon/db';
import { ensureUser, issueLoginToken, type AuthConfig, type User } from '@hamyon/core';
import { t } from '../i18n';

export interface BotContext extends Context {
  user?: User;
  walletId?: string;
}

export interface BotDeps {
  token: string;
  db: Database;
  auth: AuthConfig;
  log: FastifyBaseLogger;
  /** Builds the public one-time login URL; undefined when web is not configured. */
  webLoginUrl?: (token: string) => string;
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
      deps.log.error({ err: error, updateId: ctx.update.update_id }, 'bot handler failed');
      try {
        await ctx.reply(t(ctx.user?.language ?? 'uz_latn', 'genericError'));
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

  bot.command('start', async (ctx) => {
    const user = ctx.user!;
    await deps.db.insert(schema.analyticsEvents).values({ userId: user.id, name: 'start' });
    await ctx.reply(t(user.language, 'welcome'));
  });

  bot.command('web', async (ctx) => {
    const user = ctx.user!;
    if (!deps.webLoginUrl) {
      await ctx.reply(t(user.language, 'webUnavailable'));
      return;
    }
    const { token } = await issueLoginToken(deps.db, deps.auth, user.id);
    const url = deps.webLoginUrl(token);
    const keyboard = url.startsWith('https://')
      ? new InlineKeyboard().url(t(user.language, 'webLinkButton'), url)
      : undefined;
    await ctx.reply(`${t(user.language, 'webLink')}\n${url}`, {
      ...(keyboard && { reply_markup: keyboard }),
      link_preview_options: { is_disabled: true },
    });
  });

  return bot;
}
