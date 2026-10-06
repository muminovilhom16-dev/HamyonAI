import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness({ GUIDE_VIDEO: 'true' }); });
afterAll(async () => H?.close());
beforeEach(() => H.reset());

// Messages the user sees (the "uploading video…" chat action is not one).
const methods = () => H.calls.map((c) => c.method).filter((m) => m.startsWith('send') && m !== 'sendChatAction');

describe('how-to video', () => {
  it('a new user gets the video first, then the language picker', async () => {
    await H.send(50_001, '/start');
    expect(methods()).toEqual(['sendVideo', 'sendMessage']);
    const video = H.calls.find((c) => c.method === 'sendVideo')!.payload;
    expect(video.supports_streaming).toBe(true);
    expect(video.caption).toMatch(/video qo‘llanma/);
    expect(H.lastKeyboard().flat().map((b) => b.text)).toContain("O'zbekcha");
  });

  it('returning users are not sent the video again', async () => {
    await H.send(50_002, '/start');
    await H.h.db.update(schema.users).set({ onboardingStep: null, menuVersion: 1, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, 50_002));
    H.reset();
    await H.send(50_002, '/start');
    expect(methods()).not.toContain('sendVideo');
  });

  it('a failed video never blocks onboarding', async () => {
    H.failMethods.add('sendVideo');
    expect(await H.send(50_003, '/start')).toBe(200);
    expect(H.texts().join('\n')).toMatch(/Tilni tanlang/);
  });

  it('help offers the video again', async () => {
    await H.send(50_004, '/start');
    await H.h.db.update(schema.users).set({ onboardingStep: null, menuVersion: 1, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, 50_004));
    H.reset();
    await H.send(50_004, '/yordam');
    const btn = H.lastKeyboard().flat().find((b) => b.callback_data === 'guide:play');
    expect(btn?.text).toBe('🎬 Video qo‘llanma');
    H.reset();
    await H.tap(50_004, 'guide:play');
    expect(methods()).toEqual(['sendVideo']);
  });
});
