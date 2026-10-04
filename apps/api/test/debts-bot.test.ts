import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { sendDebtReminders } from '../src/reminders';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());
beforeEach(() => {
  H.reset();
  H.clock.now = new Date('2026-10-01T10:00:00Z');
});

let nextUser = 50_000;
async function newUser(): Promise<number> {
  const id = nextUser++;
  await H.send(id, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, menuVersion: 1, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
  H.reset();
  return id;
}
async function userOf(tgId: number) {
  const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, tgId));
  return u!;
}
async function debtsOf(tgId: number) {
  const u = await userOf(tgId);
  return H.h.db.select().from(schema.debts).where(and(eq(schema.debts.createdByUserId, u.id), isNull(schema.debts.deletedAt)));
}
const buttons = () => H.lastKeyboard().flat();
const button = (label: string | RegExp) => {
  const b = buttons().find((x) => (typeof label === 'string' ? x.text === label : label.test(x.text)));
  if (!b) throw new Error(`no button ${label}; have ${buttons().map((x) => x.text).join(', ')}`);
  return b.callback_data!;
};

describe('TZ §61: debt given, partial return → remaining 200 000', () => {
  it('works through the bot, and /qarzlar shows the remaining balance', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    await H.send(id, 'Murod aka 100 ming qaytardi');
    expect(H.texts()[1]).toBe("↩️ Qarz qaytarildi\n👤 Murod aka\n💵 100 000 so'm\n⏳ Qoldiq: 200 000 so'm\n📅 Bugun");
    const [d] = await debtsOf(id);
    expect(d).toMatchObject({ total: 300_000, remaining: 200_000, status: 'open', direction: 'given' });

    H.reset();
    await H.send(id, '/qarzlar');
    expect(H.texts()[0]).toBe("🤝 Qarzlar\n\n🟢 Sizga qarzdor: 200 000 so'm\n👤 Murod aka — 200 000 so'm");

    H.reset();
    await H.send(id, '/bugun');
    expect(H.texts()[0]).toContain("hali yozuv yo'q"); // debts are not expenses/income
  });

  it('full repayment closes the debt', async () => {
    const id = await newUser();
    await H.send(id, 'Alisherga 50 ming qarz berdim');
    await H.send(id, 'Alisher 50 ming qaytardi');
    expect(H.texts()[1]).toContain("✅ Qarz to'liq yopildi");
    H.reset();
    await H.send(id, '/qarzlar');
    expect(H.texts()[0]).toContain("Ochiq qarzlar yo'q");
  });

  it('borrowing and paying back ("qaytardim")', async () => {
    const id = await newUser();
    await H.send(id, 'Sardordan 1 mln qarz oldim');
    expect(H.texts()[0]).toBe("🤝 Qarz oldim\n👤 Sardor\n💵 1 000 000 so'm\n📅 Bugun");
    await H.send(id, 'Sardorga 400 ming qarzni qaytardim');
    const [d] = await debtsOf(id);
    expect(d).toMatchObject({ direction: 'taken', remaining: 600_000 });
    H.reset();
    await H.send(id, '/qarzlar');
    expect(H.texts()[0]).toContain("🔴 Siz qarzdorsiz: 600 000 so'm\n👤 Sardor — 600 000 so'm");
  });
});

describe('clarifications', () => {
  it('missing name → asks, the reply becomes the counterparty', async () => {
    const id = await newUser();
    await H.send(id, 'qarz berdim 50 ming');
    expect(H.texts()[0]).toContain('Kim bilan?');
    expect(await debtsOf(id)).toHaveLength(0);
    await H.send(id, 'Ali');
    const [d] = await debtsOf(id);
    expect(d).toMatchObject({ counterparty: 'Ali', total: 50_000, direction: 'given' });
  });

  it('unclear direction → asks "berdingizmi yoki oldingizmi?"', async () => {
    const id = await newUser();
    await H.send(id, 'Vali bilan qarz 100 ming');
    expect(H.texts()[0]).toContain('Qarz berdingizmi yoki oldingizmi?');
    await H.tap(id, button('Qarz oldim'));
    const [d] = await debtsOf(id);
    expect(d).toMatchObject({ direction: 'taken', total: 100_000 });
  });

  it('payment to a person → "Qarz berdim" records a debt', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 ming');
    await H.tap(id, button('Qarz berdim'));
    const [d] = await debtsOf(id);
    expect(d).toMatchObject({ counterparty: 'Murod aka', total: 300_000 });
  });

  it('guessed amount on a debt is confirmed first', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 qarz berdim');
    expect(H.texts()[0]).toContain("Summa to'g'rimi?");
    expect(await debtsOf(id)).toHaveLength(0);
    await H.tap(id, button(/^✅/));
    expect((await debtsOf(id))[0]!.total).toBe(300_000);
  });

  it('return with no matching debt / overpayment is not saved', async () => {
    const id = await newUser();
    await H.send(id, 'Nodir 50 ming qaytardi');
    expect(H.texts()[0]).toBe('Nodir bilan ochiq qarz topilmadi.');
    await H.send(id, 'Olimga 100 ming qarz berdim');
    await H.send(id, 'Olim 150 ming qaytardi');
    expect(H.texts().at(-1)).toBe("Qoldiq 100 000 so'm, siz 150 000 so'm yozdingiz. Tekshirib qayta yuboring.");
    expect((await debtsOf(id))[0]!.remaining).toBe(100_000);
  });

  it('person with both directions → asks who returned', async () => {
    const id = await newUser();
    await H.send(id, 'Bekga 100 ming qarz berdim');
    await H.send(id, 'Bekdan 50 ming qarz oldim');
    await H.send(id, 'Bek 20 ming qarz qaytarildi');
    expect(H.texts().at(-1)).toContain('Kim qaytardi?');
    await H.tap(id, button('Menga qaytarildi'));
    const given = (await debtsOf(id)).find((d) => d.direction === 'given')!;
    expect(given.remaining).toBe(80_000);
  });
});

