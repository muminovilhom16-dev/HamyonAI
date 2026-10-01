import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

// Telegram allows 1-256 chars of A-Z a-z 0-9 _ - for webhook secret_token.
const telegramSecret = z
  .string()
  .min(32, 'must be at least 32 characters')
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, 'only A-Z, a-z, 0-9, _ and - are allowed');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Enables the BullMQ queue (voice jobs, scheduler). Without it work runs in-process. */
  REDIS_URL: z.string().url().optional(),
  QUEUE_PREFIX: z.string().regex(/^[a-z0-9_-]{1,32}$/).default('hamyon'),

  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]{30,}$/, 'invalid bot token format'),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional(),
  TELEGRAM_WEBHOOK_SECRET: telegramSecret,
  TELEGRAM_WEBHOOK_PATH: z.string().startsWith('/').default('/telegram/webhook'),
  // Self-hosted Bot API server (optional). Defaults to https://api.telegram.org.
  TELEGRAM_API_ROOT: z.string().url().optional(),

  PUBLIC_BASE_URL: z.string().url().optional(),
  /** Built web panel (apps/web/dist). Served same-origin when set. */
  WEB_STATIC_DIR: z.string().optional(),
  WEB_BASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  // Pepper for hashing one-time login tokens and session tokens at rest.
  AUTH_TOKEN_SECRET: z.string().min(32, 'must be at least 32 characters'),
  WEB_LOGIN_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  WEB_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: bool.optional(),

  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  TRUST_PROXY: bool.default(false),

  DEFAULT_CURRENCY: z.enum(['UZS', 'USD']).default('UZS'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Tashkent'),
  DEFAULT_REMINDER_TIME: hhmm.default('21:00'),
  MAX_PROACTIVE_MESSAGES_PER_DAY: z.coerce.number().int().min(0).max(10).default(2),
  WEEKLY_REPORT_TIME: hhmm.default('20:00'),
  MONTHLY_REPORT_TIME: hhmm.default('10:00'),
  /** Run queue workers / scheduler in this process (set false on API-only replicas). */
  RUN_WORKERS: bool.default(true),

  AI_PROVIDER: z.enum(['anthropic', 'none']).default('anthropic'),
  AI_TEXT_MODEL: z.string().default('claude-opus-5-5'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  AI_TIMEOUT_MS: z.coerce.number().int().min(500).default(8000),

  STT_PROVIDER: z.enum(['google', 'none']).default('google'),
  GOOGLE_STT_API_KEY: z.string().optional(),
  GOOGLE_STT_MODEL: z.string().default('default'),
  GOOGLE_STT_API_VERSION: z.enum(['v1', 'v1p1beta1']).default('v1p1beta1'),
  GOOGLE_STT_USD_PER_MINUTE: z.coerce.number().min(0).default(0.024),
  STT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  VOICE_MAX_SECONDS: z.coerce.number().int().min(1).max(60).default(60),

  // JSON override for plan limits, see plans.ts. Prices are hypotheses (TZ §34).
  PLAN_LIMITS_JSON: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates process environment. Never echoes values back, only key names,
 * so secrets cannot leak into logs on misconfiguration.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new EnvValidationError(issues);
  }
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!env.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL: required in production');
    if (!env.WEB_BASE_URL) missing.push('WEB_BASE_URL: required in production');
    if (env.PUBLIC_BASE_URL && !env.PUBLIC_BASE_URL.startsWith('https://')) {
      missing.push('PUBLIC_BASE_URL: must be https in production (Telegram webhook)');
    }
    if (missing.length) throw new EnvValidationError(missing);
  }
  return env;
}
