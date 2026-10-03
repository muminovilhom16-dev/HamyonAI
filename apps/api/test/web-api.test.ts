import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { createHarness, type Harness } from './harness';

let H: Harness;
// Many logins and API calls per minute in this file: lift the per-IP rate limits.
beforeAll(async () => { H = await createHarness({ RATE_LIMIT_MAX_PER_MINUTE: '5000', AUTH_RATE_LIMIT_PER_MINUTE: '500' }); });
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
const api = (cookie: string, method: 'GET' | 'PATCH' | 'DELETE' | 'POST' | 'PUT', url: string, body?: object, csrf = true) =>
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
    expect(edited.json()).toMatchObject({ amount: 45_000, categoryName: "Ko'ngilochar", categoryIcon: '🎬', note: 'Bouling', categoryPending: false });

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

  it('searches by note, person and category name; wildcards are literal', async () => {
    const { tg, cookie } = await login();
    for (const m of ['taksi 10 ming', 'Korzinka 50 ming', 'Murod akaga 100 ming qarz berdim', 'kino 30 ming']) await H.send(tg, m);
    const search = async (q: string) =>
      (await api(cookie, 'GET', `/api/transactions?q=${encodeURIComponent(q)}`)).json().items.map((t: { amount: number }) => t.amount);
    expect(await search('korz')).toEqual([50_000]);
    expect(await search('murod')).toEqual([100_000]);
    expect(await search('transport')).toEqual([10_000]); // category name
    expect(await search('%')).toEqual([]);
  });
});

describe('manual entry and categories from the web', () => {
  it('creates expense/income; validates kind, date and amount', async () => {
    const { cookie } = await login();
    const cats = (await api(cookie, 'GET', '/api/categories')).json() as Array<{ id: string; name: string; kind: string }>;
    const food = cats.find((c) => c.name === 'Oziq-ovqat')!;
    const salary = cats.find((c) => c.name === 'Oylik')!;
    const today = '2026-10-01';
    const ok = await api(cookie, 'POST', '/api/transactions', { type: 'expense', amount: 45_000, categoryId: food.id, date: today, note: 'Bozor' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ type: 'expense', amount: 45_000, currency: 'UZS', categoryName: 'Oziq-ovqat', note: 'Bozor', source: 'web' });
    expect((await api(cookie, 'POST', '/api/transactions', { type: 'income', amount: 6_000_000, categoryId: salary.id, date: today })).statusCode).toBe(201);

    const bad = (body: object) => api(cookie, 'POST', '/api/transactions', { type: 'expense', amount: 1000, categoryId: food.id, date: today, ...body });
    expect((await bad({ type: 'income' })).statusCode).toBe(400); // expense category for income
    expect((await bad({ date: '2026-10-06' })).statusCode).toBe(400); // future (test clock: 5 Oct)
    expect((await bad({ amount: 10.5 })).statusCode).toBe(400);
    expect((await bad({ type: 'debt_given' })).statusCode).toBe(400);
    expect((await api(cookie, 'POST', '/api/transactions', { type: 'expense', amount: 1, categoryId: food.id, date: today }, false)).statusCode).toBe(403);

    const list = (await api(cookie, 'GET', '/api/transactions')).json().items;
    expect(list.map((t: { amount: number }) => t.amount).sort()).toEqual([45_000, 6_000_000]);
  });

  it('adds, renames and hides categories; duplicates and foreign ids are rejected', async () => {
    const a = await login();
    const b = await login();
    const created = await api(a.cookie, 'POST', '/api/categories', { name: '  Sport  zal ', kind: 'expense', icon: '🏋️' });
    expect(created.statusCode).toBe(201);
    const cat = created.json();
    expect(cat).toMatchObject({ name: 'Sport zal', kind: 'expense', custom: true });
    expect((await api(a.cookie, 'POST', '/api/categories', { name: 'sport ZAL', kind: 'expense' })).statusCode).toBe(400);
    expect((await api(a.cookie, 'POST', '/api/categories', { name: 'Transport', kind: 'expense' })).statusCode).toBe(400);

    // Usable for records right away, also from the bot.
    expect((await api(a.cookie, 'POST', '/api/transactions', { type: 'expense', amount: 200_000, categoryId: cat.id, date: '2026-10-01' })).statusCode).toBe(201);

    expect((await api(a.cookie, 'PATCH', `/api/categories/${cat.id}`, { name: 'Fitnes' })).statusCode).toBe(204);
    const transport = (await api(a.cookie, 'GET', '/api/categories')).json().find((c: { name: string }) => c.name === 'Transport');
    expect((await api(a.cookie, 'PATCH', `/api/categories/${transport.id}`, { hidden: true })).statusCode).toBe(204);
    const visible = (await api(a.cookie, 'GET', '/api/categories')).json().map((c: { name: string }) => c.name);
    expect(visible).toContain('Fitnes');
    expect(visible).not.toContain('Transport');
    const all = (await api(a.cookie, 'GET', '/api/categories?all=1')).json();
    expect(all.find((c: { name: string }) => c.name === 'Transport')).toMatchObject({ hidden: true, custom: false });
    // System name can be restored with null; a custom one cannot lose its name.
    expect((await api(a.cookie, 'PATCH', `/api/categories/${cat.id}`, { name: null })).statusCode).toBe(400);

    expect((await api(b.cookie, 'PATCH', `/api/categories/${cat.id}`, { name: 'hack' })).statusCode).toBe(403);
    expect((await api(b.cookie, 'POST', '/api/transactions', { type: 'expense', amount: 1, categoryId: cat.id, date: '2026-10-01' })).statusCode).toBe(400);
  });
});