describe('debt card actions', () => {
  it('due date can be set from the card', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    await H.tap(id, button('📅 Muddat'));
    await H.tap(id, button('1 hafta'));
    expect(H.texts().at(-1)).toBe("🤝 Qarz berdim\n👤 Murod aka\n💵 300 000 so'm\n📅 Bugun\n⏰ Muddat: 8-oktabr");
    expect((await debtsOf(id))[0]!.dueDate).toBe('2026-10-08');
  });

  it('delete and undo a debt; a debt with repayments cannot be deleted', async () => {
    const id = await newUser();
    await H.send(id, 'Karimga 100 ming qarz berdim');
    const del = button("🗑 O'chirish");
    await H.tap(id, del);
    expect(await debtsOf(id)).toHaveLength(0);
    await H.tap(id, button('↩️ Qaytarish'));
    expect(await debtsOf(id)).toHaveLength(1);

    await H.send(id, 'Karim 10 ming qaytardi');
    await H.tap(id, del);
    const alert = H.calls.filter((c) => c.method === 'answerCallbackQuery').at(-1)!;
    expect(alert.payload.text).toContain("to'lovlar bor");
    expect(await debtsOf(id)).toHaveLength(1);
  });

  it('deleting a repayment restores the remaining amount', async () => {
    const id = await newUser();
    await H.send(id, 'Olimga 300 ming qarz berdim');
    await H.send(id, 'Olim 100 ming qaytardi');
    await H.tap(id, button("🗑 O'chirish"));
    expect((await debtsOf(id))[0]!.remaining).toBe(300_000);
  });

  it("another user cannot change someone's debt", async () => {
    const owner = await newUser();
    const attacker = await newUser();
    await H.send(owner, 'Murod akaga 300 ming qarz berdim');
    const [d] = await debtsOf(owner);
    H.reset();
    await H.tap(attacker, `dds:${d!.id}:7`);
    await H.tap(attacker, `dd:${d!.id}`);
    expect((await debtsOf(owner))[0]!.dueDate).toBeNull();
    expect(H.calls.some((c) => c.method === 'editMessageText' || c.method === 'editMessageReplyMarkup')).toBe(false);
  });
});

describe('debt reminders (TZ §32)', () => {
  it('2 days before and on the due date, once each, max 2 proactive per day', async () => {
    const id = await newUser();
    await H.send(id, 'Murod akaga 300 ming qarz berdim');
    await H.tap(id, button('📅 Muddat'));
    await H.tap(id, button('1 hafta')); // due 2026-10-08
    H.reset();
    const run = (iso: string) =>
      sendDebtReminders({ db: H.h.db, api: H.app.bot.api, log: H.app.log, maxPerDay: 2, now: () => new Date(iso), sendGapMs: 0 });
    const sentTexts = () => H.calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === id).map((c) => c.payload.text);

    await run('2026-10-05T06:00:00Z');
    expect(sentTexts()).toEqual([]);
    await run('2026-10-06T06:00:00Z');
    expect(sentTexts()).toEqual(["⏰ Eslatma: Murod aka <b>300 000 so'm</b> qarzni 8-oktabr gacha qaytarishi kerak."]);
    await run('2026-10-06T08:00:00Z'); // same day again → deduplicated
    expect(sentTexts()).toHaveLength(1);
    await run('2026-10-08T06:00:00Z');
    expect(sentTexts().at(-1)).toBe("⏰ Bugun Murod aka <b>300 000 so'm</b> qarzni qaytarish muddati.");
    expect(sentTexts()).toHaveLength(2);
  });

  it('blocked bot → delivery marked failed, not counted', async () => {
    const id = await newUser();
    await H.send(id, 'Lolaga 10 ming qarz berdim');
    await H.tap(id, button('📅 Muddat'));
    await H.tap(id, button('1 hafta'));
    H.reset();
    H.failChatIds.add(id);
    const r = await sendDebtReminders({ db: H.h.db, api: H.app.bot.api, log: H.app.log, maxPerDay: 2, now: () => new Date('2026-10-06T06:00:00Z'), sendGapMs: 0 });
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const u = await userOf(id);
    const rows = await H.h.db.select().from(schema.reminders).where(eq(schema.reminders.userId, u.id));
    expect(rows.map((x) => x.status)).toEqual(['failed']);
  });
});
