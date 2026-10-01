import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());
beforeEach(() => {
  H.reset();
  H.clock.now = new Date('2026-10-05T10:00:00Z');
});

let nextUser = 90_000;
/** Creates a bot user, logs into the web via /web, returns the session cookie. */
async function login(): Promise<{ tg: number; cookie: string }> {
  const tg = nextUser++;
  await H.send(tg, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, tg));
  H.reset();
  await H.send(tg, '/web');
  const token = decodeURIComponent(/token=(\S+)/.exec(H.texts().at(-1)!)![1]!);
  const res = await H.app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
  return { tg, cookie: res.cookies.find((c) => c.name === 'hamyon_session')!.value };
}
const api = (cookie: string, method: 'GET' | 'PATCH' | 'DELETE' | 'POST', url: string, body?: object, csrf = true) =>
  H.app.inject({ method, url, cookies: { hamyon_session: cookie }, headers: csrf ? { 'x-hamyon-csrf': '1' } : {}, ...(body && { payload: body }) });

describe('auth & CSRF', () => {
  it('requires a session', async () => {
    expect((await H.app.inject('/api/dashboard')).statusCode).toBe(401);
    expect((await H.app.inject('/api/transactions')).json()).toEqual({ error: 'unauthorized' });
  });

  it('mutations require the CSRF header', async () => {
    const { cookie } = await login();
    const r = await api(cookie, 'PATCH', '/api/settings', { language: 'ru' }, false);
    expect(r.statusCode).toBe(403);
    expect((await api(cookie, 'PATCH', '/api/settings', { language: 'ru' })).statusCode).toBe(200);
  });
});

describe('dashboard', () => {
  it('cards, categories summing to 100%, zero-filled daily series', async () => {
    const { tg, cookie } = await login();
    await H.send(tg, 'taksi 20 ming');
    await H.send(tg, 'non 5 ming, sut 12 ming');
    await H.send(tg, 'oylik tushdi 6 mln');
    await H.send(tg, 'Murod akaga 300 ming qarz berdim');
    const d = (await api(cookie, 'GET', '/api/dashboard?period=week')).json();
    expect(d).toMatchObject({ expenseUzs: 37_000, incomeUzs: 6_000_000, balanceUzs: 5_963_000, range: { startDate: '2026-10-05', endDate: '2026-10-11' } });
    expect(d.debts.owedToMe).toEqual([{ currency: 'UZS', amount: 300_000 }]);
    expect(d.byCategory.reduce((a: number, c: { percentTenths: number }) => a + c.percentTenths, 0)).toBe(1000);
    expect(d.daily).toHaveLength(7);
    expect(d.daily.map((x: { expenseUzs: number }) => x.expenseUzs)).toEqual([37_000, 0, 0, 0, 0, 0, 0]);
  });

  it('no income → balanceUzs is null', async () => {
    const { tg, cookie } = await login();
    await H.send(tg, 'taksi 20 ming');
    expect((await api(cookie, 'GET', '/api/dashboard?period=month')).json().balanceUzs).toBeNull();
  });

  it('validates custom ranges', async () => {
    const { cookie } = await login();
    expect((await api(cookie, 'GET', '/api/dashboard?period=custom&start=2026-10-10&end=2026-10-01')).statusCode).toBe(400);
    expect((await api(cookie, 'GET', '/api/dashboard?period=custom&start=2024-01-01&end=2026-10-01')).statusCode).toBe(400);
    expect((await api(cookie, 'GET', '/api/dashboard?period=custom&start=2026-09-01&end=2026-10-01')).statusCode).toBe(200);
  });
});