describe('budgets API', () => {
  it('upserts, reports spending, deletes; foreign ids rejected', async () => {
    const a = await login();
    const b = await login();
    await H.send(a.tg, 'taksi 40 ming');
    const transport = (await api(a.cookie, 'GET', '/api/categories')).json().find((c: { name: string }) => c.name === 'Transport');
    const put = await api(a.cookie, 'PUT', '/api/budgets', { categoryId: transport.id, amountUzs: 100_000 });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject([{ categoryId: transport.id, name: 'Transport', limitUzs: 100_000, spentUzs: 40_000 }]);
    expect((await api(a.cookie, 'PUT', '/api/budgets', { categoryId: null, amountUzs: 1.5 })).statusCode).toBe(400);
    const [budget] = (await api(a.cookie, 'GET', '/api/budgets')).json();
    expect((await api(b.cookie, 'DELETE', `/api/budgets/${budget.id}`)).statusCode).toBe(403);
    expect((await api(b.cookie, 'PUT', '/api/budgets', { categoryId: transport.id, amountUzs: 1 })).statusCode).toBe(400);
    expect((await api(a.cookie, 'DELETE', `/api/budgets/${budget.id}`)).statusCode).toBe(204);
    expect((await api(a.cookie, 'GET', '/api/budgets')).json()).toEqual([]);
  });
});

