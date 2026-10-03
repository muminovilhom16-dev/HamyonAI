import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { addDays, localDate, zonedInstant } from './time';

const { transactions } = schema;

export interface MonthInsights {
  /** Spending so far this month ÷ days elapsed (today included). */
  dailyAverageUzs: number;
  /** Projected month total; null in the first 5 days (too noisy) or with no spending. */
  forecastUzs: number | null;
  /** Spending in the previous month over the same days (1..today's day). */
  prevSamePeriodUzs: number;
  /** % change vs `prevSamePeriodUzs`; null without a previous baseline. */
  changePct: number | null;
  daysElapsed: number;
  daysInMonth: number;
}

export const FORECAST_MIN_DAY = 6;

const daysIn = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

async function spent(db: Database, walletId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amountUzs}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.walletId, walletId),
        eq(transactions.type, 'expense'),
        isNull(transactions.deletedAt),
        gte(transactions.occurredAt, from),
        lt(transactions.occurredAt, to),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Current-month pace: average per day, end-of-month forecast, and the same days of last month. */
export async function monthInsights(
  db: Database,
  input: { userId: string; walletId: string; timeZone: string; now: Date },
): Promise<MonthInsights> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const today = localDate(input.now, input.timeZone);
  const month = today.slice(0, 7);
  const day = Number(today.slice(8));
  const daysInMonth = daysIn(month);
  const tomorrow = zonedInstant(addDays(today, 1), input.timeZone);
  const current = await spent(db, input.walletId, zonedInstant(`${month}-01`, input.timeZone), tomorrow);

  const prevMonthStart = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const prevDays = Math.min(day, daysIn(prevMonthStart));
  const prevEnd = addDays(`${prevMonthStart}-${String(prevDays).padStart(2, '0')}`, 1);
  const prev = await spent(db, input.walletId, zonedInstant(`${prevMonthStart}-01`, input.timeZone), zonedInstant(prevEnd, input.timeZone));

  return {
    dailyAverageUzs: Math.round(current / day),
    forecastUzs: day >= FORECAST_MIN_DAY && current > 0 ? Math.round((current / day) * daysInMonth) : null,
    prevSamePeriodUzs: prev,
    changePct: prev > 0 ? Math.round(((current - prev) / prev) * 100) : null,
    daysElapsed: day,
    daysInMonth,
  };
}
