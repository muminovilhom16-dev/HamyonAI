import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';

const { users, reminders } = schema;

/**
 * Who should get which proactive message right now (TZ §32). All checks use
 * the user's own time zone. Each kind has a 15-minute window so a missed
 * one-minute tick does not lose the message; claimProactive() dedupes.
 */

export const WINDOW_SECONDS = 15 * 60;

export interface ProactiveCandidate {
  userId: string;
  telegramId: number;
  language: 'uz_latn' | 'uz_cyrl' | 'ru';
  timeZone: string;
  /** User's local date now, YYYY-MM-DD. */
  localDate: string;
  /** Local date of the last activity (transaction or "no spending" tap). */
  lastActiveDate: string;
}

function base(now: Date) {
  const ts = sql`${now.toISOString()}::timestamptz`;
  const tz = sql`${users.timezone}`;
  const localNow = sql`(${ts} at time zone ${tz})`;
  const last = sql`coalesce(${users.lastActivityAt}, ${users.onboardingCompletedAt}, ${users.createdAt})`;
  const dayStart = sql`(date_trunc('day', ${localNow}) at time zone ${tz})`;
  const fields = {
    userId: users.id,
    telegramId: users.telegramId,
    language: users.language,
    timeZone: users.timezone,
    localDate: sql<string>`to_char(${localNow}, 'YYYY-MM-DD')`,
    lastActiveDate: sql<string>`to_char(${last} at time zone ${tz}, 'YYYY-MM-DD')`,
  };
  const active = and(isNotNull(users.onboardingCompletedAt), isNull(users.deletionRequestedAt));
  /** Seconds since local `hh:mm` today (negative before it). */
  const sinceLocal = (hhmm: ReturnType<typeof sql>) => sql`extract(epoch from (${localNow}::time - ${hhmm}::time))`;
  return { localNow, last, dayStart, fields, active, sinceLocal };
}

const inWindow = (seconds: ReturnType<typeof sql>) => sql`${seconds} >= 0 and ${seconds} < ${WINDOW_SECONDS}`;

/**
 * Daily reminder at the user's reminder time, only if nothing was recorded
 * today, and only for users active in the last 2 days (longer silence is
 * handled by the 3/7-day reactivation messages, then we stop).
 */
export async function dailyReminderCandidates(db: Database, now: Date): Promise<ProactiveCandidate[]> {
  const b = base(now);
  return db
    .select(b.fields)
    .from(users)
    .where(
      and(
        b.active,
        eq(users.remindersEnabled, true),
        inWindow(b.sinceLocal(sql`${users.reminderTime}`)),
        sql`${b.last} < ${b.dayStart}`,
        sql`${b.last} >= ${b.dayStart} - interval '2 days'`,
      ),
    );
}

/** Inactive for exactly 3 or 7 local days, at the reminder time. */
export async function reactivationCandidates(db: Database, now: Date): Promise<Array<ProactiveCandidate & { days: 3 | 7 }>> {
  const b = base(now);
  const days = sql<number>`((${b.localNow})::date - (${b.last} at time zone ${users.timezone})::date)`;
  const rows = await db
    .select({ ...b.fields, days })
    .from(users)
    .where(and(b.active, eq(users.remindersEnabled, true), inWindow(b.sinceLocal(sql`${users.reminderTime}`)), sql`${days} in (3, 7)`));
  return rows.map((r) => ({ ...r, days: Number(r.days) as 3 | 7 }));
}

/** Sunday at `reportTime` local (weekly), or the 1st of the month (monthly). */
export async function reportCandidates(db: Database, now: Date, kind: 'weekly' | 'monthly', reportTime: string): Promise<ProactiveCandidate[]> {
  const b = base(now);
  const dayCond = kind === 'weekly' ? sql`extract(dow from ${b.localNow}) = 0` : sql`extract(day from ${b.localNow}) = 1`;
  return db.select(b.fields).from(users).where(and(b.active, dayCond, inWindow(b.sinceLocal(sql`${reportTime}`))));
}

/** "Bugun xarajat yo'q" counts as activity (TZ §32). Returns false for a stale button. */
export async function markNoSpendingToday(db: Database, userId: string, reminderId: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(reminders)
    .set({ answeredAt: now })
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId), isNull(reminders.answeredAt)))
    .returning({ id: reminders.id });
  if (!rows.length) return false;
  await db.update(users).set({ lastActivityAt: now }).where(eq(users.id, userId));
  await db.insert(schema.analyticsEvents).values({ userId, name: 'reminder_answered', props: { kind: 'daily', answer: 'no_spending' } });
  return true;
}
