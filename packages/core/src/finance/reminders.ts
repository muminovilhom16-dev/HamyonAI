import { and, eq, gte, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { schema, type Database } from '@hamyon/db';
import { addDays, localDate, zonedInstant } from './time';

const { reminders, users, debts } = schema;

export type ReminderKind = (typeof reminders.$inferSelect)['kind'];

/**
 * Claims the right to send one proactive message (TZ §32, rule 10):
 *  - never the same message twice (unique dedupe key per user);
 *  - never more than `maxPerDay` proactive messages per local day.
 * The user row is locked so concurrent workers cannot both pass the cap.
 * Returns the reminder id to mark as sent/failed, or null if not allowed.
 */
export async function claimProactive(
  db: Database,
  input: { userId: string; kind: ReminderKind; dedupeKey: string; timeZone: string; maxPerDay: number; now: Date; payload?: unknown },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).for('update');
    const dayStart = zonedInstant(localDate(input.now, input.timeZone), input.timeZone);
    const [{ count }] = (await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(reminders)
      .where(and(eq(reminders.userId, input.userId), eq(reminders.status, 'sent'), gte(reminders.sentAt, dayStart)))) as [{ count: number }];
    if (count >= input.maxPerDay) return null;
    const [row] = await tx
      .insert(reminders)
      .values({
        userId: input.userId,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        scheduledFor: input.now,
        sentAt: input.now,
        status: 'sent',
        payload: input.payload ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: reminders.id });
    return row?.id ?? null;
  });
}

/** Delivery failed (e.g. user blocked the bot): it no longer counts toward the cap. */
export async function markProactiveFailed(db: Database, id: string): Promise<void> {
  await db.update(reminders).set({ status: 'failed' }).where(eq(reminders.id, id));
}

export interface DueDebtReminder {
  userId: string;
  telegramId: number;
  language: 'uz_latn' | 'uz_cyrl' | 'ru';
  timeZone: string;
  debtId: string;
  counterparty: string;
  direction: 'given' | 'taken';
  remaining: number;
  currency: 'UZS' | 'USD';
  dueDate: string;
  kind: 'due_soon' | 'due_today';
}

/** Local hour after which debt reminders may go out (not at night). */
export const DEBT_REMINDER_HOUR = 10;

/** Debts due in 2 days or today (TZ §32), for users whose local time is past 10:00. */
export async function dueDebtReminders(db: Database, now: Date): Promise<DueDebtReminder[]> {
  // Coarse SQL window (±3 days around now), exact local-date check below.
  const from = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ debt: debts, user: users })
    .from(debts)
    .innerJoin(users, eq(users.id, debts.createdByUserId))
    .where(
      and(
        eq(debts.status, 'open'),
        isNull(debts.deletedAt),
        isNotNull(debts.dueDate),
        gte(debts.dueDate, from),
        lt(debts.dueDate, to),
        isNull(users.deletionRequestedAt),
      ),
    );
  const out: DueDebtReminder[] = [];
  for (const { debt, user } of rows) {
    const today = localDate(now, user.timezone);
    const hourStart = zonedInstant(today, user.timezone, DEBT_REMINDER_HOUR, 0);
    if (now < hourStart) continue;
    const kind = debt.dueDate === today ? 'due_today' : debt.dueDate === addDays(today, 2) ? 'due_soon' : null;
    if (!kind) continue;
    out.push({
      userId: user.id,
      telegramId: user.telegramId,
      language: user.language,
      timeZone: user.timezone,
      debtId: debt.id,
      counterparty: debt.counterparty,
      direction: debt.direction,
      remaining: debt.remaining,
      currency: debt.currency,
      dueDate: debt.dueDate!,
      kind,
    });
  }
  return out;
}

export interface DueDebtorReminder {
  debtId: string;
  dueDate: string;
  /** The debtor: a Hamyon user whose @username the lender attached to the debt. */
  debtorUserId: string;
  debtorTelegramId: number;
  debtorLanguage: 'uz_latn' | 'uz_cyrl' | 'ru';
  debtorTimeZone: string;
  debtorUsername: string;
  lenderUserId: string;
  lenderName: string;
  remaining: number;
  currency: 'UZS' | 'USD';
}

/**
 * Due-today reminders for the debtor (only debts the lender gave, with the
 * debtor's @username, when that person uses the bot and has not opted out),
 * from 10:00 in the debtor's time zone.
 */
export async function dueDebtorReminders(db: Database, now: Date): Promise<DueDebtorReminder[]> {
  const debtor = alias(users, 'debtor');
  const from = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ debt: debts, lender: users, debtor })
    .from(debts)
    .innerJoin(users, eq(users.id, debts.createdByUserId))
    .innerJoin(debtor, eq(debtor.username, debts.counterpartyUsername))
    .where(
      and(
        eq(debts.status, 'open'),
        eq(debts.direction, 'given'),
        isNull(debts.deletedAt),
        isNotNull(debts.dueDate),
        gte(debts.dueDate, from),
        lt(debts.dueDate, to),
        isNull(users.deletionRequestedAt),
        isNull(debtor.deletionRequestedAt),
        isNotNull(debtor.onboardingCompletedAt),
        eq(debtor.debtRemindersFromOthers, true),
        ne(debtor.id, users.id),
      ),
    );
  const out: DueDebtorReminder[] = [];
  for (const { debt, lender, debtor: d } of rows) {
    const today = localDate(now, d.timezone);
    if (debt.dueDate !== today || now < zonedInstant(today, d.timezone, DEBT_REMINDER_HOUR, 0)) continue;
    out.push({
      debtId: debt.id,
      dueDate: debt.dueDate,
      debtorUserId: d.id,
      debtorTelegramId: d.telegramId,
      debtorLanguage: d.language,
      debtorTimeZone: d.timezone,
      debtorUsername: d.username!,
      lenderUserId: lender.id,
      lenderName: lender.displayName?.trim() || (lender.username ? `@${lender.username}` : 'Hamyon AI'),
      remaining: debt.remaining,
      currency: debt.currency,
    });
  }
  return out;
}

/** Debtor's "don't send me these" button. */
export async function optOutOfDebtorReminders(db: Database, userId: string): Promise<void> {
  await db.update(users).set({ debtRemindersFromOthers: false, updatedAt: new Date() }).where(eq(users.id, userId));
}
