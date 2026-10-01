import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { createTransaction, ensureUser, softDeleteTransaction } from '@hamyon/core';
import { runMaintenance } from '../src/maintenance';

let h: DbHandle;
beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h?.close());

describe('maintenance', () => {
  it('purges 30-day-old deleted transactions and old update ids, keeps recent ones', async () => {
    const t0 = new Date('2026-10-01T10:00:00Z');
    const deps = { db: h.db, fx: null, now: () => t0 };
    const { user, personalWalletId } = await ensureUser(h.db, { telegramId: 1 });
    const tx = await createTransaction(deps, {
      walletId: personalWalletId, userId: user.id, timeZone: 'Asia/Tashkent', source: 'text', rawInput: null,
      tx: { type: 'expense', amount: 1000, currency: 'UZS', category_id: 'food', note: null, counterparty: null, date: '2026-10-01', confidence: 1 },
    });
    await softDeleteTransaction(deps, user.id, tx.id);
    await h.db.insert(schema.processedUpdates).values([{ updateId: 1, receivedAt: t0 }, { updateId: 2, receivedAt: new Date(t0.getTime() + 25 * 86_400_000) }]);

    const early = await runMaintenance(h.db, new Date(t0.getTime() + 29 * 86_400_000));
    expect(early.purgedTransactions).toBe(0);
    expect(early.processedUpdates).toBe(1);
    const late = await runMaintenance(h.db, new Date(t0.getTime() + 31 * 86_400_000));
    expect(late.purgedTransactions).toBe(1);
    expect(await h.db.select().from(schema.processedUpdates)).toHaveLength(1);
  });
});
