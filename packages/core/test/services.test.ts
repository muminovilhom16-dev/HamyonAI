import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { assertWalletAccess } from '../src/access';
import { consumeLoginToken, createSession, issueLoginToken, resolveSession, revokeSession } from '../src/auth';
import { SYSTEM_CATEGORIES } from '../src/categories';
import { AppError } from '../src/errors';
import { ensureUser } from '../src/users';

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
