import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { listWalletCategories, listUserRules, patternFromText, toCategoryOptions } from '../src/finance/categories';
import { convertToUzs, getRate, RateUnavailableError, type ExchangeRateProvider } from '../src/finance/fx';
import { createPending, getOpenPending, resolvePending } from '../src/finance/pending';
import { localDate, periodRange, zonedInstant } from '../src/finance/time';
import {
  createTransaction, listRecentTransactions, purgeDeletedTransactions, softDeleteTransaction, summarize, undoDelete, updateTransaction,
  type FinanceDeps,
} from '../src/finance/transactions';
import type { ParsedTransaction } from '../src/parser/contract';
import { runPipeline } from '../src/parser/pipeline';
import { ensureUser } from '../src/users';

let h: DbHandle;
const TZ = 'Asia/Tashkent';
const NOW = new Date('2026-10-01T10:00:00Z'); // 15:00 in Tashkent
let clock = NOW;
const fakeFx = (rate: string | Error): ExchangeRateProvider & { calls: number } => {
  const p = { name: 'fake', calls: 0, async fetchRate() { p.calls++; if (rate instanceof Error) throw rate; return rate; } };
  return p;
};
let deps: FinanceDeps;

beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
  deps = { db: h.db, fx: fakeFx('12800.50'), now: () => clock };
});
afterAll(async () => h?.close());

const base: Omit<ParsedTransaction, 'amount' | 'category_id'> = { type: 'expense', currency: 'UZS', note: null, counterparty: null, date: '2026-10-01', confidence: 0.95 };

describe('time', () => {
  it('Tashkent is UTC+5 and periods are local', () => {
    expect(localDate(new Date('2026-09-30T20:00:00Z'), TZ)).toBe('2026-10-01');
    expect(zonedInstant('2026-10-01', TZ).toISOString()).toBe('2026-09-30T19:00:00.000Z');
    const w = periodRange('week', NOW, TZ); // 2026-10-01 is a Thursday
    expect([w.startDate, w.endDate]).toEqual(['2026-09-28', '2026-10-04']);
    const m = periodRange('month', NOW, TZ);
    expect([m.startDate, m.endDate]).toEqual(['2026-10-01', '2026-10-31']);
  });
});

describe('exchange rates (TZ §38)', () => {
  it('converts with exact integer rounding', () => {
    expect(convertToUzs(50, '12800.50')).toBe(640_025);
    expect(convertToUzs(1, '12800.49')).toBe(12_800);
    expect(convertToUzs(1, '12800.50')).toBe(12_801);
  });

  it('fetches once, stores, then reuses; falls back to recent stored rate', async () => {
    const fx = fakeFx('12700');
    expect(await getRate(h.db, fx, 'USD', '2026-09-01')).toBe('12700.00');
    expect(await getRate(h.db, fx, 'USD', '2026-09-01')).toBe('12700.00');
    expect(fx.calls).toBe(1);
    expect(await getRate(h.db, fakeFx(new Error('down')), 'USD', '2026-09-03')).toBe('12700.00');
    await expect(getRate(h.db, fakeFx(new Error('down')), 'USD', '2026-12-01')).rejects.toBeInstanceOf(RateUnavailableError);
  });
});

