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
  H.clock.now = new Date('2026-10-01T10:00:00Z');
});

let nextUser = 10_000;
async function newUser(): Promise<number> {
  const id = nextUser++;
  // Skip onboarding for flow tests.
  await H.send(id, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
  H.reset();
  return id;
}

async function txsOf(tgId: number) {
  const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, tgId));
  return H.h.db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, u!.id), isNull(schema.transactions.deletedAt)));
}

const buttons = () => H.lastKeyboard().flat();
const button = (label: string | RegExp) => {
  const b = buttons().find((x) => (typeof label === 'string' ? x.text === label : label.test(x.text)));
  if (!b) throw new Error(`no button ${label}; have ${buttons().map((x) => x.text).join(', ')}`);
  return b.callback_data!;
};

describe('onboarding (TZ §14)', () => {
  it('/start → language → currency → first transaction → reminder → done', async () => {
    const id = nextUser++;
    await H.send(id, '/start');
    expect(buttons().map((b) => b.text)).toEqual(["O'zbekcha", 'Ўзбекча', 'Русский']);
    await H.tap(id, 'ob:l:ru');
    expect(H.texts().at(-1)).toContain('валюту');
    await H.tap(id, 'ob:c:UZS');
    expect(H.texts().at(-1)).toContain('первый расход');
    H.reset();
    await H.send(id, 'такси 15к');
    expect(H.texts()[0]).toBe('15 000 сум\nТранспорт\nТакси\nСегодня');
    expect(H.texts()[1]).toContain('напоминать');
    await H.tap(id, 'ob:r:2100');
    const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, id));
    expect(u).toMatchObject({ language: 'ru', currency: 'UZS', reminderTime: '21:00:00', onboardingStep: null });
    expect(u!.onboardingCompletedAt).not.toBeNull();
    const ev = await H.h.db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, u!.id));
    expect(ev.map((e) => e.name)).toEqual(expect.arrayContaining(['start', 'transaction_created', 'onboarding_completed']));
  });
});

