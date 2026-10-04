import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());

describe('TZ §46 latency (rule path, local DB, no AI)', () => {
  it('text messages: p95 well under 3 s', async () => {
    const id = 300_000;
    await H.send(id, '/start');
    await H.h.db.update(schema.users).set({ onboardingStep: null, menuVersion: 1, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
    const msgs = ['taksi 25 ming', 'non 5 ming, sut 12 ming', "bozordan go'sht oldim yuz ellik ming", 'oylik tushdi 6 mln', 'kofe 28k'];
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      await H.send(id, msgs[i % msgs.length]!);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.log(`text p50=${times[100]!.toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
    expect(p95).toBeLessThan(500);
  }, 60_000);
});