describe('transactions', () => {
  it('50$ kurtka → stores 50 USD, frozen rate and UZS amount', async () => {
    const { user, personalWalletId } = await ensureUser(h.db, { telegramId: 1 });
    const cats = toCategoryOptions(await listWalletCategories(h.db, personalWalletId, 'uz_latn'));
    const r = await runPipeline({ text: '50$ kurtka', today: '2026-10-01', language: 'uz_latn', categories: cats, userRules: [], ai: null, confidenceThreshold: 0.8 });
    if (r.kind !== 'items') throw new Error();
    const tx = await createTransaction(deps, { walletId: personalWalletId, userId: user.id, timeZone: TZ, tx: r.items[0]!.tx, source: 'text', rawInput: r.maskedText });
    expect(tx).toMatchObject({ amount: 50, currency: 'USD', fxRateUzs: '12800.50', amountUzs: 640_025 });
    // Later rate changes never touch history; edits reuse the frozen rate.
    await h.db.update(schema.exchangeRates).set({ rateUzs: '13000.00' });
    const edited = await updateTransaction(deps, user.id, tx.id, { amount: 60 }, TZ);
    expect(edited).toMatchObject({ amount: 60, fxRateUzs: '12800.50', amountUzs: 768_030 });
    await h.db.update(schema.exchangeRates).set({ rateUzs: '12800.50' }).where(eq(schema.exchangeRates.rateDate, '2026-10-01'));
  });

  it('refuses debts and enforces wallet ownership', async () => {
    const a = await ensureUser(h.db, { telegramId: 2 });
    const b = await ensureUser(h.db, { telegramId: 3 });
    await expect(
      createTransaction(deps, { walletId: a.personalWalletId, userId: a.user.id, timeZone: TZ, tx: { ...base, type: 'debt_given', amount: 1, category_id: null }, source: 'text', rawInput: null }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      createTransaction(deps, { walletId: a.personalWalletId, userId: b.user.id, timeZone: TZ, tx: { ...base, amount: 1, category_id: 'food' }, source: 'text', rawInput: null }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const tx = await createTransaction(deps, { walletId: a.personalWalletId, userId: a.user.id, timeZone: TZ, tx: { ...base, amount: 1000, category_id: 'food' }, source: 'text', rawInput: null });
    await expect(softDeleteTransaction(deps, b.user.id, tx.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(updateTransaction(deps, b.user.id, tx.id, { amount: 5 }, TZ)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects invalid contract data at the last gate', async () => {
    const a = await ensureUser(h.db, { telegramId: 4 });
    await expect(
      createTransaction(deps, { walletId: a.personalWalletId, userId: a.user.id, timeZone: TZ, tx: { ...base, amount: 10.5, category_id: 'food' }, source: 'text', rawInput: null }),
    ).rejects.toThrow();
  });

  it('delete → undo within 10s works, after 10s does not; purge after 30 days', async () => {
    const { user, personalWalletId } = await ensureUser(h.db, { telegramId: 5 });
    const tx = await createTransaction(deps, { walletId: personalWalletId, userId: user.id, timeZone: TZ, tx: { ...base, amount: 5000, category_id: 'food' }, source: 'text', rawInput: null });
    clock = NOW;
    await softDeleteTransaction(deps, user.id, tx.id);
    expect(await listRecentTransactions(h.db, user.id, personalWalletId)).toHaveLength(0);
    clock = new Date(NOW.getTime() + 9_000);
    expect((await undoDelete(deps, user.id, tx.id)).ok).toBe(true);
    expect(await listRecentTransactions(h.db, user.id, personalWalletId)).toHaveLength(1);

    clock = NOW;
    await softDeleteTransaction(deps, user.id, tx.id);
    clock = new Date(NOW.getTime() + 11_000);
    expect((await undoDelete(deps, user.id, tx.id)).ok).toBe(false);

    expect(await purgeDeletedTransactions(h.db, new Date(NOW.getTime() + 29 * 86_400_000))).toBe(0);
    expect(await purgeDeletedTransactions(h.db, new Date(NOW.getTime() + 31 * 86_400_000))).toBeGreaterThanOrEqual(1);
    clock = NOW;
  });

  it('category correction becomes a reusable rule used by the next parse (TZ §10)', async () => {
    const { user, personalWalletId } = await ensureUser(h.db, { telegramId: 6 });
    const cats = toCategoryOptions(await listWalletCategories(h.db, personalWalletId, 'uz_latn'));
    const first = await runPipeline({ text: 'gullar 150 ming', today: '2026-10-01', language: 'uz_latn', categories: cats, userRules: [], ai: null, confidenceThreshold: 0.8 });
    if (first.kind !== 'items') throw new Error();
    expect(first.items[0]!.tx.category_id).toBe('celebrations');
    const tx = await createTransaction(deps, { walletId: personalWalletId, userId: user.id, timeZone: TZ, tx: first.items[0]!.tx, source: 'text', rawInput: null });

    await updateTransaction(deps, user.id, tx.id, { categoryKey: 'kids' }, TZ);
    const rules = await listUserRules(h.db, user.id, personalWalletId);
    expect(rules).toEqual([{ pattern: 'gullar', categoryKey: 'kids' }]);

    const second = await runPipeline({ text: 'gullar 90 ming', today: '2026-10-01', language: 'uz_latn', categories: cats, userRules: rules, ai: null, confidenceThreshold: 0.8 });
    if (second.kind !== 'items') throw new Error();
    expect(second.items[0]).toMatchObject({ categorySource: 'user_rule', tx: { category_id: 'kids' } });

    const events = await h.db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, user.id));
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['transaction_created', 'transaction_edited', 'category_corrected']));
  });

  it('rejects category of the wrong kind', async () => {
    const { user, personalWalletId } = await ensureUser(h.db, { telegramId: 7 });
    const tx = await createTransaction(deps, { walletId: personalWalletId, userId: user.id, timeZone: TZ, tx: { ...base, amount: 5000, category_id: 'food' }, source: 'text', rawInput: null });
    await expect(updateTransaction(deps, user.id, tx.id, { categoryKey: 'salary' }, TZ)).rejects.toMatchObject({ code: 'validation' });
  });

  it('summary excludes debts and deleted rows, uses UZS amounts', async () => {
    const { user, personalWalletId: w } = await ensureUser(h.db, { telegramId: 8 });
    const mk = (o: Partial<typeof base> & { amount: number; category_id: string | null }) =>
      createTransaction(deps, { walletId: w, userId: user.id, timeZone: TZ, tx: { ...base, ...o }, source: 'text', rawInput: null });
    await mk({ amount: 20_000, category_id: 'transport' });
    await mk({ amount: 100_000, category_id: 'food' });
    await mk({ amount: 10, currency: 'USD', category_id: 'food' });
    await mk({ amount: 6_000_000, type: 'income', category_id: 'salary' });
    const del = await mk({ amount: 999_000, category_id: 'food' });
    await softDeleteTransaction(deps, user.id, del.id);
    await mk({ amount: 50_000, category_id: 'food', date: '2026-09-30' });

    const day = periodRange('day', NOW, TZ);
    const s = await summarize(h.db, user.id, w, day.from, day.to);
    expect(s.expenseUzs).toBe(20_000 + 100_000 + 128_005);
    expect(s.incomeUzs).toBe(6_000_000);
    expect(s.byCategory[0]!.totalUzs).toBe(228_005);
    const week = periodRange('week', NOW, TZ);
    expect((await summarize(h.db, user.id, w, week.from, week.to)).expenseUzs).toBe(298_005);
  });
});

describe('pending inputs', () => {
  it('belong to their user, resolve once, and expire', async () => {
    const a = await ensureUser(h.db, { telegramId: 20 });
    const b = await ensureUser(h.db, { telegramId: 21 });
    const p = await createPending(h.db, { userId: a.user.id, walletId: a.personalWalletId, kind: 'confirm_amount', payload: { x: 1 }, now: NOW, ttlMinutes: 10 });
    expect(await getOpenPending(h.db, b.user.id, p.id, NOW)).toBeNull();
    expect(await getOpenPending(h.db, a.user.id, p.id, new Date(NOW.getTime() + 11 * 60_000))).toBeNull();
    expect(await getOpenPending(h.db, a.user.id, p.id, NOW)).not.toBeNull();
    expect(await resolvePending(h.db, p.id)).toBe(true);
    expect(await resolvePending(h.db, p.id)).toBe(false);
  });
});

describe('patternFromText', () => {
  it('keeps content words only', () => {
    expect(patternFromText("Kompyuterga windows o'rnatish")).toBe('kompyuterga windows ornatish');
    expect(patternFromText('Taksi uchun')).toBe('taksi');
    expect(patternFromText(null)).toBeNull();
  });
});
