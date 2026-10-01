import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import {
  cleanCounterparty, counterpartyKey, createDebt, debtPaymentsOf, deleteDebtEvent, listOpenDebts, recordRepayment, setDebtDueDate, undoDebtEvent,
} from '../src/finance/debts';
import { periodRange } from '../src/finance/time';
import { summarize, type FinanceDeps } from '../src/finance/transactions';
import { ensureUser } from '../src/users';

let h: DbHandle;
const TZ = 'Asia/Tashkent';
const NOW = new Date('2026-10-01T10:00:00Z');
let clock = NOW;
let deps: FinanceDeps;

beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
  deps = { db: h.db, fx: { name: 'fake', fetchRate: async () => '12800.00' }, now: () => clock };
});
afterAll(async () => h?.close());

let tg = 1;
async function wallet() {
  const r = await ensureUser(h.db, { telegramId: tg++ });
  return { userId: r.user.id, walletId: r.personalWalletId, timeZone: TZ };
}
const give = (w: Awaited<ReturnType<typeof wallet>>, counterparty: string, amount: number, extra: Partial<Parameters<typeof createDebt>[1]> = {}) =>
  createDebt(deps, { ...w, direction: 'given', counterparty, amount, currency: 'UZS', date: '2026-10-01', source: 'text', rawInput: null, ...extra });
const ret = (w: Awaited<ReturnType<typeof wallet>>, counterparty: string, amount: number, dir: 'to_me' | 'by_me' | null = 'to_me', currency: 'UZS' | 'USD' = 'UZS') =>
  recordRepayment(deps, { ...w, counterparty, returnDirection: dir, amount, currency, date: '2026-10-01', source: 'text', rawInput: null });

describe('counterparty normalization', () => {
  it.each([
    ['Murod akaga', 'murod aka'],
    ['Murod aka', 'murod aka'],
    ['Мурод ака', 'murod aka'],
    ['Sardordan', 'sardor'],
  ])('%s → %s', (input, key) => expect(counterpartyKey(input)).toBe(key));

  it('cleans display names', () => {
    expect(cleanCounterparty('murodga')).toBe('Murod');
    expect(cleanCounterparty('Murod aka')).toBe('Murod aka');
  });
});

describe('TZ §12: 300 000 given, 100 000 returned → 200 000 remaining', () => {
  it('works end to end with history, and debts never count as expenses', async () => {
    const w = await wallet();
    const { debt, tx } = await give(w, 'Murod aka', 300_000);
    expect(tx).toMatchObject({ type: 'debt_given', categoryId: null, debtId: debt.id });
    const r = await ret(w, 'Murod aka', 100_000);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.remaining).toBe(200_000);
    const [d] = await h.db.select().from(schema.debts).where(eq(schema.debts.id, debt.id));
    expect(d).toMatchObject({ total: 300_000, remaining: 200_000, status: 'open' });
    const pays = await debtPaymentsOf(h.db, w.userId, debt.id);
    expect(pays.map((p) => p.amount)).toEqual([100_000]);

    const day = periodRange('day', NOW, TZ);
    const s = await summarize(h.db, w.userId, w.walletId, day.from, day.to);
    expect(s).toMatchObject({ expenseUzs: 0, incomeUzs: 0, count: 0 });
  });

  it('full repayment closes the debt', async () => {
    const w = await wallet();
    const { debt } = await give(w, 'Ali', 50_000);
    await ret(w, 'Ali', 20_000);
    await ret(w, 'Ali', 30_000);
    const [d] = await h.db.select().from(schema.debts).where(eq(schema.debts.id, debt.id));
    expect(d).toMatchObject({ remaining: 0, status: 'closed' });
    expect(await listOpenDebts(h.db, w.userId, w.walletId)).toEqual([]);
  });
});

