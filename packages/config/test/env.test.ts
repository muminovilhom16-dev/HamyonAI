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
