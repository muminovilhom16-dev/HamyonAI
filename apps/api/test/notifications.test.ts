import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { runProactiveTick } from '../src/notifications';
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
      "📊 Haftalik hisobot · 28-sentabr — 4-oktabr\n\nXarajat: 163 000 so'm\nDaromad: 6 000 000 so'm\nEng katta kategoriya: Oziq-ovqat — 118 000 so'm\n\n💡 Oziq-ovqat xarajati o'tgan haftaga nisbatan 18% yuqori.",
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
    expect(proactiveTo(id)[0]!.text).toBe(
      "📊 Oylik hisobot · 1-sentabr — 30-sentabr\n\nXarajat: 70 000 so'm\nEng katta kategoriya: Kafe va restoran — 50 000 so'm\n\n💡 Kafe va restoran xarajati o'tgan oyga nisbatan 50% past.",
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
