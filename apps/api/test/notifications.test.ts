import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { runProactiveTick } from '../src/notifications';
import { htmlToPlain } from '../src/bot/html';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());
beforeEach(() => H.reset());

let next = 120_000;
async function newUser(createdAt = '2026-09-20T05:00:00Z') {
  const id = next++;
  H.clock.now = new Date(createdAt);
  await H.send(id, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, onboardingCompletedAt: new Date(createdAt) }).where(eq(schema.users.telegramId, id));
  return id;
}
/** Sends a bot message as if at `iso`. */
async function sayAt(id: number, iso: string, text: string) {
  H.clock.now = new Date(iso);
  await H.send(id, text);
}
const tick = (iso: string) =>
  runProactiveTick({ db: H.h.db, api: H.app.bot.api, log: H.app.log, maxPerDay: 2, weeklyReportTime: '20:00', monthlyReportTime: '10:00', now: () => new Date(iso), sendGapMs: 0 });
const proactiveTo = (id: number) =>
  H.calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id === id).map((c) => ({ text: c.payload.text as string, kb: c.payload.reply_markup }));

describe('daily reminder', () => {
  it('21:00 if nothing today, with "Bugun xarajat yo\'q"; answering counts as activity', async () => {
    const id = await newUser();
    await sayAt(id, '2026-10-04T06:00:00Z', 'taksi 20 ming');
    H.reset();
    await tick('2026-10-05T16:00:00Z');
    const [msg] = proactiveTo(id);
    expect(msg!.text).toBe("Bugun hali yozuv yo'q. Xarajat bo'lgan bo'lsa, bitta xabar bilan yozing: «taksi 25 ming».");
    const button = msg!.kb.inline_keyboard[0][0];
    expect(button.text).toBe("Bugun xarajat yo'q");

    H.clock.now = new Date('2026-10-05T16:01:00Z');
    await H.tap(id, button.callback_data);
    expect(H.texts().at(-1)).toBe('✅ Belgilandi. Ertaga ko‘rishamiz!');
    H.reset();
    await tick('2026-10-05T16:05:00Z');
    expect(proactiveTo(id)).toHaveLength(0);
  });

  it('not sent if something was recorded today, and only once', async () => {
    const a = await newUser();
    const b = await newUser();
    await sayAt(a, '2026-10-04T06:00:00Z', 'taksi 20 ming');
    await sayAt(b, '2026-10-04T06:00:00Z', 'taksi 20 ming');
    await sayAt(b, '2026-10-05T06:00:00Z', 'non 5 ming');
    H.reset();
    await tick('2026-10-05T16:00:00Z');
    await tick('2026-10-05T16:03:00Z');
    expect(proactiveTo(a)).toHaveLength(1);
    expect(proactiveTo(b)).toHaveLength(0);
  });
});

describe('reports (TZ §33)', () => {
  it('weekly report on Sunday 20:00: short, with comparison', async () => {
    const id = await newUser();
    await sayAt(id, '2026-09-22T06:00:00Z', 'Korzinka 100 ming'); // previous week
    await sayAt(id, '2026-09-29T06:00:00Z', 'Korzinka 118 ming');
    await sayAt(id, '2026-10-01T06:00:00Z', 'taksi 45 ming');
    await sayAt(id, '2026-10-02T06:00:00Z', 'oylik tushdi 6 mln');
    H.reset();
    await tick('2026-10-04T15:00:00Z'); // Sunday 20:00 Tashkent
    const [r] = proactiveTo(id);
    expect(r!.text).toBe(
      "<b>📊 Haftalik hisobot</b> · 28-sentabr — 4-oktabr\n\n💸 Xarajat: <b>163 000 so'm</b>\n💰 Daromad: <b>6 000 000 so'm</b>\n🛒 Oziq-ovqat  ▰▰▰▰▱ 72% · 118 000 so'm\n\n💡 Oziq-ovqat xarajati o'tgan haftaga nisbatan 18% yuqori.",
    );
    expect(r!.text.split('\n').filter(Boolean).length).toBeLessThanOrEqual(5);
  });

  it('empty week → no report (no spam)', async () => {
    const id = await newUser();
    H.reset();
    await tick('2026-10-04T15:00:00Z');
    expect(proactiveTo(id).filter((m) => m.text.includes('hisobot'))).toHaveLength(0);
  });

  it('monthly report on the 1st for the month that ended', async () => {
    const id = await newUser('2026-08-20T05:00:00Z');
    await sayAt(id, '2026-08-10T06:00:00Z', 'kafe 100 ming');
    await sayAt(id, '2026-09-10T06:00:00Z', 'kafe 50 ming');
    await sayAt(id, '2026-09-30T06:00:00Z', 'taksi 20 ming');
    H.reset();
    await tick('2026-10-01T05:00:00Z'); // 10:00 Tashkent
    expect(htmlToPlain(proactiveTo(id)[0]!.text)).toBe(
      "📊 Oylik hisobot · 1-sentabr — 30-sentabr\n\n💸 Xarajat: 70 000 so'm\n🍽 Kafe va restoran  ▰▰▰▰▱ 71% · 50 000 so'm\n🚕 Transport  ▰▱▱▱▱ 29% · 20 000 so'm\n\n💡 Kafe va restoran xarajati o'tgan oyga nisbatan 50% past.",
    );
  });
});

