import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../src/client';
import * as s from '../src/schema';
import { resetTestDatabase, testDatabaseUrl } from '../src/testing';

let h: DbHandle;
let userId: string;
let walletId: string;

beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
  const [u] = await h.db.insert(s.users).values({ telegramId: 1001 }).returning();
  userId = u!.id;
  const [w] = await h.db.insert(s.wallets).values({ ownerUserId: userId }).returning();
  walletId = w!.id;
});

afterAll(async () => h?.close());

const tx = (over: Partial<typeof s.transactions.$inferInsert> = {}) => ({
  walletId,
  userId,
  type: 'expense' as const,
  amount: 25_000,
  currency: 'UZS' as const,
  amountUzs: 25_000,
  occurredAt: new Date(),
  source: 'text' as const,
  ...over,
});

// drizzle wraps pg errors; the constraint name lives on `cause`.
async function rejectsWith(p: Promise<unknown>, constraint: string) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err, `expected violation of ${constraint}`).not.toBeNull();
  const cause = (err as { cause?: { constraint?: string } }).cause;
  expect(cause?.constraint).toBe(constraint);
}

describe('money integrity constraints', () => {
  it('stores a valid UZS expense as integer', async () => {
    const [row] = await h.db.insert(s.transactions).values(tx()).returning();
    expect(row!.amount).toBe(25_000);
    expect(Number.isInteger(row!.amountUzs)).toBe(true);
  });

  it('rejects zero/negative amounts', async () => {
    await rejectsWith(h.db.insert(s.transactions).values(tx({ amount: 0, amountUzs: 0 })), 'transactions_amount_positive');
    await rejectsWith(h.db.insert(s.transactions).values(tx({ amount: -5, amountUzs: -5 })), 'transactions_amount_positive');
  });

  it('rejects USD without a frozen rate, and UZS with mismatched amount_uzs', async () => {
    await rejectsWith(
      h.db.insert(s.transactions).values(tx({ currency: 'USD', amount: 50, amountUzs: 640_000 })),
      'transactions_fx_rate_required',
    );
    await rejectsWith(h.db.insert(s.transactions).values(tx({ amountUzs: 1 })), 'transactions_fx_rate_required');
  });

  it('accepts USD with rate and keeps the original amount', async () => {
    const [row] = await h.db
      .insert(s.transactions)
      .values(tx({ currency: 'USD', amount: 50, amountUzs: 640_000, fxRateUzs: '12800.00' }))
      .returning();
    expect(row!.amount).toBe(50);
    expect(row!.fxRateUzs).toBe('12800.00');
  });

  it('forbids debt records from carrying an expense category', async () => {
    const [cat] = await h.db.insert(s.categories).values({ walletId, slug: 'transport' }).returning();
    await rejectsWith(
      h.db.insert(s.transactions).values(tx({ type: 'debt_given', categoryId: cat!.id })),
      'transactions_debt_no_category',
    );
  });

  it('keeps debt remaining within [0, total]', async () => {
    const base = { walletId, createdByUserId: userId, counterparty: 'Murod aka', counterpartyKey: 'murod aka', direction: 'given' as const, currency: 'UZS' as const };
    await rejectsWith(h.db.insert(s.debts).values({ ...base, total: 300_000, remaining: 400_000 }), 'debts_remaining_range');
    await rejectsWith(h.db.insert(s.debts).values({ ...base, total: 300_000, remaining: -1 }), 'debts_remaining_range');
  });

  it('rejects AI confidence outside 0..1', async () => {
    await rejectsWith(h.db.insert(s.transactions).values(tx({ aiConfidence: 1.5 })), 'transactions_confidence_range');
  });

  it('allows only one personal wallet per user', async () => {
    const err = await h.db.insert(s.wallets).values({ ownerUserId: userId }).then(() => null, (e: unknown) => e);
    expect((err as { cause?: { constraint?: string } }).cause?.constraint).toBe('wallets_one_personal_per_user');
  });
});

describe('budgets', () => {
  it('one total limit per wallet, positive amounts', async () => {
    await h.db.insert(s.budgets).values({ walletId, amountUzs: 1_000_000 });
    await rejectsWith(h.db.insert(s.budgets).values({ walletId, amountUzs: 2_000_000 }), 'budgets_wallet_total_uq');
    await rejectsWith(h.db.insert(s.budgets).values({ walletId, amountUzs: 0 }), 'budgets_amount_positive');
  });
});

describe('recurring payments', () => {
  it('day of month 1–28, positive amount', async () => {
    const base = { walletId, userId, amount: 1000, note: 'X', dayOfMonth: 5 };
    await h.db.insert(s.recurringPayments).values(base);
    await rejectsWith(h.db.insert(s.recurringPayments).values({ ...base, dayOfMonth: 29 }), 'recurring_day_range');
    await rejectsWith(h.db.insert(s.recurringPayments).values({ ...base, amount: 0 }), 'recurring_amount_positive');
  });
});
