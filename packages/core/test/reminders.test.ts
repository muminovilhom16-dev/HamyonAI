import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, resetTestDatabase, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { createDebt } from '../src/finance/debts';
import { claimProactive, dueDebtReminders, markProactiveFailed } from '../src/finance/reminders';
import { ensureUser } from '../src/users';

let h: DbHandle;
const TZ = 'Asia/Tashkent';
beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h?.close());

describe('proactive message cap (TZ rule 10)', () => {
  it('max 2 per local day, deduplicated, failed ones do not count', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 1 });
    const now = new Date('2026-10-01T10:00:00Z');
    const claim = (key: string, at = now) => claimProactive(h.db, { userId: user.id, kind: 'debt_due', dedupeKey: key, timeZone: TZ, maxPerDay: 2, now: at });
    const a = await claim('a');
    expect(a).not.toBeNull();
    expect(await claim('a')).toBeNull(); // duplicate
    const b = await claim('b');
    expect(b).not.toBeNull();
    expect(await claim('c')).toBeNull(); // cap reached
    await markProactiveFailed(h.db, b!);
    expect(await claim('c')).not.toBeNull(); // failed delivery freed a slot
    // Next local day (Tashkent midnight = 19:00 UTC).
    expect(await claim('d', new Date('2026-10-01T19:30:00Z'))).not.toBeNull();
  });

  it('concurrent workers cannot exceed the cap', async () => {
    const { user } = await ensureUser(h.db, { telegramId: 2 });
    const now = new Date('2026-10-01T10:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => claimProactive(h.db, { userId: user.id, kind: 'daily', dedupeKey: `k${i}`, timeZone: TZ, maxPerDay: 2, now })),
    );
    expect(results.filter(Boolean)).toHaveLength(2);
  });
});

describe('debt due reminders (TZ §32: 2 days before + due date)', () => {
  it('fires 2 days before and on the due date, after 10:00 local only', async () => {
    const { user, personalWalletId } = await ensureUser(h.db, { telegramId: 3 });
    const deps = { db: h.db, fx: null };
    await createDebt(deps, {
      walletId: personalWalletId, userId: user.id, timeZone: TZ, direction: 'given', counterparty: 'Murod aka',
      amount: 300_000, currency: 'UZS', date: '2026-10-01', dueDate: '2026-10-05', source: 'text', rawInput: null,
    });
    const at = (iso: string) => dueDebtReminders(h.db, new Date(iso)).then((r) => r.filter((x) => x.userId === user.id).map((x) => x.kind));
    expect(await at('2026-10-02T06:00:00Z')).toEqual([]); // 3 days before
    expect(await at('2026-10-03T04:00:00Z')).toEqual([]); // 09:00 local, too early
    expect(await at('2026-10-03T06:00:00Z')).toEqual(['due_soon']); // 11:00 local
    expect(await at('2026-10-04T06:00:00Z')).toEqual([]);
    expect(await at('2026-10-05T06:00:00Z')).toEqual(['due_today']);
    expect(await at('2026-10-06T06:00:00Z')).toEqual([]);
  });
});
