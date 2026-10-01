import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../src/env';
import { defaultPlanConfig, loadPlanConfig } from '../src/plans';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(32),
  AUTH_TOKEN_SECRET: 'y'.repeat(32),
};

describe('loadEnv', () => {
  it('applies TZ defaults', () => {
    const env = loadEnv(base);
    expect(env.DEFAULT_CURRENCY).toBe('UZS');
    expect(env.DEFAULT_TIMEZONE).toBe('Asia/Tashkent');
    expect(env.DEFAULT_REMINDER_TIME).toBe('21:00');
    expect(env.MAX_PROACTIVE_MESSAGES_PER_DAY).toBe(2);
    expect(env.WEB_LOGIN_TOKEN_TTL_MINUTES).toBe(15);
    expect(env.WEB_SESSION_TTL_DAYS).toBe(30);
    expect(env.AI_CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it('reports missing keys without leaking values', () => {
    const secret = 'super-secret-token-value';
    try {
      loadEnv({ ...base, TELEGRAM_BOT_TOKEN: secret, DATABASE_URL: undefined });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      const msg = (e as Error).message;
      expect(msg).toContain('DATABASE_URL');
      expect(msg).toContain('TELEGRAM_BOT_TOKEN');
      expect(msg).not.toContain(secret);
    }
  });

  it('rejects weak webhook secret', () => {
    expect(() => loadEnv({ ...base, TELEGRAM_WEBHOOK_SECRET: 'short' })).toThrow(EnvValidationError);
  });

  it('requires https public URL in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://x.uz', WEB_BASE_URL: 'https://x.uz' }),
    ).toThrow(/https/);
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://x.uz', WEB_BASE_URL: 'https://x.uz' }),
    ).not.toThrow();
  });
});

describe('plan config', () => {
  it('defaults are used without override', () => {
    expect(loadPlanConfig()).toEqual(defaultPlanConfig);
  });

  it('can be overridden by JSON', () => {
    const cfg = loadPlanConfig(JSON.stringify({ free: { ...defaultPlanConfig.free, voicePerMonth: 50 } }));
    expect(cfg.free.voicePerMonth).toBe(50);
    expect(cfg.pro).toEqual(defaultPlanConfig.pro);
  });
});

describe('platform defaults (free PaaS deploy)', () => {
  const min = { DATABASE_URL: base.DATABASE_URL, TELEGRAM_BOT_TOKEN: base.TELEGRAM_BOT_TOKEN, AUTH_TOKEN_SECRET: 'Zm9vYmFy+/=' + 'x'.repeat(40) };

  it('derives public/web URLs from RENDER_EXTERNAL_URL and a valid webhook secret', () => {
    const env = loadEnv({ ...min, NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://hamyon-ai.onrender.com' });
    expect(env.PUBLIC_BASE_URL).toBe('https://hamyon-ai.onrender.com');
    expect(env.WEB_BASE_URL).toBe('https://hamyon-ai.onrender.com/app');
    expect(env.TELEGRAM_WEBHOOK_SECRET).toMatch(/^[0-9a-f]{64}$/);
    // stable across restarts
    expect(loadEnv({ ...min, NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://hamyon-ai.onrender.com' }).TELEGRAM_WEBHOOK_SECRET).toBe(env.TELEGRAM_WEBHOOK_SECRET);
  });

  it('explicit values win', () => {
    const env = loadEnv({ ...base, PUBLIC_BASE_URL: 'https://a.uz', RENDER_EXTERNAL_URL: 'https://b.onrender.com' });
    expect(env.PUBLIC_BASE_URL).toBe('https://a.uz');
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBe('x'.repeat(32));
  });
});
