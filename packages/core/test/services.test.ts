import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { assertWalletAccess } from '../src/access';
import { consumeLoginToken, createSession, issueLoginToken, resolveSession, revokeSession } from '../src/auth';
import { SYSTEM_CATEGORIES } from '../src/categories';
import { AppError } from '../src/errors';
import { ensureUser, normalizeTgUsername } from '../src/users';
import { checkAiBudget } from '../src/finance/limits';
import { loadPlanConfig } from '@hamyon/config';

let h: DbHandle;
const cfg = { secret: 's'.repeat(32), loginTokenTtlMinutes: 15, sessionTtlDays: 30 };

beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h?.close());

describe('ensureUser', () => {
  it('creates user, personal wallet, owner membership and default categories', async () => {
    const r = await ensureUser(h.db, { telegramId: 42, displayName: 'Ali', languageCode: 'ru' });
    expect(r.created).toBe(true);
    expect(r.user.language).toBe('ru');
    expect(r.user.currency).toBe('UZS');
    expect(r.user.timezone).toBe('Asia/Tashkent');
    expect(r.user.reminderTime).toBe('21:00:00');
    const cats = await h.db.select().from(schema.categories).where(eq(schema.categories.walletId, r.personalWalletId));
    expect(cats.map((c) => c.slug).sort()).toEqual(SYSTEM_CATEGORIES.map((c) => c.slug).sort());
    expect(await assertWalletAccess(h.db, r.user.id, r.personalWalletId)).toBe('owner');
  });

  it('is idempotent, including under concurrent /start', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureUser(h.db, { telegramId: 77 })));
    expect(new Set(results.map((r) => r.user.id)).size).toBe(1);
    expect(new Set(results.map((r) => r.personalWalletId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const wallets = await h.db.select().from(schema.wallets).where(eq(schema.wallets.ownerUserId, results[0]!.user.id));
    expect(wallets).toHaveLength(1);
  });
});

describe('assertWalletAccess', () => {
  it("forbids access to another user's wallet", async () => {
    const a = await ensureUser(h.db, { telegramId: 100 });
    const b = await ensureUser(h.db, { telegramId: 101 });
    await expect(assertWalletAccess(h.db, b.user.id, a.personalWalletId)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(assertWalletAccess(h.db, a.user.id, a.personalWalletId)).resolves.toBe('owner');
  });

  it('enforces owner role when required', async () => {
    const owner = await ensureUser(h.db, { telegramId: 200 });
    const member = await ensureUser(h.db, { telegramId: 201 });
    await h.db.insert(schema.walletMembers).values({ walletId: owner.personalWalletId, userId: member.user.id, role: 'member' });
    await expect(assertWalletAccess(h.db, member.user.id, owner.personalWalletId)).resolves.toBe('member');
    const err = await assertWalletAccess(h.db, member.user.id, owner.personalWalletId, { requireRole: 'owner' }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('web auth', () => {
  it('one-time link works once, then reports expired', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 300 });
    const { token } = await issueLoginToken(h.db, cfg, user.id);
    expect(await consumeLoginToken(h.db, cfg, token)).toEqual({ ok: true, userId: user.id });
    expect(await consumeLoginToken(h.db, cfg, token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('expires after 15 minutes', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 301 });
    const t0 = new Date('2026-10-01T10:00:00Z');
    const { token } = await issueLoginToken(h.db, cfg, user.id, t0);
    const after = new Date(t0.getTime() + 15 * 60_000 + 1);
    expect(await consumeLoginToken(h.db, cfg, token, after)).toEqual({ ok: false, reason: 'expired' });
  });

  it('cannot be double-consumed concurrently', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 302 });
    const { token } = await issueLoginToken(h.db, cfg, user.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeLoginToken(h.db, cfg, token)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('rejects unknown tokens and stores only hashes', async () => {
    expect(await consumeLoginToken(h.db, cfg, 'nope')).toEqual({ ok: false, reason: 'invalid' });
    const { user } = await ensureUser(h.db, { telegramId: 303 });
    const { token } = await issueLoginToken(h.db, cfg, user.id);
    const rows = await h.db.select().from(schema.webLoginTokens);
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
  });

  it('sessions last 30 days and can be revoked', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 304 });
    const t0 = new Date('2026-10-01T10:00:00Z');
    const { token } = await createSession(h.db, cfg, user.id, t0);
    const s = await resolveSession(h.db, cfg, token, new Date(t0.getTime() + 29 * 86_400_000));
    expect(s?.userId).toBe(user.id);
    expect(await resolveSession(h.db, cfg, token, new Date(t0.getTime() + 30 * 86_400_000 + 1))).toBeNull();
    await revokeSession(h.db, s!.sessionId);
    expect(await resolveSession(h.db, cfg, token, t0)).toBeNull();
  });
});

describe('checkAiBudget', () => {
  const plans = loadPlanConfig();
  const at = new Date('2026-10-15T09:00:00Z');
  const base = { plan: 'free', timeZone: 'Asia/Tashkent', now: at, plans, usdToUzs: 12_800, dailyBudgetUsd: 1 };
  const log = (userId: string | null, micros: number, createdAt: Date, feature = 'parse_text') =>
    h.db.insert(schema.aiUsageLog).values({ userId, feature, provider: 'anthropic', model: 'm', costUsdMicros: micros, createdAt });

  it('per-user monthly cap in so\'m; STT and last month do not count', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 9001 });
    await log(user.id, 50_000, new Date('2026-10-02T00:00:00Z')); // 640 so'm
    await log(user.id, 900_000, new Date('2026-09-30T18:00:00Z')); // Sept 30 23:00 Tashkent → last month
    await log(user.id, 900_000, new Date('2026-10-03T00:00:00Z'), 'stt');
    expect(await checkAiBudget(h.db, { ...base, userId: user.id })).toEqual({ allowed: true, reason: null });
    await log(user.id, 40_000, new Date('2026-10-05T00:00:00Z')); // total 1 152 so'm ≥ 1 000
    expect(await checkAiBudget(h.db, { ...base, userId: user.id })).toEqual({ allowed: false, reason: 'user_month' });
    // A higher plan limit lets the same user through.
    expect((await checkAiBudget(h.db, { ...base, plan: 'pro', userId: user.id })).allowed).toBe(true);
  });

  it('global daily cap in USD covers all users', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 9002 });
    await log(null, 999_999, new Date('2026-10-15T01:00:00Z'));
    expect((await checkAiBudget(h.db, { ...base, userId: user.id })).allowed).toBe(true);
    await log(null, 1, new Date('2026-10-15T02:00:00Z'));
    expect(await checkAiBudget(h.db, { ...base, userId: user.id })).toEqual({ allowed: false, reason: 'global_day' });
    expect((await checkAiBudget(h.db, { ...base, userId: user.id, now: new Date('2026-10-16T00:30:00Z') })).allowed).toBe(true);
  });
});

describe('normalizeTgUsername', () => {
  it.each([
    ['@Murod_A1', 'murod_a1'],
    ['https://t.me/murod_aka', 'murod_aka'],
    ['  user12345 ', 'user12345'],
    ['ab', null],
    ['bad name', null],
    ['', null],
  ])('%s → %s', (raw, out) => expect(normalizeTgUsername(raw)).toBe(out));

  it('ensureUser keeps the username current', async () => {
    await ensureUser(h.db, { telegramId: 4242, username: 'Old_Name' });
    const { user } = await ensureUser(h.db, { telegramId: 4242, username: 'New_Name' });
    expect(user.username).toBe('new_name');
  });
});
