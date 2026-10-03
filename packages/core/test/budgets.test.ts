import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, resetTestDatabase, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { budgetCrossings, budgetStatus, removeBudget, setBudget, type BudgetStatus } from '../src/finance/budgets';
import { listWalletCategories } from '../src/finance/categories';
import { createTransaction } from '../src/finance/transactions';
import { AppError } from '../src/errors';
import { ensureUser } from '../src/users';

let h: DbHandle;
const TZ = 'Asia/Tashkent';
const now = new Date('2026-10-20T08:00:00Z');

beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h.close());

const spend = (u: { userId: string; walletId: string }, amount: number, slug: string, date = '2026-10-20') =>
  createTransaction({ db: h.db, fx: null, now: () => now }, {
    ...u, timeZone: TZ, source: 'text', rawInput: null,
    tx: { type: 'expense', amount, currency: 'UZS', category_id: slug, note: null, counterparty: null, date, confidence: 1 },
  });

describe('budgetCrossings', () => {
  const b = (spentUzs: number, categoryId: string | null = 'c1'): BudgetStatus => ({ id: 'b', categoryId, name: 'X', icon: null, limitUzs: 1000, spentUzs });
  it('reports only the threshold crossed by this expense, the highest one', () => {
    expect(budgetCrossings([b(790)], { categoryId: 'c1', amountUzs: 100 })).toEqual([]);
    expect(budgetCrossings([b(800)], { categoryId: 'c1', amountUzs: 100 })[0]!.threshold).toBe(80);
    expect(budgetCrossings([b(1050)], { categoryId: 'c1', amountUzs: 100 })[0]!.threshold).toBe(100);
    expect(budgetCrossings([b(1050)], { categoryId: 'c1', amountUzs: 400 })[0]!.threshold).toBe(100); // 650 → 1050 skips 80
    expect(budgetCrossings([b(1200)], { categoryId: 'c1', amountUzs: 100 })).toEqual([]); // already over
    expect(budgetCrossings([b(900)], { categoryId: 'c2', amountUzs: 200 })).toEqual([]); // other category
    expect(budgetCrossings([b(900, null)], { categoryId: 'c2', amountUzs: 200 })[0]!.threshold).toBe(80); // total budget
  });
});

describe('budgets', () => {
  it('status per category and total for the local month; upsert; plan limit; isolation', async () => {
    const { user, personalWalletId: walletId } = await ensureUser(h.db, { telegramId: 501 });
    const u = { userId: user.id, walletId };
    const cats = await listWalletCategories(h.db, walletId, 'uz_latn');
    const food = cats.find((c) => c.key === 'food')!;
    const salary = cats.find((c) => c.key === 'salary')!;

    await spend(u, 300_000, 'food');
    await spend(u, 50_000, 'transport');
    await spend(u, 999_000, 'food', '2026-09-30'); // previous month

    await setBudget(h.db, { ...u, categoryId: food.id, amountUzs: 1_000_000, maxBudgets: 2 });
    await setBudget(h.db, { ...u, categoryId: null, amountUzs: 2_000_000, maxBudgets: 2 });
    await setBudget(h.db, { ...u, categoryId: food.id, amountUzs: 500_000, maxBudgets: 2 }); // upsert, not a 3rd
    await expect(setBudget(h.db, { ...u, categoryId: cats.find((c) => c.key === 'cafe')!.id, amountUzs: 1, maxBudgets: 2 })).rejects.toThrow('budget limit');
    await expect(setBudget(h.db, { ...u, categoryId: salary.id, amountUzs: 1, maxBudgets: null })).rejects.toBeInstanceOf(AppError); // income category

    const status = await budgetStatus(h.db, { ...u, timeZone: TZ, now, lang: 'uz_latn' });
    expect(status.map((s) => [s.categoryId === null ? 'total' : s.name, s.spentUzs, s.limitUzs])).toEqual([
      ['total', 350_000, 2_000_000],
      ['Oziq-ovqat', 300_000, 500_000],
    ]);

    const other = await ensureUser(h.db, { telegramId: 502 });
    await expect(removeBudget(h.db, other.user.id, status[0]!.id)).rejects.toBeInstanceOf(AppError);
    await expect(budgetStatus(h.db, { userId: other.user.id, walletId, timeZone: TZ, now, lang: 'uz_latn' })).rejects.toBeInstanceOf(AppError);
    await removeBudget(h.db, user.id, status[0]!.id);
    expect(await budgetStatus(h.db, { ...u, timeZone: TZ, now, lang: 'uz_latn' })).toHaveLength(1);
  });
});