describe('reactivation and the 2-per-day cap', () => {
  it('3 and 7 quiet days → one gentle message each, then nothing', async () => {
    const id = await newUser();
    await sayAt(id, '2026-10-01T06:00:00Z', 'taksi 20 ming');
    H.reset();
    for (const day of ['02', '03', '04', '05', '06', '07', '08', '09', '10', '14']) await tick(`2026-10-${day}T16:00:00Z`);
    const texts = proactiveTo(id).map((m) => m.text);
    expect(texts.filter((t) => t.startsWith('Salom!'))).toHaveLength(1);
    expect(texts.filter((t) => t.startsWith('Hamyon AI shu yerda'))).toHaveLength(1);
    // daily reminders only while recently active (Oct 2 and 3), then silence
    expect(texts.filter((t) => t.startsWith('Bugun hali'))).toHaveLength(2);
    expect(texts).toHaveLength(4);
    expect(texts.join(' ')).not.toMatch(/streak|uzildi|afsus/i);
  });

  it('never more than 2 proactive messages per day', async () => {
    const id = await newUser();
    await sayAt(id, '2026-09-29T06:00:00Z', 'taksi 20 ming');
    await sayAt(id, '2026-10-03T06:00:00Z', 'Murod akaga 300 ming qarz berdim');
    const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, id));
    await H.h.db.update(schema.debts).set({ dueDate: '2026-10-04' }).where(eq(schema.debts.createdByUserId, u!.id));
    H.reset();
    await tick('2026-10-04T05:30:00Z'); // 10:30 → debt due today
    await tick('2026-10-04T15:00:00Z'); // 20:00 → weekly report
    await tick('2026-10-04T16:00:00Z'); // 21:00 → daily reminder (cap reached)
    const texts = proactiveTo(id).map((m) => m.text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('⏰');
    expect(texts[1]).toContain('Haftalik hisobot');
  });
});

describe('recurring payments (/obunalar)', () => {
  const lastKb = () => H.lastKeyboard().flat();
  it('set up in the bot, announced on the day at 10:00, recorded in one tap, idempotent', async () => {
    const id = await newUser();
    await sayAt(id, '2026-10-01T06:00:00Z', '/obunalar');
    expect(htmlToPlain(H.texts().at(-1)!)).toContain("Hali yo'q");
    await H.tap(id, 'rc:add');
    await sayAt(id, '2026-10-01T06:01:00Z', 'internet 99 ming');
    const day5 = lastKb().find((b) => b.text === '5')!;
    await H.tap(id, day5.callback_data!);
    const list = htmlToPlain(H.texts().at(-1)!);
    expect(list).toContain("Internet — 99 000 so'm");
    expect(list).toContain('har oy 5-sana · keyingisi: 5-oktabr');
    expect(await H.h.db.select().from(schema.transactions).where(eq(schema.transactions.note, 'Internet'))).toHaveLength(0);

    H.reset();
    await tick('2026-10-04T05:00:00Z'); // day before: nothing
    await tick('2026-10-05T04:59:00Z'); // 09:59 Tashkent: not yet
    expect(proactiveTo(id).filter((m) => m.text.includes('Internet'))).toHaveLength(0);
    await tick('2026-10-05T05:00:00Z'); // 10:00
    await tick('2026-10-05T05:05:00Z'); // deduped
    const due = proactiveTo(id).filter((m) => m.text.includes('Internet'));
    expect(due).toHaveLength(1);
    expect(htmlToPlain(due[0]!.text)).toBe("🔁 Bugun to'lov kuni: Internet — 99 000 so'm");
    const [pay, skip] = due[0]!.kb.inline_keyboard[0];
    expect(skip.text).toBe('⏭ Bu oy emas');

    H.clock.now = new Date('2026-10-05T06:00:00Z');
    await H.tap(id, pay.callback_data);
    expect(H.texts().at(-1)).toContain("99 000 so'm");
    await H.tap(id, pay.callback_data); // double tap
    await H.tap(id, skip.callback_data);
    const rows = await H.h.db.select().from(schema.transactions).where(eq(schema.transactions.note, 'Internet'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'expense', amount: 99_000 });

    // Next month it is due again; "skip" records nothing.
    H.reset();
    await tick('2026-11-05T05:00:00Z');
    const nov = proactiveTo(id).filter((m) => m.text.includes('Internet'));
    expect(nov).toHaveLength(1);
    H.clock.now = new Date('2026-11-05T06:00:00Z');
    await H.tap(id, nov[0]!.kb.inline_keyboard[0][1].callback_data);
    expect(H.texts().at(-1)).toContain("o'tkazib yuborildi");
    expect(await H.h.db.select().from(schema.transactions).where(eq(schema.transactions.note, 'Internet'))).toHaveLength(1);
  });

  it("another user's recurring buttons do nothing", async () => {
    const owner = await newUser();
    const attacker = await newUser();
    await sayAt(owner, '2026-10-01T06:00:00Z', '/obunalar');
    await H.tap(owner, 'rc:add');
    await sayAt(owner, '2026-10-01T06:01:00Z', 'svet 120 ming');
    await H.tap(owner, lastKb().find((b) => b.text === '7')!.callback_data!);
    const del = lastKb().find((b) => b.text.startsWith('🗑'))!.callback_data!;
    const id = del.split(':')[2];
    await H.tap(attacker, `rc:pay:${id}:2026-10`);
    await H.tap(attacker, del);
    expect(await H.h.db.select().from(schema.recurringPayments).where(eq(schema.recurringPayments.id, id!))).toHaveLength(1);
    expect(await H.h.db.select().from(schema.transactions).where(eq(schema.transactions.note, 'Svet'))).toHaveLength(0);
  });
});