describe('recurring API', () => {
  it('creates with validation, lists next date, deletes; isolation', async () => {
    const a = await login();
    const b = await login();
    const telecom = (await api(a.cookie, 'GET', '/api/categories')).json().find((c: { name: string }) => c.name === 'Aloqa va internet');
    const res = await api(a.cookie, 'POST', '/api/recurring', { note: 'Internet', amount: 99_000, categoryId: telecom.id, dayOfMonth: 10 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject([{ note: 'Internet', amount: 99_000, currency: 'UZS', dayOfMonth: 10, nextDate: '2026-10-10', categoryName: 'Aloqa va internet' }]);
    expect((await api(a.cookie, 'POST', '/api/recurring', { note: 'X', amount: 1, categoryId: null, dayOfMonth: 31 })).statusCode).toBe(400);
    const [r] = (await api(a.cookie, 'GET', '/api/recurring')).json();
    expect((await api(b.cookie, 'DELETE', `/api/recurring/${r.id}`)).statusCode).toBe(403);
    expect((await api(b.cookie, 'POST', '/api/recurring', { note: 'X', amount: 1, categoryId: telecom.id, dayOfMonth: 1 })).statusCode).toBe(400);
    expect((await api(a.cookie, 'DELETE', `/api/recurring/${r.id}`)).statusCode).toBe(204);
  });
});

describe('goals API', () => {
  it('creates with per-month plan, contributes, prevents overdraw; isolation', async () => {
    const a = await login();
    const b = await login();
    // Test clock: 5 Oct 2026 → target 31 Mar 2027 leaves 6 months.
    const [g] = (await api(a.cookie, 'POST', '/api/goals', { name: 'Telefon', targetAmount: 6_000_000, targetDate: '2027-03-31' })).json();
    expect(g).toMatchObject({ name: 'Telefon', savedAmount: 0, perMonth: 1_000_000, completed: false });
    const after = (await api(a.cookie, 'POST', `/api/goals/${g.id}/contributions`, { amount: 3_000_000 })).json();
    expect(after[0]).toMatchObject({ savedAmount: 3_000_000, perMonth: 500_000 });
    expect((await api(a.cookie, 'POST', `/api/goals/${g.id}/contributions`, { amount: -4_000_000 })).statusCode).toBe(400);
    expect((await api(a.cookie, 'POST', `/api/goals/${g.id}/contributions`, { amount: 0 })).statusCode).toBe(400);
    expect((await api(b.cookie, 'POST', `/api/goals/${g.id}/contributions`, { amount: 1 })).statusCode).toBe(403);
    expect((await api(b.cookie, 'DELETE', `/api/goals/${g.id}`)).statusCode).toBe(403);
    // Savings never show up as spending.
    expect((await api(a.cookie, 'GET', '/api/transactions')).json().items).toEqual([]);
    expect((await api(a.cookie, 'DELETE', `/api/goals/${g.id}`)).statusCode).toBe(204);
  });
});

describe('accounts API', () => {
  it('create, default routing for web records, move a record, balances, archive; isolation', async () => {
    const a = await login();
    const b = await login();
    const created = (await api(a.cookie, 'POST', '/api/accounts', { name: 'Humo', kind: 'card', openingBalance: 1_000_000 })).json();
    expect(created).toMatchObject([{ name: 'Humo', kind: 'card', isDefault: true, balance: 1_000_000 }]);
    const [, cash] = (await api(a.cookie, 'POST', '/api/accounts', { name: 'Naqd', kind: 'cash' })).json();
    const food = (await api(a.cookie, 'GET', '/api/categories')).json().find((c: { name: string }) => c.name === 'Oziq-ovqat');
    const tx = (await api(a.cookie, 'POST', '/api/transactions', { type: 'expense', amount: 100_000, categoryId: food.id, date: '2026-10-05' })).json();
    expect(tx.accountId).toBe(created[0].id); // default account
    expect((await api(a.cookie, 'PATCH', `/api/transactions/${tx.id}`, { accountId: cash.id })).json().accountId).toBe(cash.id);
    const list = (await api(a.cookie, 'GET', '/api/accounts')).json();
    expect(list.map((x: { name: string; balance: number }) => [x.name, x.balance])).toEqual([['Humo', 1_000_000], ['Naqd', -100_000]]);

    expect((await api(b.cookie, 'PATCH', `/api/accounts/${cash.id}`, { name: 'x' })).statusCode).toBe(403);
    expect((await api(b.cookie, 'PATCH', `/api/transactions/${tx.id}`, { accountId: null })).statusCode).toBe(403);
    const after = (await api(a.cookie, 'PATCH', `/api/accounts/${created[0].id}`, { archived: true })).json();
    expect(after).toMatchObject([{ name: 'Naqd', isDefault: true }]);
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