describe('TZ §61 acceptance through the bot', () => {
  it('taksi 20 ming → saved, card with [Transport][20 000][Bugun][O\'chirish]', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    expect(H.texts()).toEqual(["20 000 so'm\nTransport\nTaksi\nBugun"]);
    expect(H.lastKeyboard().map((r) => r.map((b) => b.text))).toEqual([['Transport', '20 000', 'Bugun'], ["🗑 O'chirish"]]);
    const rows = await txsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'expense', amount: 20_000, currency: 'UZS', amountUzs: 20_000, source: 'text' });
  });

  it('taksi 20 → asks to confirm, nothing saved until confirmed', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20');
    expect(H.texts()[0]).toContain("Summa to'g'rimi?");
    expect(await txsOf(id)).toHaveLength(0);
    await H.tap(id, button(/^✅/));
    const rows = await txsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(20_000);
    // Double tap cannot save twice.
    await H.tap(id, H.calls.find((c) => c.payload.reply_markup?.inline_keyboard?.[0]?.[0]?.text?.startsWith('✅'))!.payload.reply_markup.inline_keyboard[0][0].callback_data);
    expect(await txsOf(id)).toHaveLength(1);
  });

  it('taksi 20 → other amount → "50" saves 50 000', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20');
    await H.tap(id, button(/Boshqa summa/));
    await H.send(id, '50');
    const rows = await txsOf(id);
    expect(rows.map((r) => r.amount)).toEqual([50_000]);
  });

  it('bozordan go\'sht oldim yuz ellik ming → 150 000, Oziq-ovqat', async () => {
    const id = await newUser();
    await H.send(id, "bozordan go'sht oldim yuz ellik ming");
    expect(H.texts()[0]).toMatch(/^150 000 so'm\nOziq-ovqat/);
  });

  it('non 5 ming, sut 12 ming → two transactions, two cards', async () => {
    const id = await newUser();
    await H.send(id, 'non 5 ming, sut 12 ming');
    expect(H.texts()).toHaveLength(2);
    expect((await txsOf(id)).map((r) => r.amount).sort((a, b) => a - b)).toEqual([5_000, 12_000]);
  });

  it('windows installation (two phrasings) → Texnika va xizmatlar', async () => {
    const id = await newUser();
    await H.send(id, "kompyuterga windows o'rnatish 70 ming");
    await H.send(id, 'kompyuter windows ustanovkasi 60 ming');
    expect(H.texts().every((t) => t.includes('Texnika va xizmatlar'))).toBe(true);
  });

  it('Murod akaga 300 ming qarz berdim → debt, NOT expense', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    expect(H.texts()[0]).toContain('qarz');
    expect(await txsOf(id)).toHaveLength(0);
  });

  it('Murod akaga 300 ming → asks debt or expense; "Xarajat" → pick category → saved', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 ming');
    expect(H.texts()[0]).toContain('Bu qarzmi yoki xarajatmi?');
    expect(buttons().map((b) => b.text)).toEqual(['Qarz berdim', 'Xarajat']);
    await H.tap(id, button('Xarajat'));
    expect(H.texts().at(-1)).toContain('Kategoriyani tanlang');
    await H.tap(id, button(/Boshqa$/));
    const rows = await txsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'expense', amount: 300_000, counterparty: 'Murod aka' });
  });

  it('oylik tushdi 6 mln → income', async () => {
    const id = await newUser();
    await H.send(id, 'oylik tushdi 6 mln');
    expect(H.texts()[0]).toBe("+6 000 000 so'm\nDaromad · Oylik\nOylik\nBugun");
    expect((await txsOf(id))[0]).toMatchObject({ type: 'income', amount: 6_000_000 });
  });

  it('50$ kurtka → 50 USD, converted to UZS, Kiyim', async () => {
    const id = await newUser();
    await H.send(id, '50$ kurtka');
    expect(H.texts()[0]).toBe("$50 · 640 000 so'm\nKiyim\nKurtka\nBugun");
    expect((await txsOf(id))[0]).toMatchObject({ amount: 50, currency: 'USD', amountUzs: 640_000, fxRateUzs: '12800.00' });
  });

  it('bugun bozorga bordim → not saved, asks amount; "50 ming" completes it', async () => {
    const id = await newUser();
    await H.send(id, 'bugun bozorga bordim');
    expect(H.texts()).toEqual(["Summani aniqlay olmadim. Qancha bo'ldi? Masalan: «50 ming»."]);
    expect(await txsOf(id)).toHaveLength(0);
    await H.send(id, '50 ming');
    const rows = await txsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(50_000);
    expect(H.texts().at(-1)).toContain('Oziq-ovqat');
  });

  it('AI provider unavailable → transaction does not disappear', async () => {
    const id = await newUser();
    H.ai.current = {
      name: 'down',
      parseText: () => Promise.reject(new AIUnavailableError('timeout')),
      categorize: () => Promise.reject(new AIUnavailableError('timeout')),
    };
    await H.send(id, 'xyz 40 ming');
    const rows = await txsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 40_000, categoryStatus: 'pending', categoryId: null });
    expect(H.texts()[0]).toContain('Kategoriya: aniqlanmagan');
  });
});

