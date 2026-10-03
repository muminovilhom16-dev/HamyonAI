import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { AIUnavailableError, type TranscribeInput } from '@hamyon/ai';
import { schema } from '@hamyon/db';
import { createHarness, type Harness } from './harness';

let H: Harness;
let heard: TranscribeInput[] = [];
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());
beforeEach(() => {
  H.reset();
  heard = [];
  H.clock.now = new Date('2026-10-01T10:00:00Z');
});

const usage = { provider: 'google', model: 'default', inputTokens: 0, outputTokens: 0, costUsdMicros: 1600, latencyMs: 900 };
function stt(text: string | Error, confidence = 0.92) {
  H.speech.current = {
    name: 'fake',
    async transcribe(i) {
      heard.push(i);
      if (text instanceof Error) throw text;
      return { text, confidence, languageCode: 'uz-uz', usage };
    },
  };
}

let nextUser = 70_000;
async function newUser(lang?: 'ru') {
  const id = nextUser++;
  await H.send(id, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, onboardingCompletedAt: new Date(), ...(lang && { language: lang }) }).where(eq(schema.users.telegramId, id));
  H.reset();
  return id;
}
async function rowsOf(tgId: number) {
  const [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, tgId));
  return { user: u!, txs: await H.h.db.select().from(schema.transactions).where(eq(schema.transactions.userId, u!.id)) };
}

describe('voice → STT → parser → confirmation card (TZ §57)', () => {
  it('shows what was heard on the card and saves with source=voice', async () => {
    const id = await newUser();
    stt("Bozordan go'sht oldim yuz ellik ming");
    await H.voice(id);
    expect(H.texts()[0]).toBe("🎙 «Bozordan go'sht oldim yuz ellik ming»\n\n🛒 150 000 so'm\nOziq-ovqat · Bugun\n📝 Bozordan go'sht");
    const { user, txs } = await rowsOf(id);
    expect(txs[0]).toMatchObject({ amount: 150_000, source: 'voice', rawInput: "Bozordan go'sht oldim yuz ellik ming" });
    expect(heard[0]).toMatchObject({ encoding: 'OGG_OPUS', sampleRateHertz: 48000, languages: ['uz-UZ', 'ru-RU'] });
    const log = await H.h.db.select().from(schema.aiUsageLog).where(and(eq(schema.aiUsageLog.userId, user.id), eq(schema.aiUsageLog.feature, 'stt')));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ provider: 'google', costUsdMicros: 1600, success: true });
    const ev = await H.h.db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, user.id));
    expect(ev.find((e) => e.name === 'transaction_created')!.props).toMatchObject({ source: 'voice' });
  });

  it('transcript stays on the card after an edit', async () => {
    const id = await newUser();
    stt('taksi yigirma ming');
    await H.voice(id);
    const { txs } = await rowsOf(id);
    await H.tap(id, `dt:${txs[0]!.id}`);
    await H.tap(id, `sd:${txs[0]!.id}:1`);
    expect(H.texts().at(-1)).toBe("🎙 «taksi yigirma ming»\n\n🚕 20 000 so'm\nTransport · Kecha\n📝 Taksi");
  });

  it('Russian users: ru-RU first', async () => {
    const id = await newUser('ru');
    stt('такси двадцать тысяч');
    await H.voice(id);
    expect(heard[0]!.languages).toEqual(['ru-RU', 'uz-UZ']);
    expect(H.texts()[0]).toContain('20 000 сум');
  });

  it('voice debt goes to the debt engine', async () => {
    const id = await newUser();
    stt('Murod akaga uch yuz ming qarz berdim');
    await H.voice(id);
    expect(H.texts()[0]).toBe("🎙 «Murod akaga uch yuz ming qarz berdim»\n\n🤝 Qarz berdim\n👤 Murod aka\n💵 300 000 so'm\n📅 Bugun");
    const { txs } = await rowsOf(id);
    expect(txs[0]).toMatchObject({ type: 'debt_given', source: 'voice' });
  });

  it('no amount in the voice → asks, nothing saved', async () => {
    const id = await newUser();
    stt('bugun bozorga bordim');
    await H.voice(id);
    expect(H.texts()[0]).toBe("🎙 «bugun bozorga bordim»\n\nSummani aniqlay olmadim. Qancha bo'ldi? Masalan: «50 ming».");
    expect((await rowsOf(id)).txs).toHaveLength(0);
  });

  it('card numbers heard in voice are masked', async () => {
    const id = await newUser();
    stt('karta 8600 1234 5678 9012 taksi 20 ming');
    await H.voice(id);
    const { txs } = await rowsOf(id);
    expect(txs[0]!.rawInput).toBe('karta ****9012 taksi 20 ming');
    expect(H.texts()[0]).not.toContain('8600 1234');
  });
});

describe('voice failures never invent data', () => {
  it.each([
    ['STT outage', new AIUnavailableError('timeout'), 0.9, "Ovozni hozir qayta ishlab bo'lmadi"],
    ['empty transcript', '', 0, 'Ovozni aniq tushuna olmadim'],
    ['low confidence', 'taksi 20 ming', 0.3, 'Ovozni aniq tushuna olmadim'],
  ])('%s → polite message, nothing saved', async (_n, result, conf, msg) => {
    const id = await newUser();
    stt(result as string | Error, conf as number);
    await H.voice(id);
    expect(H.texts()[0]).toContain(msg);
    expect((await rowsOf(id)).txs).toHaveLength(0);
  });

  it('too long voice is rejected before STT', async () => {
    const id = await newUser();
    stt('taksi 20 ming');
    await H.voice(id, 120);
    expect(H.texts()[0]).toContain('60 soniyadan uzun');
    expect(heard).toHaveLength(0);
  });
});

describe('free plan voice limit (TZ §34-35)', () => {
  it('after the monthly limit: polite message + limit_reached; text still works', async () => {
    const id = await newUser();
    const { user } = await rowsOf(id);
    await H.h.db.insert(schema.aiUsageLog).values(
      Array.from({ length: 30 }, () => ({ userId: user.id, feature: 'stt', provider: 'google', model: 'default', success: true, createdAt: new Date('2026-10-01T05:00:00Z') })),
    );
    stt('taksi 20 ming');
    await H.voice(id);
    expect(H.texts()[0]).toContain('limiti (30 ta) tugadi');
    expect(heard).toHaveLength(0);
    const ev = await H.h.db.select().from(schema.analyticsEvents).where(eq(schema.analyticsEvents.userId, user.id));
    expect(ev.map((e) => e.name)).toContain('limit_reached');

    H.reset();
    await H.send(id, 'taksi 20 ming');
    expect(H.texts()[0]).toBe("🚕 20 000 so'm\nTransport · Bugun\n📝 Taksi");
  });

  it('usage from previous months does not count', async () => {
    const id = await newUser();
    const { user } = await rowsOf(id);
    await H.h.db.insert(schema.aiUsageLog).values(
      Array.from({ length: 30 }, () => ({ userId: user.id, feature: 'stt', provider: 'google', model: 'default', success: true, createdAt: new Date('2026-09-15T05:00:00Z') })),
    );
    stt('taksi 20 ming');
    await H.voice(id);
    expect(heard).toHaveLength(1);
  });
});
