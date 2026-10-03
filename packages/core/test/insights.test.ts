import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, resetTestDatabase, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { monthInsights } from '../src/finance/insights';
import { createTransaction } from '../src/finance/transactions';
import { ensureUser } from '../src/users';

let h: DbHandle;
const TZ = 'Asia/Tashkent';
beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h.close());

describe('monthInsights', () => {
  it('average, forecast after day 5, same-days comparison with last month', async () => {
    const { user, personalWalletId: walletId } = await ensureUser(h.db, { telegramId: 7001 });
    const add = (amount: number, date: string, type: 'expense' | 'income' = 'expense') =>
      createTransaction({ db: h.db, fx: null, now: () => new Date(`${date}T08:00:00Z`) }, {
        userId: user.id, walletId, timeZone: TZ, source: 'text', rawInput: null,
        tx: { type, amount, currency: 'UZS', category_id: type === 'income' ? 'salary' : 'food', note: null, counterparty: null, date, confidence: 1 },
      });
    await add(100_000, '2026-09-03');
    await add(500_000, '2026-09-20'); // after the same-days window
    await add(150_000, '2026-10-02');
    await add(150_000, '2026-10-09');
    await add(5_000_000, '2026-10-01', 'income'); // income never counts

    const at = (iso: string) => monthInsights(h.db, { userId: user.id, walletId, timeZone: TZ, now: new Date(iso) });
    expect(await at('2026-10-10T10:00:00Z')).toEqual({
      dailyAverageUzs: 30_000, forecastUzs: 930_000, prevSamePeriodUzs: 100_000, changePct: 200, daysElapsed: 10, daysInMonth: 31,
    });
    const early = await at('2026-10-03T10:00:00Z');
    expect(early.forecastUzs).toBeNull();
    expect(early.dailyAverageUzs).toBe(50_000);
  });
});
