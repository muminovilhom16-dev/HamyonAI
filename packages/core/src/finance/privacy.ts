import { and, asc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { categoryDisplayName, type Language } from '../categories';
import { addDays, localDate, zonedInstant } from './time';

const { transactions, users, categories, webSessions } = schema;

/** One export row (TZ §31): sana, tur, summa, valyuta, kategoriya, izoh, kim kiritgan. */
export interface ExportRow {
  date: string;
  time: string;
  type: (typeof transactions.$inferSelect)['type'];
  amount: number;
  currency: 'UZS' | 'USD';
  amountUzs: number;
  category: string | null;
  note: string | null;
  counterparty: string | null;
  enteredBy: string | null;
}

export async function exportTransactions(
  db: Database,
  input: { userId: string; walletId: string; timeZone: string; language: Language; startDate?: string; endDate?: string },
): Promise<ExportRow[]> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const conds = [eq(transactions.walletId, input.walletId), isNull(transactions.deletedAt)];
  if (input.startDate) conds.push(gte(transactions.occurredAt, zonedInstant(input.startDate, input.timeZone)));
  if (input.endDate) conds.push(lt(transactions.occurredAt, zonedInstant(addDays(input.endDate, 1), input.timeZone)));
  const rows = await db
    .select({ tx: transactions, cat: categories, user: { displayName: users.displayName } })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .innerJoin(users, eq(users.id, transactions.userId))
    .where(and(...conds))
    .orderBy(asc(transactions.occurredAt), asc(transactions.createdAt), asc(transactions.id));
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: input.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return rows.map(({ tx, cat, user }) => ({
    date: localDate(tx.occurredAt, input.timeZone),
    time: hhmm.format(tx.occurredAt),
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    amountUzs: tx.amountUzs,
    category: cat ? categoryDisplayName(cat, input.language) : null,
    note: tx.note,
    counterparty: tx.counterparty,
    enteredBy: user.displayName,
  }));
}

/** Days between a deletion request and permanent removal (configurable; backups add ≤7 days, total < 30). */
export const DEFAULT_DELETION_GRACE_DAYS = 7;

export async function requestAccountDeletion(db: Database, userId: string, now: Date): Promise<Date> {
  await db.update(users).set({ deletionRequestedAt: now, updatedAt: now }).where(eq(users.id, userId));
  // Sign out everywhere immediately.
  await db.update(webSessions).set({ revokedAt: now }).where(and(eq(webSessions.userId, userId), isNull(webSessions.revokedAt)));
  return now;
}

export async function cancelAccountDeletion(db: Database, userId: string, now: Date): Promise<void> {
  await db.update(users).set({ deletionRequestedAt: null, updatedAt: now }).where(eq(users.id, userId));
}

export const deletionDate = (requestedAt: Date, graceDays = DEFAULT_DELETION_GRACE_DAYS) =>
  new Date(requestedAt.getTime() + graceDays * 86_400_000);

/**
 * Permanently deletes accounts past the grace period. Wallets, transactions,
 * debts, categories, rules, reminders, sessions cascade; usage/analytics rows
 * lose their user link (anonymized).
 */
export async function purgeDeletedAccounts(db: Database, now: Date, graceDays = DEFAULT_DELETION_GRACE_DAYS): Promise<number> {
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);
  const rows = await db
    .delete(users)
    .where(and(isNotNull(users.deletionRequestedAt), lt(users.deletionRequestedAt, cutoff)))
    .returning({ id: users.id });
  return rows.length;
}
