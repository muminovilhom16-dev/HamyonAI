import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, resetTestDatabase, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { getDashboard, listTransactions, percentagesTenths } from '../src/finance/dashboard';
import { createDebt } from '../src/finance/debts';
import { createTransaction, softDeleteTransaction, type FinanceDeps } from '../src/finance/transactions';
import type { ParsedTransaction } from '../src/parser/contract';
import { ensureUser } from '../src/users';

let h: DbHandle;
let deps: FinanceDeps;
const TZ = 'Asia/Tashkent';
const NOW = new Date('2026-10-05T10:00:00Z');

beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
  deps = { db: h.db, fx: { name: 'f', fetchRate: async () => '12800.00' }, now: () => NOW };
});
afterAll(async () => h?.close());

const tx = (o: Partial<ParsedTransaction> & { amount: number }): ParsedTransaction => ({
  type: 'expense', currency: 'UZS', category_id: 'food', note: null, counterparty: null, date: '2026-10-05', confidence: 1, ...o,
});

describe('percentagesTenths', () => {
  it.each([
    [[1, 1, 1], [334, 333, 333]],
    [[50, 50], [500, 500]],
    [[2, 1], [667, 333]],
    [[0, 0], [0, 0]],
    [[7, 0, 3], [700, 0, 300]],
  ])('%j → %j and sums to 100.0', (values, expected) => {
    const r = percentagesTenths(values);
    expect(r).toEqual(expected);
    if (values.some((v) => v > 0)) expect(r.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('always sums to 1000 for random inputs', () => {
    for (let i = 0; i < 200; i++) {
      const vals = Array.from({ length: 1 + (i % 9) }, (_, k) => ((i * 7919 + k * 104729) % 1_000_000) + 1);
      expect(percentagesTenths(vals).reduce((a, b) => a + b, 0)).toBe(1000);
    }
  });
});

describe('getDashboard', () => {
  it('totals, per-category percentages, zero-filled daily series, debts', async () => {
    const { user, personalWalletId: w } = await ensureUser(h.db, { telegramId: 1 });
    const mk = (o: Partial<ParsedTransaction> & { amount: number }) =>
      createTransaction(deps, { walletId: w, userId: user.id, timeZone: TZ, tx: tx(o), source: 'text', rawInput: null });
    await mk({ amount: 100_000, date: '2026-10-01' });
    await mk({ amount: 50_000, category_id: 'transport', date: '2026-10-03' });
    await mk({ amount: 10, currency: 'USD', category_id: 'clothing', date: '2026-10-05' });
    await mk({ amount: 6_000_000, type: 'income', category_id: 'salary', date: '2026-10-02' });
    const del = await mk({ amount: 999_999, date: '2026-10-04' });
    await softDeleteTransaction(deps, user.id, del.id);
    await createDebt(deps, { walletId: w, userId: user.id, timeZone: TZ, direction: 'given', counterparty: 'Murod', amount: 300_000, currency: 'UZS', date: '2026-10-01', source: 'text', rawInput: null });

    const d = await getDashboard(h.db, { userId: user.id, walletId: w, startDate: '2026-10-01', endDate: '2026-10-07', timeZone: TZ, language: 'uz_latn', uncategorizedName: '—' });
    expect(d.expenseUzs).toBe(100_000 + 50_000 + 128_000);
    expect(d.incomeUzs).toBe(6_000_000);
    expect(d.balanceUzs).toBe(6_000_000 - 278_000);
    expect(d.byCategory.map((c) => [c.name, c.totalUzs])).toEqual([['Kiyim', 128_000], ['Oziq-ovqat', 100_000], ['Transport', 50_000]]);
    expect(d.byCategory.reduce((a, c) => a + c.percentTenths, 0)).toBe(1000);
    expect(d.daily.map((x) => x.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(d.daily.map((x) => x.expenseUzs)).toEqual([100_000, 0, 50_000, 0, 128_000, 0, 0]);
    expect(d.daily[1]!.incomeUzs).toBe(6_000_000);
    expect(d.debts.owedToMe).toEqual([{ currency: 'UZS', amount: 300_000 }]);
  });

  it('no income → balance is null (never a negative red balance)', async () => {
    const { user, personalWalletId: w } = await ensureUser(h.db, { telegramId: 2 });
    await createTransaction(deps, { walletId: w, userId: user.id, timeZone: TZ, tx: tx({ amount: 50_000 }), source: 'text', rawInput: null });
    const d = await getDashboard(h.db, { userId: user.id, walletId: w, startDate: '2026-10-01', endDate: '2026-10-31', timeZone: TZ, language: 'uz_latn', uncategorizedName: '—' });
    expect(d.balanceUzs).toBeNull();
    expect(d.daily).toHaveLength(31);
  });

  it("refuses another user's wallet", async () => {
    const a = await ensureUser(h.db, { telegramId: 3 });
    const b = await ensureUser(h.db, { telegramId: 4 });
    await expect(getDashboard(h.db, { userId: b.user.id, walletId: a.personalWalletId, startDate: '2026-10-01', endDate: '2026-10-31', timeZone: TZ, language: 'uz_latn', uncategorizedName: '—' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('listTransactions', () => {
  it('filters and paginates with a stable keyset cursor', async () => {
    const { user, personalWalletId: w } = await ensureUser(h.db, { telegramId: 5 });
    for (let i = 1; i <= 7; i++) {
      await createTransaction(deps, { walletId: w, userId: user.id, timeZone: TZ, tx: tx({ amount: i * 1000, date: `2026-10-0${i}` }), source: 'text', rawInput: null });
    }
    await createTransaction(deps, { walletId: w, userId: user.id, timeZone: TZ, tx: tx({ amount: 5_000_000, type: 'income', category_id: 'salary', date: '2026-10-03' }), source: 'text', rawInput: null });
    const page1 = await listTransactions(h.db, user.id, w, { timeZone: TZ, type: 'expense', limit: 3 });
    expect(page1.map((t) => t.amount)).toEqual([7000, 6000, 5000]);
    const last = page1.at(-1)!;
    const page2 = await listTransactions(h.db, user.id, w, { timeZone: TZ, type: 'expense', limit: 3, before: { occurredAt: last.occurredAt, id: last.id } });
    expect(page2.map((t) => t.amount)).toEqual([4000, 3000, 2000]);
    const ranged = await listTransactions(h.db, user.id, w, { timeZone: TZ, startDate: '2026-10-02', endDate: '2026-10-03', limit: 50 });
    expect(ranged.map((t) => t.amount).sort((a, b) => a - b)).toEqual([2000, 3000, 5_000_000]);
  });
});
