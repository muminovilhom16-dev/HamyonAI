import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { AppError } from '../errors';
import { DEBT_TYPES, parsedTransactionSchema, type ParsedTransaction } from '../parser/contract';
import { convertToUzs, getRate, type ExchangeRateProvider } from './fx';
import { learnRule, patternFromText } from './categories';
import { occurredAtFor } from './time';

const { transactions, categories, analyticsEvents } = schema;

export type Transaction = typeof transactions.$inferSelect;
export type TransactionSource = Transaction['source'];

/** Delete can be undone this long (TZ §19). */
export const UNDO_WINDOW_MS = 10_000;
/** Soft-deleted rows are purged after this (TZ §19). */
export const PURGE_AFTER_DAYS = 30;

export interface FinanceDeps {
  db: Database;
  fx: ExchangeRateProvider | null;
  now?: () => Date;
}

const nowOf = (deps: FinanceDeps) => (deps.now ? deps.now() : new Date());

async function resolveCategoryId(db: Database, walletId: string, key: string | null): Promise<string | null> {
  if (!key) return null;
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.walletId, walletId), isUuid ? eq(categories.id, key) : eq(categories.slug, key)));
  if (!row) throw new AppError('validation', 'unknown category');
  return row.id;
}

async function amountInUzs(deps: FinanceDeps, amount: number, currency: 'UZS' | 'USD', date: string) {
  if (currency === 'UZS') return { amountUzs: amount, fxRateUzs: null };
  const rate = await getRate(deps.db, deps.fx, currency, date);
  return { amountUzs: convertToUzs(amount, rate), fxRateUzs: rate };
}

export interface CreateTransactionInput {
  walletId: string;
  userId: string;
  timeZone: string;
  tx: ParsedTransaction;
  source: TransactionSource;
  /** Already PII-masked. */
  rawInput: string | null;
  categoryPending?: boolean;
}

/**
 * Persists one validated expense/income. Debts go through the debt engine.
 * Re-validates the contract here as the last gate before the database.
 */
export async function createTransaction(deps: FinanceDeps, input: CreateTransactionInput): Promise<Transaction> {
  const tx = parsedTransactionSchema.parse(input.tx);
  if (DEBT_TYPES.has(tx.type)) throw new AppError('validation', 'debts are not transactions of this kind');
  await assertWalletAccess(deps.db, input.userId, input.walletId);

  const now = nowOf(deps);
  const categoryId = input.categoryPending ? null : await resolveCategoryId(deps.db, input.walletId, tx.category_id);
  const { amountUzs, fxRateUzs } = await amountInUzs(deps, tx.amount, tx.currency, tx.date);

  return deps.db.transaction(async (dbtx) => {
    const [row] = await dbtx
      .insert(transactions)
      .values({
        walletId: input.walletId,
        userId: input.userId,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        amountUzs,
        fxRateUzs,
        categoryId,
        categoryStatus: input.categoryPending ? 'pending' : 'final',
        note: tx.note,
        counterparty: tx.counterparty,
        occurredAt: occurredAtFor(tx.date, now, input.timeZone),
        source: input.source,
        rawInput: input.rawInput?.slice(0, 1000) ?? null,
        aiConfidence: tx.confidence,
      })
      .returning();
    await dbtx.insert(analyticsEvents).values({ userId: input.userId, name: 'transaction_created', props: { source: input.source, type: tx.type } });
    await dbtx.update(schema.users).set({ lastActivityAt: now }).where(eq(schema.users.id, input.userId));
    return row!;
  });
}

/** Loads a transaction the user may access (deleted ones included for undo). */
export async function getTransactionForUser(db: Database, userId: string, id: string): Promise<Transaction> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('not_found');
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!row) throw new AppError('not_found');
  await assertWalletAccess(db, userId, row.walletId);
  return row;
}

export interface TransactionPatch {
  amount?: number;
  categoryKey?: string;
  date?: string;
}

