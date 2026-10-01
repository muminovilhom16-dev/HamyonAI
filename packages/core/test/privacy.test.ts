import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { createSession, resolveSession } from '../src/auth';
import { createDebt, recordRepayment } from '../src/finance/debts';
import { cancelAccountDeletion, exportTransactions, purgeDeletedAccounts, requestAccountDeletion } from '../src/finance/privacy';
import { createTransaction, softDeleteTransaction } from '../src/finance/transactions';
import { ensureUser } from '../src/users';

let h: DbHandle;
const TZ = 'Asia/Tashkent';
const NOW = new Date('2026-10-05T10:00:00Z');
beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h?.close());
const deps = () => ({ db: h.db, fx: { name: 'f', fetchRate: async () => '12800.00' }, now: () => NOW });

async function seeded(tg: number) {
  const { user, personalWalletId: w } = await ensureUser(h.db, { telegramId: tg, displayName: 'Ilhom' });
  const base = { note: null, counterparty: null, confidence: 1 } as const;
  await createTransaction(deps(), { walletId: w, userId: user.id, timeZone: TZ, source: 'text', rawInput: null, tx: { ...base, type: 'expense', amount: 25_000, currency: 'UZS', category_id: 'transport', date: '2026-10-01', note: 'Taksi' } });
  await createTransaction(deps(), { walletId: w, userId: user.id, timeZone: TZ, source: 'text', rawInput: null, tx: { ...base, type: 'income', amount: 6_000_000, currency: 'UZS', category_id: 'salary', date: '2026-10-02' } });
  await createTransaction(deps(), { walletId: w, userId: user.id, timeZone: TZ, source: 'voice', rawInput: null, tx: { ...base, type: 'expense', amount: 50, currency: 'USD', category_id: 'clothing', date: '2026-09-20' } });
  const del = await createTransaction(deps(), { walletId: w, userId: user.id, timeZone: TZ, source: 'text', rawInput: null, tx: { ...base, type: 'expense', amount: 1, currency: 'UZS', category_id: 'food', date: '2026-10-03' } });
  await softDeleteTransaction(deps(), user.id, del.id);
  await createDebt(deps(), { walletId: w, userId: user.id, timeZone: TZ, direction: 'given', counterparty: 'Murod aka', amount: 300_000, currency: 'UZS', date: '2026-10-04', source: 'text', rawInput: null });
  await recordRepayment(deps(), { walletId: w, userId: user.id, timeZone: TZ, counterparty: 'Murod aka', returnDirection: 'to_me', amount: 100_000, currency: 'UZS', date: '2026-10-05', source: 'text', rawInput: null });
  return { userId: user.id, walletId: w };
}

describe('export (TZ §31)', () => {
  it('all columns, deleted rows excluded, date range respected', async () => {
    const { userId, walletId } = await seeded(1);
    const all = await exportTransactions(h.db, { userId, walletId, timeZone: TZ, language: 'uz_latn' });
    expect(all.map((r) => [r.date, r.type, r.amount, r.currency, r.category])).toEqual([
      ['2026-09-20', 'expense', 50, 'USD', 'Kiyim'],
      ['2026-10-01', 'expense', 25_000, 'UZS', 'Transport'],
      ['2026-10-02', 'income', 6_000_000, 'UZS', 'Oylik'],
      ['2026-10-04', 'debt_given', 300_000, 'UZS', null],
      ['2026-10-05', 'debt_return', 100_000, 'UZS', null],
    ]);
    expect(all[1]).toMatchObject({ note: 'Taksi', enteredBy: 'Ilhom', time: '12:00' }); // past dates are stored at local noon
    const oct = await exportTransactions(h.db, { userId, walletId, timeZone: TZ, language: 'ru', startDate: '2026-10-01', endDate: '2026-10-02' });
    expect(oct.map((r) => r.category)).toEqual(['Транспорт', 'Зарплата']);
  });

  it("refuses another user's wallet", async () => {
    const a = await seeded(2);
    const b = await ensureUser(h.db, { telegramId: 3 });
    await expect(exportTransactions(h.db, { userId: b.user.id, walletId: a.walletId, timeZone: TZ, language: 'uz_latn' })).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('account deletion (TZ §40)', () => {
  const cfg = { secret: 's'.repeat(32), loginTokenTtlMinutes: 15, sessionTtlDays: 30 };

  it('request signs out everywhere; cancel keeps the account', async () => {
    const { userId } = await seeded(10);
    const { token } = await createSession(h.db, cfg, userId, NOW);
    await requestAccountDeletion(h.db, userId, NOW);
    expect(await resolveSession(h.db, cfg, token, NOW)).toBeNull();
    await cancelAccountDeletion(h.db, userId, NOW);
    expect(await purgeDeletedAccounts(h.db, new Date('2026-12-01T00:00:00Z'))).toBe(0);
    const [u] = await h.db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(u!.deletionRequestedAt).toBeNull();
  });

  it('after the grace period everything is removed; analytics are anonymized', async () => {
    const { userId, walletId } = await seeded(11);
    await h.db.insert(schema.analyticsEvents).values({ userId, name: 'start' });
    await requestAccountDeletion(h.db, userId, NOW);
    expect(await purgeDeletedAccounts(h.db, new Date(NOW.getTime() + 6 * 86_400_000))).toBe(0);
    expect(await purgeDeletedAccounts(h.db, new Date(NOW.getTime() + 8 * 86_400_000))).toBe(1);

    const count = async (table: Parameters<typeof h.db.select>[0] extends never ? never : any, col: any, v: string) =>
      (await h.db.select().from(table).where(eq(col, v))).length;
    expect(await count(schema.users, schema.users.id, userId)).toBe(0);
    expect(await count(schema.wallets, schema.wallets.id, walletId)).toBe(0);
    expect(await count(schema.transactions, schema.transactions.walletId, walletId)).toBe(0);
    expect(await count(schema.debts, schema.debts.walletId, walletId)).toBe(0);
    expect(await count(schema.categories, schema.categories.walletId, walletId)).toBe(0);
    const orphanEvents = await h.db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.name, 'start'));
    expect(orphanEvents.every((e) => e.userId !== userId)).toBe(true);
  });
});
