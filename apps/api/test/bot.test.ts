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
  await H.h.db.update(schema.users).set({ onboardingStep: null, menuVersion: 1, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
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
    expect(H.texts()[0]).toBe('🚕 15 000 сум\nТранспорт · Сегодня\n📝 Такси');
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
    expect(H.texts()).toEqual(["🚕 20 000 so'm\nTransport · Bugun\n📝 Taksi"]);
    expect(H.lastKeyboard().map((r) => r.map((b) => b.text))).toEqual([['🚕 Transport', '✏️ 20 000', '📅 Bugun'], ["🗑 O'chirish"]]);
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
    expect(H.texts()[0]).toMatch(/^🛒 150 000 so'm\nOziq-ovqat/);
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
    expect(H.texts()[0]).toBe("🤝 Qarz berdim\n👤 Murod aka\n💵 300 000 so'm\n📅 Bugun");
    const rows = await txsOf(id);
    expect(rows.map((r) => [r.type, r.categoryId])).toEqual([['debt_given', null]]);
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
    expect(H.texts()[0]).toBe("💰 +6 000 000 so'm\nDaromad · Oylik · Bugun");
    expect((await txsOf(id))[0]).toMatchObject({ type: 'income', amount: 6_000_000 });
  });

  it('50$ kurtka → 50 USD, converted to UZS, Kiyim', async () => {
    const id = await newUser();
    await H.send(id, '50$ kurtka');
    expect(H.texts()[0]).toBe("👕 $50 · 640 000 so'm\nKiyim · Bugun\n📝 Kurtka");
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

describe('AI budget (TZ §35)', () => {
  const counting = () => {
    const calls = { n: 0 };
    H.ai.current = {
      name: 'counting',
      parseText: () => { calls.n++; return Promise.reject(new AIUnavailableError('timeout')); },
      categorize: () => { calls.n++; return Promise.reject(new AIUnavailableError('timeout')); },
    };
    return calls;
  };
  const spend = async (tgId: number | null, micros: number) => {
    const userId = tgId === null ? null : (await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, tgId)))[0]!.id;
    const [row] = await H.h.db
      .insert(schema.aiUsageLog)
      .values({ userId, feature: 'parse_text', provider: 'anthropic', model: 'm', costUsdMicros: micros, createdAt: H.clock.now })
      .returning();
    return row!.id;
  };

  it('a user over the monthly AI budget gets the rule parser only, nothing is lost', async () => {
    const id = await newUser();
    const calls = counting();
    await H.send(id, 'xyz 40 ming');
    expect(calls.n).toBeGreaterThan(0); // under budget: AI is consulted

    await spend(id, 200_000); // $0.20 ≈ 2 560 so'm > free plan 1 000 so'm
    calls.n = 0;
    H.reset();
    await H.send(id, 'xyz 50 ming');
    expect(calls.n).toBe(0);
    expect((await txsOf(id)).map((r) => r.amount).sort()).toEqual([40_000, 50_000]);
    expect(H.texts()[0]).toContain('Kategoriya: aniqlanmagan');
  });

  it('the global daily cap stops AI for everyone', async () => {
    const id = await newUser();
    const calls = counting();
    const rowId = await spend(null, 1_000_000); // default AI_DAILY_BUDGET_USD = 1
    try {
      await H.send(id, 'xyz 60 ming');
      expect(calls.n).toBe(0);
      expect(await txsOf(id)).toHaveLength(1);
    } finally {
      await H.h.db.delete(schema.aiUsageLog).where(eq(schema.aiUsageLog.id, rowId));
    }
  });
});

describe('budgets (/byudjet)', () => {
  it('sets a limit by command, warns on the card at 80% and 100%', async () => {
    const id = await newUser();
    await H.send(id, '/byudjet oziq-ovqat 100 ming');
    expect(H.texts().at(-1)).toContain('Oziq-ovqat');
    expect(H.texts().at(-1)).toContain('0%');
    H.reset();
    await H.send(id, 'non 70 ming');
    expect(H.texts()[0]).not.toContain('⚠️');
    H.reset();
    await H.send(id, 'sut 15 ming');
    expect(H.texts()[0]).toContain("⚠️ Oziq-ovqat: limitning 85% ishlatildi (85 000 / 100 000 so'm)");
    H.reset();
    await H.send(id, "go'sht 20 ming");
    expect(H.texts()[0]).toContain("🔴 Oziq-ovqat: oylik limit tugadi (105 000 / 100 000 so'm)");
    H.reset();
    await H.send(id, 'taksi 20 ming'); // other category: no alert
    expect(H.texts()[0]).not.toMatch(/⚠️|🔴/);
  });

  it('button flow: add total limit by reply, then delete it', async () => {
    const id = await newUser();
    await H.send(id, '/byudjet');
    expect(H.texts().at(-1)).toContain("Hali limit qo'yilmagan");
    await H.tap(id, 'bg:add');
    await H.tap(id, 'bg:c:all');
    expect(H.texts().at(-1)).toContain('Umumiy xarajat uchun oylik limitni yozing');
    H.reset();
    await H.send(id, '3 mln');
    expect(H.texts()[0]).toContain('Umumiy xarajat');
    expect(H.texts()[0]).toContain("3 000 000 so'm");
    expect(await txsOf(id)).toHaveLength(0); // the reply was a limit, not an expense
    await H.tap(id, button(/^🗑/));
    expect(H.texts().at(-1)).toContain("Hali limit qo'yilmagan");
  });
});

describe('savings goals (/maqsad)', () => {
  it('create, "maqsadga 2 mln" adds savings (not an expense), reaching the target congratulates', async () => {
    const id = await newUser();
    await H.send(id, '/maqsad');
    expect(H.texts().at(-1)).toContain("Hali maqsad yo'q");
    await H.tap(id, 'gl:new');
    await H.send(id, 'telefon 5 mln');
    expect(H.texts().at(-1)).toContain('telefon');
    expect(H.texts().at(-1)).toContain("0 / 5 000 000 so'm");
    H.reset();
    await H.send(id, 'maqsadga 2 mln');
    expect(H.texts()[0]).toContain("💰 telefon: +2 000 000 so'm qo'yildi");
    expect(H.texts()[0]).toContain('40%');
    expect(await txsOf(id)).toHaveLength(0); // savings are not expenses
    H.reset();
    await H.send(id, 'maqsadga 3 mln');
    expect(H.texts()[0]).toContain('🎉');
    H.reset();
    await H.send(id, '/bugun');
    expect(H.texts()[0]).toContain("hali yozuv yo'q");
  });

  it('several goals → picker; withdrawal with minus; cannot take more than saved', async () => {
    const id = await newUser();
    for (const g of ['mashina 100 mln', "ta'til 10 mln"]) {
      await H.send(id, '/maqsad');
      await H.tap(id, 'gl:new');
      await H.send(id, g);
    }
    H.reset();
    await H.send(id, 'maqsadga 500 ming');
    expect(H.texts()[0]).toContain('Qaysi maqsadga?');
    await H.tap(id, button(/ta'til/));
    expect(H.texts().at(-1)).toContain("ta'til: +500 000 so'm");
    await H.send(id, '/maqsad');
    await H.tap(id, button(/💰 ta'til/));
    await H.send(id, '-200 ming');
    expect(H.texts().at(-1)).toContain("ta'til: 200 000 so'm olindi");
    await H.tap(id, button(/💰 ta'til/));
    await H.send(id, '-900 ming');
    expect(H.texts().at(-1)).toContain("buncha pul yo'q");
  });
});

describe('accounts (/hisoblar)', () => {
  it('cards and cash with balances; "kartadan"/"naqd" route records; switcher on the card', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 10 ming'); // before any account: no account UI
    expect(buttons().some((b) => b.callback_data?.startsWith('acc:'))).toBe(false);

    await H.send(id, '/hisoblar');
    expect(H.texts().at(-1)).toContain("Hali hisob yo'q");
    await H.tap(id, 'ac:add');
    await H.send(id, 'Humo 2 mln');
    await H.tap(id, 'ac:add');
    await H.send(id, 'naqd 300 ming');
    expect(H.texts().at(-1)).toContain("💳 Humo (asosiy) — 2 000 000 so'm");
    expect(H.texts().at(-1)).toContain("💵 Naqd — 300 000 so'm");

    H.reset();
    await H.send(id, 'taksi 20 ming kartadan');
    expect(H.texts()[0]).toBe("🚕 20 000 so'm\nTransport · Bugun · 💳 Humo\n📝 Taksi");
    await H.send(id, 'non 5 ming naqd');
    expect(H.texts().at(-1)).toContain('💵 Naqd');
    await H.send(id, 'sut 12 ming'); // no hint → default account
    expect(H.texts().at(-1)).toContain('💳 Humo');

    // Switch the last record to the next account from the card.
    await H.tap(id, button(/^💳 Humo/));
    expect(H.texts().at(-1)).toContain('💵 Naqd');

    H.reset();
    await H.send(id, '/hisoblar');
    expect(H.texts()[0]).toContain("Humo (asosiy) — 1 980 000 so'm");
    expect(H.texts()[0]).toContain("Naqd — 283 000 so'm");
  });

  it('Cyrillic goal shortcut works', async () => {
    const id = await newUser();
    await H.send(id, '/maqsad');
    await H.tap(id, 'gl:new');
    await H.send(id, 'телефон 1 млн');
    H.reset();
    await H.send(id, 'мақсадга 100 минг');
    expect(H.texts()[0]).toContain("+100 000 so'm");
  });
});

describe('reply-keyboard menu', () => {
  const lastReplyKeyboard = () =>
    [...H.calls].reverse().find((c) => c.payload.reply_markup?.keyboard)?.payload.reply_markup as { keyboard: Array<Array<{ text: string }>>; is_persistent: boolean } | undefined;

  it('buttons run their commands and never become expenses (all languages)', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    H.reset();
    await H.send(id, '📊 Bugun');
    expect(H.texts()[0]).toContain('Bugungi hisobot');
    await H.send(id, '🤝 Qarzlar');
    expect(H.texts().at(-1)).toContain('Qarzlar');
    await H.send(id, '🎯 Limitlar');
    expect(H.texts().at(-1)).toContain('Byudjet');
    await H.send(id, '🗓 Ой'); // Cyrillic label
    expect(H.texts().at(-1)).toContain('Oylik hisobot');
    await H.send(id, '📅 Неделя'); // Russian label
    expect(H.texts().at(-1)).toContain('Haftalik hisobot');
    expect(await txsOf(id)).toHaveLength(1);
  });

  it('onboarding ends with the keyboard; /start and help show it again', async () => {
    const id = 990_001;
    await H.send(id, '/start');
    await H.tap(id, 'ob:l:uz_latn');
    await H.tap(id, 'ob:c:UZS');
    await H.send(id, 'taksi 15 ming');
    await H.tap(id, 'ob:r:2100');
    const kb = lastReplyKeyboard()!;
    expect(kb.is_persistent).toBe(true);
    expect(kb.keyboard.flat().map((b) => b.text)).toEqual([
      '📊 Bugun', '📅 Hafta', '🗓 Oy', '🧾 Oxirgi yozuvlar', '🤝 Qarzlar', '🎯 Limitlar', "🔁 To'lovlar", '🏦 Maqsadlar',
      '💳 Hisoblar', '🌐 Web panel', '⚙️ Sozlamalar', '❓ Yordam',
    ]);
    H.reset();
    await H.send(id, '/start');
    expect(lastReplyKeyboard()).toBeTruthy();
    H.reset();
    await H.send(id, '❓ Yordam');
    expect(H.texts()[0]).toContain('Qanday yozish kerak');
    expect(lastReplyKeyboard()).toBeTruthy();
  });

  it('existing users get the menu once, after their next message', async () => {
    const id = await newUser();
    await H.h.db.update(schema.users).set({ menuVersion: 0 }).where(eq(schema.users.telegramId, id));
    H.reset();
    await H.send(id, 'taksi 20 ming');
    expect(H.texts()).toHaveLength(2);
    expect(H.texts()[1]).toContain('Menyu pastda');
    H.reset();
    await H.send(id, 'non 5 ming');
    expect(H.texts()).toHaveLength(1);
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
    expect(H.texts().at(-1)).toBe("🚕 25 000 so'm\nTransport · Kecha\n📝 Taksi");
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
    expect(report).toBe(
      "📊 Bugungi hisobot\n\n💸 Xarajat: 37 000 so'm\n💰 Daromad: 6 000 000 so'm\n🚕 Transport  ▰▰▰▱▱ 54% · 20 000 so'm\n🛒 Oziq-ovqat  ▰▰▱▱▱ 46% · 17 000 so'm",
    );
    // TZ §33: at most 5 lines besides the blank separator.
    expect(report.split('\n').filter(Boolean).length).toBeLessThanOrEqual(5);

    H.reset();
    await H.send(id, '/oxirgi');
    expect(H.texts()[0]).toContain('+6 000 000 so\'m');
    expect(buttons().filter((b) => b.text.startsWith('✏️'))).toHaveLength(5);
    expect(buttons().filter((b) => b.text.startsWith('🗑'))).toHaveLength(5);
    expect(H.texts()[0]).toContain('Qarz · Murod aka');
  });

  it('/ochir deletes the last record with undo; with nothing left it says so', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    await H.send(id, 'non 5 ming');
    H.reset();
    await H.send(id, '/ochir');
    expect(H.texts()[0]).toContain("O'chirildi");
    expect(H.texts()[0]).toContain('5 000');
    expect((await txsOf(id)).map((r) => r.amount)).toEqual([20_000]);
    await H.tap(id, button(/Qaytarish/));
    expect(await txsOf(id)).toHaveLength(2);

    const empty = await newUser();
    await H.send(empty, '/ochir');
    expect(H.texts().at(-1)).toContain("hali yozuv yo'q");
  });

  it('/oy adds a pace line and stays within 5 lines', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming'); // clock: 1 Oct → no forecast yet
    H.reset();
    await H.send(id, '/oy');
    const report = H.texts()[0]!;
    expect(report).toContain("📅 Kuniga ~20 000");
    expect(report).not.toContain('oy oxiriga');
    expect(report.split('\n').filter(Boolean).length).toBeLessThanOrEqual(5);
  });

  it('/hafta with no records says so', async () => {
    const id = await newUser();
    await H.send(id, '/hafta');
    expect(H.texts()[0]).toContain("hali yozuv yo'q");
  });
});

describe('security', () => {
  it('messages are HTML and user text inside them is escaped', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    // Notes can be edited freely in the web panel.
    await H.h.db.update(schema.transactions).set({ note: '<b>x</b> & <a href="t.me">y</a>' }).where(eq(schema.transactions.userId, (await txsOf(id))[0]!.userId));
    H.reset();
    await H.send(id, '/oxirgi');
    const list = H.calls.find((c) => c.method === 'sendMessage')!;
    expect(list.payload.parse_mode).toBe('HTML');
    expect(list.payload.text).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &lt;a href="t.me"&gt;y&lt;/a&gt;');
    expect(H.texts()[0]).toContain('<b>x</b> & <a href="t.me">y</a>');
  });

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
