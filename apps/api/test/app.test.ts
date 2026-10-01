import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@hamyon/db';
import { createHarness, env, SECRET, type Harness } from './harness';

let harness: Harness;
let app: FastifyInstance;
let h: DbHandle;
let calls: Harness['calls'];
let failChatIds: Set<number>;
let nextUpdateId = 100_000;

beforeAll(async () => {
  harness = await createHarness();
  ({ app, h, calls, failChatIds } = harness);
});
afterAll(async () => harness?.close());
beforeEach(() => harness.reset());

function messageUpdate(fromId: number, text: string, opts: { updateId?: number; lang?: string } = {}) {
  const entities = text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] : undefined;
  return {
    update_id: opts.updateId ?? nextUpdateId++,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: fromId, type: 'private', first_name: 'Ali' },
      from: { id: fromId, is_bot: false, first_name: 'Ali', language_code: opts.lang ?? 'uz' },
      text,
      ...(entities && { entities }),
    },
  };
}

const postUpdate = (body: unknown, secret: string | null = SECRET) =>
  app.inject({
    method: 'POST',
    url: env.TELEGRAM_WEBHOOK_PATH,
    headers: secret === null ? {} : { 'x-telegram-bot-api-secret-token': secret },
    payload: body as object,
  });

describe('health', () => {
  it('liveness and readiness', async () => {
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/ready')).json()).toEqual({ status: 'ready' });
  });

  it('sets security headers and returns JSON 404 without internals', async () => {
    const res = await app.inject('/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('telegram webhook', () => {
  it('rejects missing or wrong secret token', async () => {
    expect((await postUpdate(messageUpdate(1, '/start'), null)).statusCode).toBe(401);
    expect((await postUpdate(messageUpdate(1, '/start'), 'x'.repeat(40))).statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('/start creates the user with TZ defaults and replies in their language', async () => {
    const res = await postUpdate(messageUpdate(5001, '/start', { lang: 'ru' }));
    expect(res.statusCode).toBe(200);
    const [user] = await h.db.select().from(schema.users).where(eq(schema.users.telegramId, 5001));
    expect(user).toMatchObject({ language: 'ru', currency: 'UZS', timezone: 'Asia/Tashkent', reminderTime: '21:00:00' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('sendMessage');
    expect(calls[0]!.payload.text).toContain('Hamyon AI');
    expect(calls[0]!.payload.text).toContain('Выберите язык');
    const events = await h.db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, user!.id));
    expect(events.map((e) => e.name)).toEqual(['start']);
  });

  it('processes a re-delivered update only once', async () => {
    const update = messageUpdate(5002, '/start');
    expect((await postUpdate(update)).statusCode).toBe(200);
    expect((await postUpdate(update)).statusCode).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('rejects malformed bodies', async () => {
    expect((await postUpdate({ hello: 'world' })).statusCode).toBe(400);
  });

  it('handler failures never leak internals to Telegram or HTTP', async () => {
    failChatIds.add(5003);
    const res = await postUpdate(messageUpdate(5003, '/start'));
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('secret internal detail');
    // second call is the localized generic error attempt
    expect(calls.map((c) => c.payload.text)).toContainEqual(expect.stringContaining('xatolik'));
  });
});

describe('/web authentication', () => {
  async function requestLink(fromId: number): Promise<string> {
    await postUpdate(messageUpdate(fromId, '/web'));
    const text = calls.at(-1)!.payload.text as string;
    const match = text.match(/https:\/\/api\.hamyon\.test\/auth\/web\?token=(\S+)/);
    expect(match).not.toBeNull();
    return decodeURIComponent(match![1]!);
  }

  it('one-time link creates a 30-day httpOnly session and redirects to web', async () => {
    const token = await requestLink(6001);
    const res = await app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('https://app.hamyon.test');
    const cookie = res.cookies.find((c) => c.name === 'hamyon_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const days = (new Date(cookie.expires!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    const me = await app.inject({ url: '/api/me', cookies: { hamyon_session: cookie.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ language: 'uz_latn', currency: 'UZS', timezone: 'Asia/Tashkent', displayName: 'Ali' });
  });

  it('expired or reused link shows "Havola muddati tugadi" with bot button', async () => {
    const token = await requestLink(6002);
    await app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    const again = await app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    expect(again.statusCode).toBe(410);
    expect(again.headers['content-type']).toContain('text/html');
    expect(again.body).toContain('Havola muddati tugadi.');
    expect(again.body).toContain('Botda /web deb yozing.');
    expect(again.body).toContain('Telegram botni ochish');
    expect(again.body).toContain('https://t.me/HamyonAIBot');
  });

  it('link expires after 15 minutes', async () => {
    const token = await requestLink(6003);
    await h.db.update(schema.webLoginTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    expect(res.statusCode).toBe(410);
  });

  it('protected API requires a valid session and logout revokes it', async () => {
    expect((await app.inject('/api/me')).json()).toEqual({ error: 'unauthorized' });
    expect((await app.inject({ url: '/api/me', cookies: { hamyon_session: 'forged' } })).statusCode).toBe(401);

    const token = await requestLink(6004);
    const login = await app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    const session = login.cookies.find((c) => c.name === 'hamyon_session')!.value;
    expect((await app.inject({ method: 'POST', url: '/auth/logout', cookies: { hamyon_session: session } })).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/me', cookies: { hamyon_session: session } })).statusCode).toBe(401);
  });

  it('login tokens are stored hashed only', async () => {
    const token = await requestLink(6005);
    const rows = await h.db.select({ tokenHash: schema.webLoginTokens.tokenHash }).from(schema.webLoginTokens);
    expect(rows.some((r) => r.tokenHash.includes(token))).toBe(false);
  });
});
