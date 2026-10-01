import Fastify, { type FastifyInstance } from 'fastify';
import type { UserFromGetMe } from 'grammy/types';
import type { Api, RawApi } from 'grammy';
import type { Env } from '@hamyon/config';
import type { AuthConfig } from '@hamyon/core';
import type { DbHandle } from '@hamyon/db';
import { createBot } from './bot';
import { loggerOptions } from './logger';
import { registerErrorHandling } from './plugins/errors';
import { registerSecurity } from './plugins/security';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { telegramWebhookRoute } from './routes/telegram';

export interface BuildAppOptions {
  env: Env;
  dbHandle: DbHandle;
  botInfo?: UserFromGetMe;
  configureBotApi?: (api: Api<RawApi>) => void;
}

export const authConfigFromEnv = (env: Env): AuthConfig => ({
  secret: env.AUTH_TOKEN_SECRET,
  loginTokenTtlMinutes: env.WEB_LOGIN_TOKEN_TTL_MINUTES,
  sessionTtlDays: env.WEB_SESSION_TTL_DAYS,
});

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { env, dbHandle } = opts;
  const app = Fastify({
    logger: loggerOptions(env),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
  });

  registerErrorHandling(app);
  await registerSecurity(app, env);

  const auth = authConfigFromEnv(env);
  const bot = createBot({
    token: env.TELEGRAM_BOT_TOKEN,
    db: dbHandle.db,
    auth,
    log: app.log,
    defaults: { currency: env.DEFAULT_CURRENCY, timezone: env.DEFAULT_TIMEZONE, reminderTime: env.DEFAULT_REMINDER_TIME },
    ...(env.PUBLIC_BASE_URL && {
      webLoginUrl: (token: string) => `${env.PUBLIC_BASE_URL}/auth/web?token=${encodeURIComponent(token)}`,
    }),
    ...(env.TELEGRAM_API_ROOT && { apiRoot: env.TELEGRAM_API_ROOT }),
    ...(opts.botInfo && { botInfo: opts.botInfo }),
    ...(opts.configureBotApi && { configureApi: opts.configureBotApi }),
  });
  if (!opts.botInfo) await bot.init();

  healthRoutes(app, dbHandle.pool);
  telegramWebhookRoute(app, { path: env.TELEGRAM_WEBHOOK_PATH, secret: env.TELEGRAM_WEBHOOK_SECRET, bot, db: dbHandle.db });
  authRoutes(app, {
    db: dbHandle.db,
    auth,
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    ...(env.WEB_BASE_URL && { webBaseUrl: env.WEB_BASE_URL }),
    ...((env.TELEGRAM_BOT_USERNAME ?? bot.botInfo.username) && {
      botUsername: env.TELEGRAM_BOT_USERNAME ?? bot.botInfo.username,
    }),
  });

  return app;
}