describe('card editing, delete, undo', () => {
  it('category correction becomes a rule for the next message', async () => {
    const id = await newUser();
    await H.send(id, 'xyz 30 ming'); // AI disabled → pending category
    const [tx] = await txsOf(id);
    await H.tap(id, `cat:${tx!.id}`);
    await H.tap(id, button(/Ko'ngilochar/));
    expect(H.texts().at(-1)).toContain("Ko'ngilochar");
    H.reset();
    await H.send(id, 'xyz 10 ming');
    expect(H.texts()[0]).toContain("Ko'ngilochar");
    const rows = await txsOf(id);
    expect(rows.every((r) => r.categoryStatus === 'final')).toBe(true);
  });

  it('amount and date can be edited from the card', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    const [tx] = await txsOf(id);
    await H.tap(id, `amt:${tx!.id}`);
    await H.send(id, '25 ming');
    await H.tap(id, `dt:${tx!.id}`);
    await H.tap(id, `sd:${tx!.id}:1`);
    expect(H.texts().at(-1)).toBe("25 000 so'm\nTransport\nTaksi\nKecha");
  });

  it('delete → undo within 10 s restores; after 10 s it is too late', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    const [tx] = await txsOf(id);
    await H.tap(id, `del:${tx!.id}`);
    expect(H.texts().at(-1)).toMatch(/^🗑 O'chirildi/);
    expect(await txsOf(id)).toHaveLength(0);
    H.clock.now = new Date(H.clock.now.getTime() + 5_000);
    await H.tap(id, `undo:${tx!.id}`);
    expect(await txsOf(id)).toHaveLength(1);

    await H.tap(id, `del:${tx!.id}`);
    H.clock.now = new Date(H.clock.now.getTime() + 11_000);
    await H.tap(id, `undo:${tx!.id}`);
    expect(await txsOf(id)).toHaveLength(0);
    const answer = H.calls.filter((c) => c.method === 'answerCallbackQuery').at(-1);
    expect(answer!.payload.text).toBe("Qaytarish muddati o'tdi");
  });
});

describe('reports and lists', () => {
  it('/bugun is short and excludes debts; /oxirgi lists with edit/delete', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    await H.send(id, 'non 5 ming, sut 12 ming');
    await H.send(id, 'oylik tushdi 6 mln');
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    H.reset();
    await H.send(id, '/bugun');
    const report = H.texts()[0]!;
    expect(report).toBe("📊 Bugungi hisobot\n\nXarajat: 37 000 so'm\nDaromad: 6 000 000 so'm\nEng katta kategoriya: Transport — 20 000 so'm");
    expect(report.split('\n').length).toBeLessThanOrEqual(6);

    H.reset();
    await H.send(id, '/oxirgi');
    expect(H.texts()[0]).toContain('1. +6 000 000 so\'m');
    expect(buttons().filter((b) => b.text.startsWith('✏️'))).toHaveLength(4);
    expect(buttons().filter((b) => b.text.startsWith('🗑'))).toHaveLength(4);
  });

  it('/hafta with no records says so', async () => {
    const id = await newUser();
    await H.send(id, '/hafta');
    expect(H.texts()[0]).toContain("hali yozuv yo'q");
  });
});

describe('security', () => {
  it("cannot edit or delete another user's transaction via forged callbacks", async () => {
    const owner = await newUser();
    const attacker = await newUser();
    await H.send(owner, 'taksi 20 ming');
    const [tx] = await txsOf(owner);
    H.reset();
    await H.tap(attacker, `del:${tx!.id}`);
    await H.tap(attacker, `sc:${tx!.id}:food`);
    await H.tap(attacker, `undo:${tx!.id}`);
    expect(await txsOf(owner)).toHaveLength(1);
    expect((await txsOf(owner))[0]!.amount).toBe(20_000);
    expect(H.calls.some((c) => c.method === 'editMessageText')).toBe(false);
  });

  it('forged pending ids are rejected', async () => {
    const owner = await newUser();
    const attacker = await newUser();
    await H.send(owner, 'taksi 20');
    const data = button(/^✅/);
    await H.tap(attacker, data);
    expect(await txsOf(attacker)).toHaveLength(0);
    expect(await txsOf(owner)).toHaveLength(0);
  });

  it('card numbers are masked before persistence', async () => {
    const id = await newUser();
    await H.send(id, 'karta 8600123412345678 taksi 20 ming');
    const [tx] = await txsOf(id);
    expect(tx!.rawInput).not.toContain('8600123412345678');
    expect(tx!.rawInput).toContain('****5678');
  });
});
