import { asc, eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { AppError } from '../errors';
import { localDate } from './time';

const { goals, goalContributions } = schema;

export const MAX_GOALS_PER_WALLET = 20;

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currency: 'UZS' | 'USD';
  savedAmount: number;
  targetDate: string | null;
  completed: boolean;
  /** Needed per month to reach the target by `targetDate` (null without a date or when done). */
  perMonth: number | null;
}

function monthsLeft(today: string, target: string): number {
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  const [gy, gm] = target.split('-').map(Number) as [number, number];
  return Math.max(1, (gy - ty) * 12 + (gm - tm) + (target.slice(8) >= today.slice(8) ? 1 : 0));
}

const toGoal = (g: typeof goals.$inferSelect, today: string): Goal => {
  const left = g.targetAmount - g.savedAmount;
  return {
    id: g.id,
    name: g.name,
    targetAmount: g.targetAmount,
    currency: g.currency,
    savedAmount: g.savedAmount,
    targetDate: g.targetDate,
    completed: g.completedAt !== null,
    perMonth: g.targetDate && left > 0 && g.targetDate >= today ? Math.ceil(left / monthsLeft(today, g.targetDate)) : null,
  };
};

export async function createGoal(
  db: Database,
  input: { userId: string; walletId: string; name: string; targetAmount: number; currency: 'UZS' | 'USD'; targetDate?: string | null },
): Promise<string> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) throw new AppError('validation', 'name');
  if (!Number.isSafeInteger(input.targetAmount) || input.targetAmount <= 0) throw new AppError('validation', 'amount');
  if (input.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new AppError('validation', 'date');
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(goals).where(eq(goals.walletId, input.walletId));
  if ((count?.n ?? 0) >= MAX_GOALS_PER_WALLET) throw new AppError('validation', 'too many');
  const [row] = await db
    .insert(goals)
    .values({ walletId: input.walletId, userId: input.userId, name, targetAmount: input.targetAmount, currency: input.currency, targetDate: input.targetDate ?? null })
    .returning({ id: goals.id });
  return row!.id;
}

export async function listGoals(db: Database, input: { userId: string; walletId: string; timeZone: string; now: Date }): Promise<Goal[]> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const rows = await db.select().from(goals).where(eq(goals.walletId, input.walletId)).orderBy(asc(goals.createdAt));
  const today = localDate(input.now, input.timeZone);
  return rows.map((g) => toGoal(g, today)).sort((a, b) => Number(a.completed) - Number(b.completed));
}

async function loadOwned(db: Database, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('not_found');
  const [row] = await db.select().from(goals).where(eq(goals.id, id));
  if (!row) throw new AppError('not_found');
  await assertWalletAccess(db, userId, row.walletId);
  return row;
}

/**
 * Puts money into (positive) or takes it out of (negative) a goal. Never an
 * expense. Saved amount cannot go below zero; reaching the target marks it done.
 */
export async function contributeToGoal(
  db: Database,
  input: { userId: string; goalId: string; amount: number; timeZone: string; now: Date },
): Promise<{ goal: Goal; justCompleted: boolean }> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new AppError('validation', 'amount');
  await loadOwned(db, input.userId, input.goalId);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(goals).where(eq(goals.id, input.goalId)).for('update');
    const saved = row!.savedAmount + input.amount;
    if (saved < 0) throw new AppError('validation', 'more than saved');
    const reached = saved >= row!.targetAmount;
    const [updated] = await tx
      .update(goals)
      .set({ savedAmount: saved, completedAt: reached ? row!.completedAt ?? input.now : null, updatedAt: input.now })
      .where(eq(goals.id, input.goalId))
      .returning();
    await tx.insert(goalContributions).values({ goalId: input.goalId, userId: input.userId, amount: input.amount });
    return { goal: toGoal(updated!, localDate(input.now, input.timeZone)), justCompleted: reached && row!.completedAt === null };
  });
}

export async function removeGoal(db: Database, userId: string, id: string): Promise<void> {
  await loadOwned(db, userId, id);
  await db.delete(goals).where(eq(goals.id, id));
}
