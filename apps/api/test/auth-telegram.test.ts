import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { createHarness, env, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());

function sign(data: Record<string, string | number>) {
  const dcs = Object.entries(data).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const hash = createHmac('sha256', createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest()).update(dcs).digest('hex');
  return { ...data, hash };
}
const post = (payload: object, csrf = true) =>
  H.app.inject({ method: 'POST', url: '/auth/telegram', payload, headers: { ...(csrf && { 'x-hamyon-csrf': '1' }), 'accept-language': 'ru-RU' } });
const now = () => Math.floor(Date.now() / 1000);

describe('POST /auth/telegram (sign up / log in with Telegram)', () => {
  it('signs up a new user: wallet + categories + session, no username/photo stored', async () => {
    const res = await post(sign({ id: 555001, first_name: 'Ilhom', username: 'ilhom_m', photo_url: 'https://t.me/i/userpic/1.jpg', auth_date: now() }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, isNew: true });
    const cookie = res.cookies.find((c) => c.name === 'hamyon_session')!;
    expect(cookie.httpOnly).toBe(true);

    const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, 555001));
    expect(u).toMatchObject({ displayName: 'Ilhom', language: 'ru', currency: 'UZS', timezone: 'Asia/Tashkent' });
    expect(JSON.stringify(u)).not.toContain('ilhom_m');
    expect(JSON.stringify(u)).not.toContain('userpic');

    const settings = await H.app.inject({ url: '/api/settings', cookies: { hamyon_session: cookie.value } });
    expect(settings.statusCode).toBe(200);
    const dash = await H.app.inject({ url: '/api/dashboard', cookies: { hamyon_session: cookie.value } });
    expect(dash.json().balanceUzs).toBeNull();
  });

  it('logs in an existing bot user (same account as in Telegram)', async () => {
    await H.send(555002, '/start');
    const res = await post(sign({ id: 555002, first_name: 'Ali', auth_date: now() }));
    expect(res.json()).toEqual({ ok: true, isNew: false });
    const users = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, 555002));
    expect(users).toHaveLength(1);
  });

  it('rejects forged, stale and CSRF-less requests', async () => {
    const good = sign({ id: 555003, first_name: 'X', auth_date: now() });
    expect((await post({ ...good, id: 555004 })).statusCode).toBe(401);
    expect((await post(sign({ id: 555003, first_name: 'X', auth_date: now() - 100_000 }))).statusCode).toBe(401);
    expect((await post(good, false)).statusCode).toBe(403);
    expect((await post({})).statusCode).toBe(401);
    const none = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, 555004));
    expect(none).toHaveLength(0);
  });

  it('CSP allows only the official Telegram widget as a third party', async () => {
    const res = await H.app.inject('/health');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self' https://telegram.org");
    expect(csp).toContain('frame-src https://oauth.telegram.org');
  });
});