describe('transactions', () => {
  it('lists, edits (category correction learns), deletes and restores', async () => {
    const { tg, cookie } = await login();
    await H.send(tg, 'xyz 40 ming');
    await H.send(tg, 'taksi 20 ming');
    const list = (await api(cookie, 'GET', '/api/transactions')).json();
    expect(list.items).toHaveLength(2);
    const xyz = list.items.find((i: { note: string }) => i.note === 'Xyz');
    expect(xyz).toMatchObject({ amount: 40_000, categoryPending: true, date: '2026-10-05', time: '15:00' });

    const cats = (await api(cookie, 'GET', '/api/categories')).json();
    const fun = cats.find((c: { name: string }) => c.name === "Ko'ngilochar");
    const edited = await api(cookie, 'PATCH', `/api/transactions/${xyz.id}`, { categoryId: fun.id, amount: 45_000, note: 'Bouling' });
    expect(edited.json()).toMatchObject({ amount: 45_000, categoryName: "Ko'ngilochar", note: 'Bouling', categoryPending: false });

    expect((await api(cookie, 'DELETE', `/api/transactions/${xyz.id}`)).statusCode).toBe(204);
    expect((await api(cookie, 'GET', '/api/transactions')).json().items).toHaveLength(1);
    expect((await api(cookie, 'POST', `/api/transactions/${xyz.id}/restore`)).json()).toEqual({ ok: true });
    expect((await api(cookie, 'GET', '/api/transactions')).json().items).toHaveLength(2);

    await api(cookie, 'DELETE', `/api/transactions/${xyz.id}`);
    H.clock.now = new Date(H.clock.now.getTime() + 11_000);
    expect((await api(cookie, 'POST', `/api/transactions/${xyz.id}/restore`)).statusCode).toBe(410);
  });

  it('rejects invalid edits (float amounts, unknown fields, debt amounts)', async () => {
    const { tg, cookie } = await login();
    await H.send(tg, 'taksi 20 ming');
    await H.send(tg, 'Alisherga 50 ming qarz berdim');
    const items = (await api(cookie, 'GET', '/api/transactions')).json().items;
    const taxi = items.find((i: { type: string }) => i.type === 'expense');
    const debt = items.find((i: { type: string }) => i.type === 'debt_given');
    expect((await api(cookie, 'PATCH', `/api/transactions/${taxi.id}`, { amount: 10.5 })).statusCode).toBe(400);
    expect((await api(cookie, 'PATCH', `/api/transactions/${taxi.id}`, { amountUzs: 1 })).statusCode).toBe(400);
    expect((await api(cookie, 'PATCH', `/api/transactions/${debt.id}`, { amount: 1 })).statusCode).toBe(400);
  });

  it('filters by type and paginates', async () => {
    const { tg, cookie } = await login();
    for (const m of ['taksi 1 ming', 'taksi 2 ming', 'taksi 3 ming', 'oylik 5 mln']) await H.send(tg, m);
    const p1 = (await api(cookie, 'GET', '/api/transactions?type=expense&limit=2')).json();
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await api(cookie, 'GET', `/api/transactions?type=expense&limit=2&cursor=${p1.nextCursor}`)).json();
    expect(p2.items).toHaveLength(1);
    expect((await api(cookie, 'GET', '/api/transactions?cursor=garbage')).statusCode).toBe(400);
  });
});

describe('isolation between users (TZ §39)', () => {
  it("cannot read or change another user's data", async () => {
    const a = await login();
    const b = await login();
    await H.send(a.tg, 'taksi 20 ming');
    const [tx] = (await api(a.cookie, 'GET', '/api/transactions')).json().items;
    expect((await api(b.cookie, 'GET', '/api/transactions')).json().items).toEqual([]);
    expect((await api(b.cookie, 'PATCH', `/api/transactions/${tx.id}`, { amount: 1 })).statusCode).toBe(403);
    expect((await api(b.cookie, 'DELETE', `/api/transactions/${tx.id}`)).statusCode).toBe(403);
    expect((await api(a.cookie, 'GET', '/api/transactions')).json().items[0].amount).toBe(20_000);
  });
});

describe('debts & settings', () => {
  it('lists debts with payment history and sets due date', async () => {
    const { tg, cookie } = await login();
    await H.send(tg, 'Murod akaga 300 ming qarz berdim');
    await H.send(tg, 'Murod aka 100 ming qaytardi');
    const debts = (await api(cookie, 'GET', '/api/debts')).json();
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ counterparty: 'Murod aka', direction: 'given', remaining: 200_000, total: 300_000 });
    expect(debts[0].debts[0].payments).toEqual([{ amount: 100_000, date: '2026-10-05' }]);
    const r = await api(cookie, 'PATCH', `/api/debts/${debts[0].debts[0].id}`, { dueDate: '2026-11-01' });
    expect(r.json().dueDate).toBe('2026-11-01');
  });

  it('reads and updates settings with validation', async () => {
    const { cookie } = await login();
    expect((await api(cookie, 'GET', '/api/settings')).json()).toMatchObject({ language: 'uz_latn', currency: 'UZS', timezone: 'Asia/Tashkent', reminderTime: '21:00' });
    expect((await api(cookie, 'PATCH', '/api/settings', { reminderTime: '25:00' })).statusCode).toBe(400);
    expect((await api(cookie, 'PATCH', '/api/settings', { reminderTime: '20:30', remindersEnabled: false })).json())
      .toMatchObject({ reminderTime: '20:30', remindersEnabled: false });
  });
});
