import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import type { Language } from '../categories';
import { AppError } from '../errors';
import { listWalletCategories } from './categories';
import { localDate } from './time';
import { createTransaction, type FinanceDeps, type Transaction } from './transactions';

const { recurringPayments, users } = schema;

export const MAX_RECURRING_PER_WALLET = 30;

export interface RecurringPayment {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  amount: number;
  currency: 'UZS' | 'USD';
  note: string;
  dayOfMonth: number;
  /** YYYY-MM-DD of the next due date (this month if not handled yet and not past). */
  nextDate: string;
}

const monthOf = (date: string) => date.slice(0, 7);

function nextDue(today: string, day: number, lastHandledMonth: string | null): string {
  const dd = String(day).padStart(2, '0');
  const thisMonth = monthOf(today);
  if (lastHandledMonth !== thisMonth && `${thisMonth}-${dd}` >= today) return `${thisMonth}-${dd}`;
  const d = new Date(`${thisMonth}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.toISOString().slice(0, 7)}-${dd}`;
}

export async function createRecurring(
  db: Database,
  input: { userId: string; walletId: string; categoryId: string | null; amount: number; currency: 'UZS' | 'USD'; note: string; dayOfMonth: number },
): Promise<string> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const note = input.note.replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!note) throw new AppError('validation', 'name');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new AppError('validation', 'amount');
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28) throw new AppError('validation', 'day');
  if (input.categoryId) {
    const [cat] = await db
      .select({ kind: schema.categories.kind })
      .from(schema.categories)
      .where(and(eq(schema.categories.id, input.categoryId), eq(schema.categories.walletId, input.walletId)));
    if (!cat || cat.kind !== 'expense') throw new AppError('validation', 'category');
  }
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(recurringPayments).where(eq(recurringPayments.walletId, input.walletId));
  if ((count?.n ?? 0) >= MAX_RECURRING_PER_WALLET) throw new AppError('validation', 'too many');
  const [row] = await db
    .insert(recurringPayments)
    .values({
      walletId: input.walletId,
      userId: input.userId,
      categoryId: input.categoryId,
      amount: input.amount,
      currency: input.currency,
      note,
      dayOfMonth: input.dayOfMonth,
    })
    .returning({ id: recurringPayments.id });
  return row!.id;
}

export async function listRecurring(
  db: Database,
  input: { userId: string; walletId: string; timeZone: string; now: Date; lang: Language },
): Promise<RecurringPayment[]> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const rows = await db
    .select()
    .from(recurringPayments)
    .where(eq(recurringPayments.walletId, input.walletId))
    .orderBy(asc(recurringPayments.dayOfMonth), asc(recurringPayments.createdAt));
  const cats = await listWalletCategories(db, input.walletId, input.lang);
  const today = localDate(input.now, input.timeZone);
  return rows.map((r) => {
    const cat = r.categoryId ? cats.find((c) => c.id === r.categoryId) : undefined;
    return {
      id: r.id,
      categoryId: r.categoryId,
      categoryName: cat?.name ?? null,
      categoryIcon: cat?.icon ?? null,
      amount: r.amount,
      currency: r.currency,
      note: r.note,
      dayOfMonth: r.dayOfMonth,
      nextDate: nextDue(today, r.dayOfMonth, r.lastHandledMonth),
    };
  });
}

async function loadOwned(db: Database, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('not_found');
  const [row] = await db.select().from(recurringPayments).where(eq(recurringPayments.id, id));
  if (!row) throw new AppError('not_found');
  await assertWalletAccess(db, userId, row.walletId);
  return row;
}

export async function removeRecurring(db: Database, userId: string, id: string): Promise<void> {
  await loadOwned(db, userId, id);
  await db.delete(recurringPayments).where(eq(recurringPayments.id, id));
}

export interface DueRecurring {
  recurringId: string;
  userId: string;
  telegramId: number;
  language: Language;
  timeZone: string;
  /** Local YYYY-MM-DD today; the month it is due for is its first 7 chars. */
  localDate: string;
  note: string;
  amount: number;
  currency: 'UZS' | 'USD';
}

/**
 * Payments due today (user's local day) and not yet paid/skipped this month,
 * from `atTime` local for 15 minutes (the scheduler ticks every minute).
 */
export async function dueRecurring(db: Database, now: Date, atTime: string): Promise<DueRecurring[]> {
  const ts = sql`${now.toISOString()}::timestamptz`;
  const localNow = sql`(${ts} at time zone ${users.timezone})`;
  const since = sql`extract(epoch from (${localNow}::time - ${atTime}::time))`;
  const today = sql<string>`to_char(${localNow}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      recurringId: recurringPayments.id,
      userId: users.id,
      telegramId: users.telegramId,
      language: users.language,
      timeZone: users.timezone,
      localDate: today,
      note: recurringPayments.note,
      amount: recurringPayments.amount,
      currency: recurringPayments.currency,
    })
    .from(recurringPayments)
    .innerJoin(users, eq(users.id, recurringPayments.userId))
    .where(
      and(
        isNotNull(users.onboardingCompletedAt),
        isNull(users.deletionRequestedAt),
        sql`extract(day from ${localNow}) = ${recurringPayments.dayOfMonth}`,
        sql`${since} >= 0 and ${since} < 900`,
        or(isNull(recurringPayments.lastHandledMonth), sql`${recurringPayments.lastHandledMonth} <> to_char(${localNow}, 'YYYY-MM')`),
      ),
    );
  return rows as DueRecurring[];
}

/**
 * "To'landi" records the expense for `month`; "skip" just marks the month.
 * Idempotent: a second tap for the same month returns `already`.
 */
export async function handleRecurring(
  deps: FinanceDeps,
  input: { userId: string; id: string; month: string; action: 'pay' | 'skip'; timeZone: string },
): Promise<{ status: 'paid' | 'skipped' | 'already'; tx?: Transaction }> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new AppError('validation', 'month');
  const row = await loadOwned(deps.db, input.userId, input.id);
  // Claim the month first; only the winner records the expense.
  const claimed = await deps.db
    .update(recurringPayments)
    .set({ lastHandledMonth: input.month, updatedAt: new Date() })
    .where(
      and(
        eq(recurringPayments.id, row.id),
        or(isNull(recurringPayments.lastHandledMonth), sql`${recurringPayments.lastHandledMonth} < ${input.month}`),
      ),
    )
    .returning({ id: recurringPayments.id });
  if (claimed.length === 0) return { status: 'already' };
  if (input.action === 'skip') return { status: 'skipped' };
  try {
    const today = localDate(deps.now ? deps.now() : new Date(), input.timeZone);
    const tx = await createTransaction(deps, {
      walletId: row.walletId,
      userId: input.userId,
      timeZone: input.timeZone,
      tx: {
        type: 'expense',
        amount: row.amount,
        currency: row.currency,
        category_id: row.categoryId,
        note: row.note,
        counterparty: null,
        date: today,
        confidence: 1,
      },
      source: 'text',
      rawInput: null,
      categoryPending: row.categoryId === null,
    });
    return { status: 'paid', tx };
  } catch (err) {
    // Nothing was recorded: release the month so the user can tap again.
    await deps.db.update(recurringPayments).set({ lastHandledMonth: row.lastHandledMonth }).where(eq(recurringPayments.id, row.id));
    throw err;
  }
}