export async function updateTransaction(
  deps: FinanceDeps,
  userId: string,
  id: string,
  patch: TransactionPatch,
  timeZone: string,
): Promise<Transaction> {
  const current = await getTransactionForUser(deps.db, userId, id);
  if (current.deletedAt) throw new AppError('not_found');
  const set: Partial<typeof transactions.$inferInsert> = { updatedAt: nowOf(deps) };

  if (patch.amount !== undefined) {
    if (!Number.isSafeInteger(patch.amount) || patch.amount <= 0) throw new AppError('validation', 'invalid amount');
    set.amount = patch.amount;
    // Keep the rate frozen at creation (TZ §38): history never moves with the market.
    set.amountUzs = current.currency === 'UZS' ? patch.amount : convertToUzs(patch.amount, current.fxRateUzs!);
  }
  if (patch.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) throw new AppError('validation', 'invalid date');
    set.occurredAt = occurredAtFor(patch.date, nowOf(deps), timeZone);
  }
  let corrected = false;
  if (patch.categoryKey !== undefined) {
    if (DEBT_TYPES.has(current.type)) throw new AppError('validation', 'debts have no category');
    const categoryId = await resolveCategoryId(deps.db, current.walletId, patch.categoryKey);
    const [cat] = await deps.db.select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId!));
    if (cat?.kind !== (current.type === 'income' ? 'income' : 'expense')) throw new AppError('validation', 'category kind mismatch');
    corrected = categoryId !== current.categoryId;
    set.categoryId = categoryId;
    set.categoryStatus = 'final';
  }

  const [row] = await deps.db.update(transactions).set(set).where(eq(transactions.id, id)).returning();
  await deps.db.insert(analyticsEvents).values({ userId, name: 'transaction_edited', props: { fields: Object.keys(patch) } });

  if (corrected) {
    // User correction becomes a reusable rule (TZ §10, rule 8).
    const pattern = patternFromText(current.note);
    if (pattern) await learnRule(deps.db, userId, current.walletId, pattern, set.categoryId!);
    await deps.db.insert(analyticsEvents).values({
      userId,
      name: 'category_corrected',
      props: { from: current.categoryId, to: set.categoryId, wasPending: current.categoryStatus === 'pending' },
    });
  }
  return row!;
}

export async function softDeleteTransaction(deps: FinanceDeps, userId: string, id: string): Promise<Transaction> {
  const current = await getTransactionForUser(deps.db, userId, id);
  if (current.deletedAt) return current;
  const [row] = await deps.db.update(transactions).set({ deletedAt: nowOf(deps) }).where(eq(transactions.id, id)).returning();
  return row!;
}

/** Restores a deleted transaction within the undo window. */
export async function undoDelete(deps: FinanceDeps, userId: string, id: string): Promise<{ ok: boolean; tx: Transaction }> {
  const current = await getTransactionForUser(deps.db, userId, id);
  if (!current.deletedAt) return { ok: true, tx: current };
  if (nowOf(deps).getTime() - current.deletedAt.getTime() > UNDO_WINDOW_MS) return { ok: false, tx: current };
  const [row] = await deps.db.update(transactions).set({ deletedAt: null }).where(eq(transactions.id, id)).returning();
  return { ok: true, tx: row! };
}

/** Permanently removes rows soft-deleted more than 30 days ago. */
export async function purgeDeletedTransactions(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000);
  const rows = await db
    .delete(transactions)
    .where(and(isNotNull(transactions.deletedAt), lt(transactions.deletedAt, cutoff)))
    .returning({ id: transactions.id });
  return rows.length;
}

export async function listRecentTransactions(db: Database, userId: string, walletId: string, limit = 20): Promise<Transaction[]> {
  await assertWalletAccess(db, userId, walletId);
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.walletId, walletId), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
    .limit(limit);
}

export interface PeriodSummary {
  expenseUzs: number;
  incomeUzs: number;
  count: number;
  byCategory: Array<{ categoryId: string | null; totalUzs: number }>;
}

/** Expense/income totals in UZS. Debts are excluded (TZ rule 1). */
export async function summarize(db: Database, userId: string, walletId: string, from: Date, to: Date): Promise<PeriodSummary> {
  await assertWalletAccess(db, userId, walletId);
  const where = and(
    eq(transactions.walletId, walletId),
    isNull(transactions.deletedAt),
    gte(transactions.occurredAt, from),
    lt(transactions.occurredAt, to),
    inArray(transactions.type, ['expense', 'income']),
  );
  const totals = await db
    .select({
      type: transactions.type,
      total: sql<string>`coalesce(sum(${transactions.amountUzs}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(where)
    .groupBy(transactions.type);
  const byCategory = await db
    .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountUzs})` })
    .from(transactions)
    .where(and(where, eq(transactions.type, 'expense')))
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`sum(${transactions.amountUzs})`));

  const get = (t: string) => totals.find((r) => r.type === t);
  return {
    expenseUzs: Number(get('expense')?.total ?? 0),
    incomeUzs: Number(get('income')?.total ?? 0),
    count: totals.reduce((s, r) => s + r.count, 0),
    byCategory: byCategory.map((r) => ({ categoryId: r.categoryId, totalUzs: Number(r.total) })),
  };
}

/** Logs AI token usage and estimated cost (TZ §35). No PII. */
export async function logAIUsage(
  db: Database,
  userId: string | null,
  feature: string,
  usage: { provider: string; model: string; inputTokens: number; outputTokens: number; costUsdMicros: number; latencyMs: number },
  success: boolean,
): Promise<void> {
  await db.insert(schema.aiUsageLog).values({
    userId,
    feature,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsdMicros: usage.costUsdMicros,
    latencyMs: usage.latencyMs,
    success,
  });
}
