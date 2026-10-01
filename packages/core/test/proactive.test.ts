import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, resetTestDatabase, schema, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { claimProactive } from '../src/finance/reminders';
import { dailyReminderCandidates, markNoSpendingToday, reactivationCandidates, reportCandidates } from '../src/finance/proactive';
import { ensureUser } from '../src/users';

let h: DbHandle;
beforeAll(async () => {
  await resetTestDatabase(testDatabaseUrl());
  h = createDb(testDatabaseUrl());
});
afterAll(async () => h?.close());

let tg = 1;
/** Onboarded user whose last activity was at `lastActive` (UTC). */
async function user(lastActive: string, over: Partial<typeof schema.users.$inferInsert> = {}) {
  const { user } = await ensureUser(h.db, { telegramId: tg++ });
  await h.db.update(schema.users).set({
    onboardingCompletedAt: new Date('2026-09-01T00:00:00Z'),
    lastActivityAt: new Date(lastActive),
    ...over,
  }).where(eq(schema.users.id, user.id));
  return user.id;
}
const ids = (rows: Array<{ userId: string }>) => rows.map((r) => r.userId);
// Tashkent = UTC+5. 21:00 local on Oct 5 = 16:00Z.
const at = (iso: string) => new Date(iso);

describe('daily reminder (TZ §32)', () => {
  it('21:00 local, only if nothing recorded today, within a 15-minute window', async () => {
    const quiet = await user('2026-10-04T10:00:00Z'); // active yesterday, nothing today
    const busy = await user('2026-10-05T06:00:00Z'); // recorded today
    const off = await user('2026-10-04T10:00:00Z', { remindersEnabled: false });
    const early = await user('2026-10-04T10:00:00Z', { reminderTime: '22:00' });

    expect(ids(await dailyReminderCandidates(h.db, at('2026-10-05T15:59:00Z')))).not.toContain(quiet); // 20:59
    const at2100 = ids(await dailyReminderCandidates(h.db, at('2026-10-05T16:00:00Z')));
    expect(at2100).toContain(quiet);
    expect(at2100).not.toContain(busy);
    expect(at2100).not.toContain(off);
    expect(at2100).not.toContain(early);
    expect(ids(await dailyReminderCandidates(h.db, at('2026-10-05T16:14:00Z')))).toContain(quiet);
    expect(ids(await dailyReminderCandidates(h.db, at('2026-10-05T16:16:00Z')))).not.toContain(quiet);
  });

  it('stops after 2 silent days (reactivation takes over)', async () => {
    const gone = await user('2026-10-01T10:00:00Z');
    expect(ids(await dailyReminderCandidates(h.db, at('2026-10-05T16:00:00Z')))).not.toContain(gone);
  });

  it('"Bugun xarajat yo\'q" counts as activity', async () => {
    const u = await user('2026-10-04T10:00:00Z');
    const now = at('2026-10-05T16:00:00Z');
    const reminderId = await claimProactive(h.db, { userId: u, kind: 'daily', dedupeKey: 'daily:2026-10-05', timeZone: TZ(), maxPerDay: 2, now });
    expect(await markNoSpendingToday(h.db, u, reminderId!, now)).toBe(true);
    expect(await markNoSpendingToday(h.db, u, reminderId!, now)).toBe(false);
    expect(ids(await dailyReminderCandidates(h.db, at('2026-10-05T16:05:00Z')))).not.toContain(u);
  });
});

function TZ() { return 'Asia/Tashkent'; }

describe('reactivation (3 and 7 days, then stop)', () => {
  it('fires on day 3 and day 7 only', async () => {
    const u = await user('2026-10-01T10:00:00Z');
    const on = async (iso: string) => (await reactivationCandidates(h.db, at(iso))).find((r) => r.userId === u)?.days;
    expect(await on('2026-10-03T16:00:00Z')).toBeUndefined();
    expect(await on('2026-10-04T16:00:00Z')).toBe(3);
    expect(await on('2026-10-06T16:00:00Z')).toBeUndefined();
    expect(await on('2026-10-08T16:00:00Z')).toBe(7);
    expect(await on('2026-10-09T16:00:00Z')).toBeUndefined();
    expect(await on('2026-10-20T16:00:00Z')).toBeUndefined();
  });
});

describe('reports', () => {
  it('weekly: Sunday 20:00 local; monthly: 1st at the report time', async () => {
    const u = await user('2026-10-04T10:00:00Z');
    // 2026-10-04 is a Sunday. 20:00 local = 15:00Z.
    expect(ids(await reportCandidates(h.db, at('2026-10-04T15:00:00Z'), 'weekly', '20:00'))).toContain(u);
    expect(ids(await reportCandidates(h.db, at('2026-10-05T15:00:00Z'), 'weekly', '20:00'))).not.toContain(u);
    expect(ids(await reportCandidates(h.db, at('2026-10-01T05:00:00Z'), 'monthly', '10:00'))).toContain(u);
    expect(ids(await reportCandidates(h.db, at('2026-10-02T05:00:00Z'), 'monthly', '10:00'))).not.toContain(u);
  });
});
