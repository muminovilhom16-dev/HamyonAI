import Fastify, { type FastifyInstance } from 'fastify';
import type { UserFromGetMe } from 'grammy/types';
import type { Api, RawApi } from 'grammy';
import type { Env } from '@hamyon/config';
import type { AuthConfig } from '@hamyon/core';
import type { DbHandle } from '@hamyon/db';
import { createAIProvider, createSpeechProvider, type AIProvider, type SpeechProvider } from '@hamyon/ai';
import { loadPlanConfig } from '@hamyon/config';
import { CbuRateProvider, type ExchangeRateProvider } from '@hamyon/core';
import type { Bot } from 'grammy';
import { createBot, type BotContext } from './bot';
import { telegramFileDownloader } from './bot/voice';
import { loggerOptions } from './logger';
import { registerErrorHandling } from './plugins/errors';
import { registerSecurity } from './plugins/security';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { telegramWebhookRoute } from './routes/telegram';
import { webApiRoutes } from './routes/web-api';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';

declare module 'fastify' {
  interface FastifyInstance {
    bot: Bot<BotContext>;
  }
}

export interface BuildAppOptions {
  env: Env;
  dbHandle: DbHandle;
  botInfo?: UserFromGetMe;
  /** Overrides for tests; default providers come from env. */
  ai?: AIProvider | null;
  fx?: ExchangeRateProvider | null;
  speech?: SpeechProvider | null;
  downloadFile?: (filePath: string) => Promise<Uint8Array>;
  now?: () => Date;
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

  const staticDir = env.WEB_STATIC_DIR ? path.resolve(env.WEB_STATIC_DIR) : null;
  const serveWeb = !!staticDir && existsSync(path.join(staticDir, 'index.html'));
  registerErrorHandling(app, { spaFallback: serveWeb });
  await registerSecurity(app, env);
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: staticDir!,
      wildcard: false,
      setHeaders(res, filePath) {
        // Vite assets are content-hashed: cache forever; HTML never.
        res.header('cache-control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  const auth = authConfigFromEnv(env);
  const bot = createBot({
    token: env.TELEGRAM_BOT_TOKEN,
    db: dbHandle.db,
    auth,
    log: app.log,
    ai:
      opts.ai !== undefined
        ? opts.ai
        : createAIProvider({
            provider: env.AI_PROVIDER,
            model: env.AI_TEXT_MODEL,
            timeoutMs: env.AI_TIMEOUT_MS,
            ...(env.ANTHROPIC_API_KEY && { anthropicApiKey: env.ANTHROPIC_API_KEY }),
          }),
    fx: opts.fx !== undefined ? opts.fx : new CbuRateProvider(),
    speech:
      opts.speech !== undefined
        ? opts.speech
        : createSpeechProvider({
            provider: env.STT_PROVIDER,
            model: env.GOOGLE_STT_MODEL,
            apiVersion: env.GOOGLE_STT_API_VERSION,
            timeoutMs: env.STT_TIMEOUT_MS,
            usdPerMinute: env.GOOGLE_STT_USD_PER_MINUTE,
            ...(env.GOOGLE_STT_API_KEY && { googleApiKey: env.GOOGLE_STT_API_KEY }),
          }),
    downloadFile: opts.downloadFile ?? telegramFileDownloader(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_ROOT),
    plans: loadPlanConfig(env.PLAN_LIMITS_JSON),
    voiceMaxSeconds: env.VOICE_MAX_SECONDS,
    confidenceThreshold: env.AI_CONFIDENCE_THRESHOLD,
    now: opts.now ?? (() => new Date()),
    defaults: { currency: env.DEFAULT_CURRENCY, timezone: env.DEFAULT_TIMEZONE, reminderTime: env.DEFAULT_REMINDER_TIME },
    ...(env.PUBLIC_BASE_URL && {
      webLoginUrl: (token: string) => `${env.PUBLIC_BASE_URL}/auth/web?token=${encodeURIComponent(token)}`,
    }),
    ...(env.TELEGRAM_API_ROOT && { apiRoot: env.TELEGRAM_API_ROOT }),
    ...(opts.botInfo && { botInfo: opts.botInfo }),
    ...(opts.configureBotApi && { configureApi: opts.configureBotApi }),
  });
  if (!opts.botInfo) await bot.init();
  app.decorate('bot', bot);

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

  // Unauthenticated, non-sensitive config for the web login screen.
  const botUsername = env.TELEGRAM_BOT_USERNAME ?? bot.botInfo.username;
  app.get('/api/public', async () => ({ botUsername }));
  webApiRoutes(app, { db: dbHandle.db, auth, fx: opts.fx !== undefined ? opts.fx : new CbuRateProvider(), now: opts.now ?? (() => new Date()) });

  return app;
}
