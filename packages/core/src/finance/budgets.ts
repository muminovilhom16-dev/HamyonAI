import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import type { Language } from '../categories';
import { AppError } from '../errors';
import { listWalletCategories } from './categories';
import { periodRange } from './time';

const { budgets, transactions, categories } = schema;

export interface BudgetStatus {
  id: string;
  /** null = limit on all expenses. */
  categoryId: string | null;
  name: string | null;
  icon: string | null;
  limitUzs: number;
  spentUzs: number;
}

/** Creates or replaces the monthly limit for a category (or the total when `categoryId` is null). */
export async function setBudget(
  db: Database,
  input: { userId: string; walletId: string; categoryId: string | null; amountUzs: number; maxBudgets: number | null },
): Promise<string> {
  await assertWalletAccess(db, input.userId, input.walletId);
  if (!Number.isSafeInteger(input.amountUzs) || input.amountUzs <= 0) throw new AppError('validation', 'amount');
  if (input.categoryId) {
    const [cat] = await db
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, input.categoryId), eq(categories.walletId, input.walletId)));
    if (!cat || cat.kind !== 'expense') throw new AppError('validation', 'category');
  }
  const sameTarget = and(
    eq(budgets.walletId, input.walletId),
    input.categoryId ? eq(budgets.categoryId, input.categoryId) : isNull(budgets.categoryId),
  );
  return db.transaction(async (tx) => {
    // Serialize per wallet so the plan limit cannot be raced past.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`budgets:${input.walletId}`}))`);
    const [existing] = await tx.select({ id: budgets.id }).from(budgets).where(sameTarget);
    if (existing) {
      await tx.update(budgets).set({ amountUzs: input.amountUzs, updatedAt: new Date() }).where(eq(budgets.id, existing.id));
      return existing.id;
    }
    if (input.maxBudgets !== null) {
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(budgets).where(eq(budgets.walletId, input.walletId));
      if ((count?.n ?? 0) >= input.maxBudgets) throw new AppError('validation', 'budget limit');
    }
    const [row] = await tx
      .insert(budgets)
      .values({ walletId: input.walletId, categoryId: input.categoryId, amountUzs: input.amountUzs })
      .returning({ id: budgets.id });
    return row!.id;
  });
}

export async function removeBudget(db: Database, userId: string, budgetId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(budgetId)) throw new AppError('not_found');
  const [row] = await db.select({ walletId: budgets.walletId }).from(budgets).where(eq(budgets.id, budgetId));
  if (!row) throw new AppError('not_found');
  await assertWalletAccess(db, userId, row.walletId);
  await db.delete(budgets).where(eq(budgets.id, budgetId));
}

/** Every budget with this month's spending (user's local month, expenses only, deleted excluded). */
export async function budgetStatus(
  db: Database,
  input: { userId: string; walletId: string; timeZone: string; now: Date; lang: Language },
): Promise<BudgetStatus[]> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const rows = await db.select().from(budgets).where(eq(budgets.walletId, input.walletId));
  if (rows.length === 0) return [];
  const { from, to } = periodRange('month', input.now, input.timeZone);
  const spent = await db
    .select({ categoryId: transactions.categoryId, total: sql<string>`coalesce(sum(${transactions.amountUzs}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletId, input.walletId),
        eq(transactions.type, 'expense'),
        isNull(transactions.deletedAt),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    )
    .groupBy(transactions.categoryId);
  const byCategory = new Map(spent.map((r) => [r.categoryId, Number(r.total)]));
  const total = [...byCategory.values()].reduce((a, b) => a + b, 0);
  const cats = await listWalletCategories(db, input.walletId, input.lang);
  return rows
    .map((b) => {
      const cat = b.categoryId ? cats.find((c) => c.id === b.categoryId) : undefined;
      return {
        id: b.id,
        categoryId: b.categoryId,
        name: cat?.name ?? null,
        icon: cat?.icon ?? null,
        limitUzs: b.amountUzs,
        spentUzs: b.categoryId ? byCategory.get(b.categoryId) ?? 0 : total,
      };
    })
    .sort((a, b) => (a.categoryId === null ? -1 : b.categoryId === null ? 1 : b.spentUzs / b.limitUzs - a.spentUzs / a.limitUzs));
}

export const BUDGET_THRESHOLDS = [80, 100] as const;

/**
 * Budgets whose 80% / 100% threshold was crossed by an expense of
 * `amountUzs` in `categoryId` (statuses are taken after it was saved).
 * Only the highest crossed threshold is reported per budget.
 */
export function budgetCrossings(
  after: BudgetStatus[],
  expense: { categoryId: string | null; amountUzs: number },
): Array<BudgetStatus & { threshold: number }> {
  const out: Array<BudgetStatus & { threshold: number }> = [];
  for (const b of after) {
    if (b.categoryId !== null && b.categoryId !== expense.categoryId) continue;
    const before = b.spentUzs - expense.amountUzs;
    const crossed = [...BUDGET_THRESHOLDS]
      .reverse()
      .find((t) => before * 100 < b.limitUzs * t && b.spentUzs * 100 >= b.limitUzs * t);
    if (crossed) out.push({ ...b, threshold: crossed });
  }
  return out;
}