describe('debtor reminders by Telegram @username', () => {
  const debtOf = async (lenderTg: number) => {
    const [lender] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, lenderTg));
    const [d] = await H.h.db.select().from(schema.debts).where(eq(schema.debts.createdByUserId, lender!.id));
    return d!;
  };

  it('on the due day at 10:00 the debtor (a bot user) is reminded once; the lender is told', async () => {
    const lender = await newUser();
    const debtor = await newUser();
    await sayAt(lender, '2026-10-01T06:00:00Z', 'Murod akaga 300 ming qarz berdim');
    const debt = await debtOf(lender);
    await H.h.db.update(schema.debts).set({ dueDate: '2026-10-08', counterpartyUsername: `user${debtor}` }).where(eq(schema.debts.id, debt.id));

    H.reset();
    await tick('2026-10-08T04:59:00Z'); // 09:59 Tashkent
    expect(proactiveTo(debtor)).toHaveLength(0);
    await tick('2026-10-08T05:00:00Z');
    await tick('2026-10-08T05:10:00Z'); // deduped
    const toDebtor = proactiveTo(debtor);
    expect(toDebtor).toHaveLength(1);
    expect(htmlToPlain(toDebtor[0]!.text)).toBe("⏰ Eslatma: bugun Aliga 300 000 so'm qarzni qaytarish muddati.");
    expect(toDebtor[0]!.kb.inline_keyboard[0][0].callback_data).toBe('dro:off');
    const toLender = proactiveTo(lender).map((m) => htmlToPlain(m.text));
    expect(toLender).toHaveLength(1);
    expect(toLender[0]).toContain('Bugun Murod aka');
    expect(toLender[0]).toContain(`📨 @user${debtor} ga ham eslatma yuborildi.`);
  });

  it('no bot account under that username → only the lender is reminded', async () => {
    const lender = await newUser();
    await sayAt(lender, '2026-10-01T06:00:00Z', 'Sardorga 50 ming qarz berdim');
    const debt = await debtOf(lender);
    await H.h.db.update(schema.debts).set({ dueDate: '2026-10-09', counterpartyUsername: 'nobody_here_42' }).where(eq(schema.debts.id, debt.id));
    H.reset();
    await tick('2026-10-09T05:00:00Z');
    const toLender = proactiveTo(lender).map((m) => htmlToPlain(m.text));
    expect(toLender).toHaveLength(1);
    expect(toLender[0]).not.toContain('📨');
    expect(H.calls.filter((c) => c.method === 'sendMessage' && c.payload.chat_id !== lender)).toHaveLength(0);
  });

  it('the debtor can opt out; "taken" debts never message the other side', async () => {
    const lender = await newUser();
    const debtor = await newUser();
    await sayAt(lender, '2026-10-01T06:00:00Z', 'Aziz akaga 70 ming qarz berdim');
    await sayAt(lender, '2026-10-01T06:01:00Z', 'Aziz akadan 20 ming qarz oldim');
    const [l] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, lender));
    await H.h.db.update(schema.debts).set({ dueDate: '2026-10-10', counterpartyUsername: `user${debtor}` }).where(eq(schema.debts.createdByUserId, l!.id));
    H.clock.now = new Date('2026-10-01T07:00:00Z');
    await H.tap(debtor, 'dro:off');
    expect(H.texts().at(-1)).toContain('endi kelmaydi');
    H.reset();
    await tick('2026-10-10T05:00:00Z');
    expect(proactiveTo(debtor)).toHaveLength(0);
  });
});
