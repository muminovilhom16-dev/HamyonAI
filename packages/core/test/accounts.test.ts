import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, resetTestDatabase, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import {
  accountForNewRecord, accountHint, createAccount, listAccounts, setTransactionAccount, stripAccountWords, updateAccount,
} from '../src/finance/accounts';
import { createTransaction } from '../src/finance/transactions';
import { AppError } from '../src/errors';
import { ensureUser } from '../src/users';

let h: DbHandle;
beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h.close());

describe('account hints', () => {
  it.each([
    ['taksi 20 ming kartadan', 'card'],
    ['non 5 ming naqd', 'cash'],
    ['obed 45k humo', 'card'],
    ['такси 20к картой', 'card'],
    ['хлеб 5к наличными', 'cash'],
    ['taksi 20 ming', null],
    ['kartadan naqdga 100 ming', null], // both → ambiguous
  ])('%s → %s', (text, kind) => expect(accountHint(text)).toBe(kind));

  it('strips payment words from the note', () => {
    expect(stripAccountWords('Taksi kartadan')).toBe('Taksi');
    expect(stripAccountWords('naqd pul bilan bozor')).toBe('Bozor');
    expect(stripAccountWords('Kartadan')).toBeNull();
  });
});

describe('accounts', () => {
  it('balances, default account, hint routing, archive hands over default, isolation', async () => {
    const { user, personalWalletId: walletId } = await ensureUser(h.db, { telegramId: 8001 });
    const u = { userId: user.id, walletId };
    expect(await accountForNewRecord(h.db, walletId, 'card')).toBeNull(); // no accounts: nothing changes

    const cash = await createAccount(h.db, { ...u, name: 'Naqd', kind: 'cash', openingBalance: 500_000 });
    const card = await createAccount(h.db, { ...u, name: 'Humo', kind: 'card', openingBalance: 2_000_000 });
    expect(await accountForNewRecord(h.db, walletId, null)).toBe(cash); // first = default
    expect(await accountForNewRecord(h.db, walletId, 'card')).toBe(card);

    const add = (amount: number, type: 'expense' | 'income', accountId: string | null) =>
      createTransaction({ db: h.db, fx: null, now: () => new Date('2026-10-10T08:00:00Z') }, {
        ...u, timeZone: 'Asia/Tashkent', source: 'text', rawInput: null, accountId,
        tx: { type, amount, currency: 'UZS', category_id: type === 'income' ? 'salary' : 'food', note: null, counterparty: null, date: '2026-10-10', confidence: 1 },
      });
    await add(50_000, 'expense', cash);
    await add(6_000_000, 'income', card);
    const t = await add(100_000, 'expense', null);
    await setTransactionAccount(h.db, user.id, t.id, card);

    const list = await listAccounts(h.db, u);
    expect(list.map((a) => [a.name, a.balance, a.isDefault])).toEqual([['Naqd', 450_000, true], ['Humo', 7_900_000, false]]);

    await updateAccount(h.db, user.id, cash, { archived: true });
    expect((await listAccounts(h.db, u)).map((a) => [a.name, a.isDefault])).toEqual([['Humo', true]]);

    const other = await ensureUser(h.db, { telegramId: 8002 });
    await expect(setTransactionAccount(h.db, other.user.id, t.id, card)).rejects.toBeInstanceOf(AppError);
    const foreign = await createAccount(h.db, { userId: other.user.id, walletId: other.personalWalletId, name: 'X', kind: 'card' });
    await expect(setTransactionAccount(h.db, user.id, t.id, foreign)).rejects.toBeInstanceOf(AppError);
    await expect(add(1, 'expense', foreign)).rejects.toBeInstanceOf(AppError);
  });
});
