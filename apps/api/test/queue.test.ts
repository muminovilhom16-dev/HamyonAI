import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { schema } from '@hamyon/db';
import { startWorkers, type WorkerHandle } from '../src/queue';
import { createHarness, type Harness } from './harness';

const REDIS = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379';
const PREFIX = `test${Date.now()}`;
let H: Harness;
let workers: WorkerHandle;
let ticks = 0;

beforeAll(async () => {
  H = await createHarness({ REDIS_URL: REDIS, QUEUE_PREFIX: PREFIX });
  workers = await startWorkers({ queues: H.app.queues!, bot: H.app.bot, log: H.app.log, tick: async () => { ticks++; }, tickEveryMs: 300 });
});
afterAll(async () => {
  await workers?.close();
  await H?.close();
  const r = new IORedis(REDIS);
  const keys = await r.keys(`${PREFIX}:*`);
  if (keys.length) await r.del(...keys);
  await r.quit();
});

async function until(fn: () => boolean | Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout');
}

describe('queue (TZ §43)', () => {
  it('voice: immediate "Qabul qilindi", then the worker transcribes and saves', async () => {
    const id = 990_001;
    await H.send(id, '/start');
    await H.h.db.update(schema.users).set({ onboardingStep: null, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
    H.reset();
    let calls = 0;
    H.speech.current = {
      name: 'fake',
      async transcribe() {
        calls++;
        await new Promise((r) => setTimeout(r, 300)); // slow STT
        return { text: 'taksi 20 ming', confidence: 0.9, languageCode: 'uz-uz', usage: { provider: 'f', model: 'f', inputTokens: 0, outputTokens: 0, costUsdMicros: 0, latencyMs: 300 } };
      },
    };
    const started = Date.now();
    expect(await H.voice(id)).toBe(200);
    expect(Date.now() - started).toBeLessThan(250); // webhook did not wait for STT
    expect(H.texts()).toEqual(['🎙 Qabul qilindi, eshityapman…']);

    await until(() => H.texts().length >= 2);
    expect(H.texts()[1]).toBe("🎙 «taksi 20 ming»\n\n20 000 so'm\nTransport\nTaksi\nBugun");
    expect(calls).toBe(1);
  });

  it('the same update enqueued twice is processed once', async () => {
    const update = { update_id: 777_777, message: { message_id: 1, date: 0, chat: { id: 990_002, type: 'private' }, from: { id: 990_002, is_bot: false, first_name: 'A' }, text: 'x' } };
    await H.app.queues!.enqueueUpdate(update as never);
    await H.app.queues!.enqueueUpdate(update as never);
    const r = new IORedis(REDIS);
    const jobs = await r.keys(`${PREFIX}:telegram-updates:upd-777777`);
    await r.quit();
    expect(jobs.length).toBeLessThanOrEqual(1);
  });

  it('scheduler ticks run through BullMQ', async () => {
    await until(() => ticks >= 2, 5000);
  });
});