describe('repayment rules', () => {
  it('FIFO across several debts with the same person (earliest due first)', async () => {
    const w = await wallet();
    const a = await give(w, 'Murod aka', 100_000);
    const b = await give(w, 'Murod aka', 200_000, { dueDate: '2026-10-05' });
    const r = await ret(w, 'murod aka', 250_000);
    if (r.kind !== 'ok') throw new Error(r.kind);
    const rows = await h.db.select().from(schema.debts).where(eq(schema.debts.walletId, w.walletId));
    const byId = Object.fromEntries(rows.map((d) => [d.id, d.remaining]));
    expect(byId[b.debt.id]).toBe(0); // due-dated debt first
    expect(byId[a.debt.id]).toBe(50_000);
    expect(r.remaining).toBe(50_000);
  });

  it('never overpays silently', async () => {
    const w = await wallet();
    await give(w, 'Vali', 100_000);
    expect(await ret(w, 'Vali', 150_000)).toEqual({ kind: 'overpayment', remaining: 100_000, currency: 'UZS' });
  });

  it('reports missing debt, currency mismatch and ambiguous people', async () => {
    const w = await wallet();
    expect((await ret(w, 'Nobody', 1000)).kind).toBe('no_debt');
    await give(w, 'Jon', 100, { currency: 'USD' });
    expect(await ret(w, 'Jon', 100, 'to_me', 'UZS')).toEqual({ kind: 'currency_mismatch', currency: 'USD' });
    await give(w, 'Aziz aka', 1000);
    await give(w, 'Aziz Karimov', 1000);
    const r = await ret(w, 'Aziz', 500);
    expect(r.kind).toBe('ambiguous_person');
  });

  it('direction: "qaytardim" pays my taken debts; unknown direction with both → ambiguous', async () => {
    const w = await wallet();
    await createDebt(deps, { ...w, direction: 'taken', counterparty: 'Sardor', amount: 1_000_000, currency: 'UZS', date: '2026-10-01', source: 'text', rawInput: null });
    expect((await ret(w, 'Sardor', 100_000, 'to_me')).kind).toBe('no_debt');
    const r = await ret(w, 'Sardor', 100_000, 'by_me');
    expect(r.kind === 'ok' && r.remaining).toBe(900_000);
    await give(w, 'Sardor', 50_000);
    expect((await ret(w, 'Sardor', 10_000, null)).kind).toBe('ambiguous_direction');
  });

  it('concurrent repayments cannot drive remaining below zero', async () => {
    const w = await wallet();
    await give(w, 'Bek', 100_000);
    const results = await Promise.all(Array.from({ length: 5 }, () => ret(w, 'Bek', 60_000)));
    expect(results.filter((r) => r.kind === 'ok')).toHaveLength(1);
    const [d] = await h.db.select().from(schema.debts).where(eq(schema.debts.walletId, w.walletId));
    expect(d!.remaining).toBe(40_000);
  });

  it('USD debts keep the USD amount and a frozen UZS value', async () => {
    const w = await wallet();
    const { tx, debt } = await give(w, 'Jon', 100, { currency: 'USD' });
    expect(debt).toMatchObject({ total: 100, currency: 'USD' });
    expect(tx).toMatchObject({ amount: 100, amountUzs: 1_280_000, fxRateUzs: '12800.00' });
  });
});

describe('delete and undo', () => {
  it('repayment delete restores remaining; undo within 10 s re-applies', async () => {
    const w = await wallet();
    const { debt } = await give(w, 'Olim', 300_000);
    const r = await ret(w, 'Olim', 100_000);
    if (r.kind !== 'ok') throw new Error();
    clock = NOW;
    await deleteDebtEvent(deps, w.userId, r.tx.id);
    let [d] = await h.db.select().from(schema.debts).where(eq(schema.debts.id, debt.id));
    expect(d!.remaining).toBe(300_000);
    clock = new Date(NOW.getTime() + 5000);
    expect((await undoDebtEvent(deps, w.userId, r.tx.id)).ok).toBe(true);
    [d] = await h.db.select().from(schema.debts).where(eq(schema.debts.id, debt.id));
    expect(d!.remaining).toBe(200_000);
    clock = NOW;
  });

  it('debt with repayments cannot be deleted; without, it can (and disappears from the list)', async () => {
    const w = await wallet();
    const a = await give(w, 'Karim', 100_000);
    await ret(w, 'Karim', 10_000);
    await expect(deleteDebtEvent(deps, w.userId, a.tx.id)).rejects.toMatchObject({ code: 'validation' });
    const b = await give(w, 'Lola', 70_000);
    await deleteDebtEvent(deps, w.userId, b.tx.id);
    expect((await listOpenDebts(h.db, w.userId, w.walletId)).map((g) => g.counterparty)).toEqual(['Karim']);
  });

  it("other users cannot touch someone's debts", async () => {
    const owner = await wallet();
    const attacker = await wallet();
    const { tx, debt } = await give(owner, 'Murod', 100_000);
    await expect(deleteDebtEvent(deps, attacker.userId, tx.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setDebtDueDate(deps, attacker.userId, debt.id, '2026-12-01')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(recordRepayment(deps, { ...attacker, walletId: owner.walletId, counterparty: 'Murod', returnDirection: 'to_me', amount: 1, currency: 'UZS', date: '2026-10-01', source: 'text', rawInput: null }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('listOpenDebts', () => {
  it('groups by person and direction with nearest due date', async () => {
    const w = await wallet();
    await give(w, 'Murod aka', 300_000, { dueDate: '2026-11-01' });
    await give(w, 'Murod akaga', 100_000, { dueDate: '2026-10-10' });
    await createDebt(deps, { ...w, direction: 'taken', counterparty: 'Sardor', amount: 1_000_000, currency: 'UZS', date: '2026-10-01', source: 'text', rawInput: null });
    const rows = await listOpenDebts(h.db, w.userId, w.walletId);
    expect(rows.map((r) => [r.counterparty, r.direction, r.remaining, r.nearestDue])).toEqual([
      ['Sardor', 'taken', 1_000_000, null],
      ['Murod aka', 'given', 400_000, '2026-10-10'],
    ]);
  });
});
