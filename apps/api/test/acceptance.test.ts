/**
 * TZ §61 — MANDATORY ACCEPTANCE TESTS, end to end through the real webhook,
 * database and web API. One test per line of the specification.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { AIUnavailableError } from '@hamyon/ai';
import { schema } from '@hamyon/db';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());
beforeEach(() => {
  H.reset();
  H.ai.current = null;
  H.clock.now = new Date('2026-10-05T10:00:00Z');
});

let next = 200_000;
async function user() {
  const id = next++;
  await H.send(id, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, menuVersion: 1, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
  H.reset();
  return id;
}
async function rows(tg: number) {
  const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, tg));
  const txs = await H.h.db
    .select({ tx: schema.transactions, slug: schema.categories.slug })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(and(eq(schema.transactions.userId, u!.id), isNull(schema.transactions.deletedAt)));
  return txs.map((r) => ({ ...r.tx, slug: r.slug }));
}
const confirmButton = () => H.lastKeyboard().flat().find((b) => b.text.startsWith('✅'))!.callback_data!;

describe('TZ §61 mandatory acceptance tests', () => {
  it('"taksi 20 ming" → 20 000 UZS → Transport', async () => {
    const id = await user();
    await H.send(id, 'taksi 20 ming');
    expect(await rows(id)).toMatchObject([{ amount: 20_000, currency: 'UZS', slug: 'transport', type: 'expense' }]);
  });

  it('"taksi 20" → 20 000 UZS → Transport → confirmation', async () => {
    const id = await user();
    await H.send(id, 'taksi 20');
    expect(H.texts()[0]).toContain("20 000 so'm");
    expect(H.texts()[0]).toContain('Transport');
    expect(H.texts()[0]).toContain("Summa to'g'rimi?");
    expect(await rows(id)).toHaveLength(0);
    await H.tap(id, confirmButton());
    expect(await rows(id)).toMatchObject([{ amount: 20_000, slug: 'transport' }]);
  });

  it('"такси 15к" → 15 000 → Transport', async () => {
    const id = await user();
    await H.send(id, 'такси 15к');
    expect(await rows(id)).toMatchObject([{ amount: 15_000, slug: 'transport' }]);
  });

  it('"bozordan go\'sht oldim yuz ellik ming" → 150 000 → Oziq-ovqat', async () => {
    const id = await user();
    await H.send(id, "bozordan go'sht oldim yuz ellik ming");
    expect(await rows(id)).toMatchObject([{ amount: 150_000, slug: 'food' }]);
  });

  it('"non 5 ming, sut 12 ming" → two transactions', async () => {
    const id = await user();
    await H.send(id, 'non 5 ming, sut 12 ming');
    const r = await rows(id);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.amount).sort((a, b) => a - b)).toEqual([5_000, 12_000]);
  });

  it('"kompyuterga windows o\'rnatish 70 ming" → Texnika va xizmatlar', async () => {
    const id = await user();
    await H.send(id, "kompyuterga windows o'rnatish 70 ming");
    expect(await rows(id)).toMatchObject([{ amount: 70_000, slug: 'tech_services' }]);
  });

  it('"kompyuter windows ustanovkasi" → same category (amount asked, never guessed)', async () => {
    const id = await user();
    await H.send(id, 'kompyuter windows ustanovkasi');
    expect(await rows(id)).toHaveLength(0);
    expect(H.texts()[0]).toContain('Summani aniqlay olmadim');
    await H.send(id, '70 ming');
    expect(await rows(id)).toMatchObject([{ amount: 70_000, slug: 'tech_services' }]);
  });

  it('"Murod akaga 300 ming qarz berdim" → debt → NOT expense', async () => {
    const id = await user();
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    const r = await rows(id);
    expect(r).toMatchObject([{ type: 'debt_given', amount: 300_000, slug: null }]);
    expect(r.filter((x) => x.type === 'expense')).toHaveLength(0);
  });

  it('"Murod aka 100 ming qaytardi" → remaining = 200 000', async () => {
    const id = await user();
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    await H.send(id, 'Murod aka 100 ming qaytardi');
    const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, id));
    const [d] = await H.h.db.select().from(schema.debts).where(eq(schema.debts.createdByUserId, u!.id));
    expect(d!.remaining).toBe(200_000);
  });

  it('"oylik tushdi 6 mln" → income', async () => {
    const id = await user();
    await H.send(id, 'oylik tushdi 6 mln');
    expect(await rows(id)).toMatchObject([{ type: 'income', amount: 6_000_000, slug: 'salary' }]);
  });

  it('"50$ kurtka" → 50 USD → UZS conversion → Kiyim', async () => {
    const id = await user();
    await H.send(id, '50$ kurtka');
    expect(await rows(id)).toMatchObject([{ amount: 50, currency: 'USD', amountUzs: 640_000, fxRateUzs: '12800.00', slug: 'clothing' }]);
  });

  it('"bugun bozorga bordim" → do not save → ask amount', async () => {
    const id = await user();
    await H.send(id, 'bugun bozorga bordim');
    expect(await rows(id)).toHaveLength(0);
    expect(H.texts()[0]).toContain('Summani aniqlay olmadim');
  });

  it('AI provider unavailable → transaction must not disappear', async () => {
    const id = await user();
    H.ai.current = {
      name: 'down',
      parseText: () => Promise.reject(new AIUnavailableError('api_error')),
      categorize: () => Promise.reject(new AIUnavailableError('api_error')),
    };
    await H.send(id, 'taksi 20 ming');
    await H.send(id, 'nomalum narsa 40 ming');
    const r = await rows(id);
    expect(r.map((x) => x.amount).sort((a, b) => a - b)).toEqual([20_000, 40_000]);
  });

  it('Expired /web → "Havola muddati tugadi"', async () => {
    const id = await user();
    await H.send(id, '/web');
    const token = decodeURIComponent(/token=(\S+)/.exec(H.texts().at(-1)!)![1]!);
    H.clock.now = new Date(H.clock.now.getTime() + 16 * 60_000);
    await H.h.db.update(schema.webLoginTokens).set({ expiresAt: new Date(Date.now() - 1) });
    const res = await H.app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    expect(res.statusCode).toBe(410);
    expect(res.body).toContain('Havola muddati tugadi.');
    expect(res.body).toContain('Botda /web deb yozing.');
  });

  it('No income in dashboard → do not show negative red balance', async () => {
    const id = await user();
    await H.send(id, 'taksi 20 ming');
    await H.send(id, '/web');
    const token = decodeURIComponent(/token=(\S+)/.exec(H.texts().at(-1)!)![1]!);
    const login = await H.app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    const cookie = login.cookies.find((c) => c.name === 'hamyon_session')!.value;
    const d = (await H.app.inject({ url: '/api/dashboard?period=month', cookies: { hamyon_session: cookie } })).json();
    expect(d.expenseUzs).toBe(20_000);
    expect(d.incomeUzs).toBe(0);
    expect(d.balanceUzs).toBeNull(); // UI shows "Daromadni kiriting" instead of a number
  });
});
