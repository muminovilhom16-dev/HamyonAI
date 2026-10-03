import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { categoryDisplayName, type Language } from '../categories';
import { listOpenDebts } from './debts';
import { addDays, zonedInstant } from './time';
import type { Transaction } from './transactions';

const { transactions, categories } = schema;

/**
 * Integer percentages in tenths that always sum to exactly 100.0
 * (largest-remainder method, TZ §28).
 */
export function percentagesTenths(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v * 1000) / total);
  const floors = raw.map(Math.floor);
  let rest = 1000 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]! += 1;
    rest--;
  }
  return floors;
}

export interface Dashboard {
  range: { startDate: string; endDate: string };
  expenseUzs: number;
  incomeUzs: number;
  /** null when there is no income in the range: never show a negative red balance (TZ §27). */
  balanceUzs: number | null;
  debts: {
    owedToMe: Array<{ currency: 'UZS' | 'USD'; amount: number }>;
    iOwe: Array<{ currency: 'UZS' | 'USD'; amount: number }>;
  };
  byCategory: Array<{ categoryId: string | null; name: string; icon: string | null; totalUzs: number; percentTenths: number }>;
  /** One entry per local day in range, zeros included (TZ §28). */
  daily: Array<{ date: string; expenseUzs: number; incomeUzs: number }>;
}

export async function getDashboard(
  db: Database,
  input: { userId: string; walletId: string; startDate: string; endDate: string; timeZone: string; language: Language; uncategorizedName: string },
): Promise<Dashboard> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const from = zonedInstant(input.startDate, input.timeZone);
  const to = zonedInstant(addDays(input.endDate, 1), input.timeZone);
  const base = and(
    eq(transactions.walletId, input.walletId),
    isNull(transactions.deletedAt),
    gte(transactions.occurredAt, from),
    lt(transactions.occurredAt, to),
    inArray(transactions.type, ['expense', 'income']),
  );

  const localDay = sql<string>`to_char(${transactions.occurredAt} at time zone ${input.timeZone}, 'YYYY-MM-DD')`;
  const perDay = await db
    .select({ day: localDay, type: transactions.type, total: sql<string>`sum(${transactions.amountUzs})` })
    .from(transactions)
    .where(base)
    // Ordinal GROUP BY: the parameterized time-zone expression is not repeated.
    .groupBy(sql`1`, transactions.type);

  const byCat = await db
    .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountUzs})` })
    .from(transactions)
    .where(and(base, eq(transactions.type, 'expense')))
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`sum(${transactions.amountUzs})`));

  const cats = await db.select().from(categories).where(eq(categories.walletId, input.walletId));
  const pct = percentagesTenths(byCat.map((r) => Number(r.total)));

  const days = new Map<string, { expenseUzs: number; incomeUzs: number }>();
  for (let d = input.startDate; d <= input.endDate; d = addDays(d, 1)) days.set(d, { expenseUzs: 0, incomeUzs: 0 });
  let expenseUzs = 0;
  let incomeUzs = 0;
  for (const r of perDay) {
    const v = Number(r.total);
    const slot = days.get(r.day);
    if (r.type === 'expense') {
      expenseUzs += v;
      if (slot) slot.expenseUzs += v;
    } else {
      incomeUzs += v;
      if (slot) slot.incomeUzs += v;
    }
  }

  const open = await listOpenDebts(db, input.userId, input.walletId);
  const sumBy = (dir: 'given' | 'taken') => {
    const m = new Map<'UZS' | 'USD', number>();
    for (const d of open.filter((x) => x.direction === dir)) m.set(d.currency, (m.get(d.currency) ?? 0) + d.remaining);
    return [...m.entries()].map(([currency, amount]) => ({ currency, amount }));
  };

  return {
    range: { startDate: input.startDate, endDate: input.endDate },
    expenseUzs,
    incomeUzs,
    balanceUzs: incomeUzs > 0 ? incomeUzs - expenseUzs : null,
    debts: { owedToMe: sumBy('given'), iOwe: sumBy('taken') },
    byCategory: byCat.map((r, i) => {
      const c = cats.find((x) => x.id === r.categoryId);
      return {
        categoryId: r.categoryId,
        name: c ? categoryDisplayName(c, input.language) : input.uncategorizedName,
        icon: c?.icon ?? null,
        totalUzs: Number(r.total),
        percentTenths: pct[i]!,
      };
    }),
    daily: [...days.entries()].map(([date, v]) => ({ date, ...v })),
  };
}

export interface ListFilter {
  startDate?: string;
  endDate?: string;
  timeZone: string;
  type?: Transaction['type'];
  categoryId?: string;
  /** Text search in note / person; `searchCategoryIds` adds categories whose name matched. */
  search?: string;
  searchCategoryIds?: string[];
  limit: number;
  /** Keyset cursor: rows strictly older than this (occurredAt, id). */
  before?: { occurredAt: Date; id: string };
}

export async function listTransactions(db: Database, userId: string, walletId: string, f: ListFilter): Promise<Transaction[]> {
  await assertWalletAccess(db, userId, walletId);
  const conds: SQL[] = [eq(transactions.walletId, walletId), isNull(transactions.deletedAt)];
  if (f.startDate) conds.push(gte(transactions.occurredAt, zonedInstant(f.startDate, f.timeZone)));
  if (f.endDate) conds.push(lt(transactions.occurredAt, zonedInstant(addDays(f.endDate, 1), f.timeZone)));
  if (f.type) conds.push(eq(transactions.type, f.type));
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.search) {
    const pattern = `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const matches: SQL[] = [ilike(transactions.note, pattern), ilike(transactions.counterparty, pattern)];
    if (f.searchCategoryIds?.length) matches.push(inArray(transactions.categoryId, f.searchCategoryIds));
    conds.push(or(...matches)!);
  }
  if (f.before) {
    conds.push(
      or(
        lt(transactions.occurredAt, f.before.occurredAt),
        and(eq(transactions.occurredAt, f.before.occurredAt), lt(transactions.id, f.before.id)),
      )!,
    );
  }
  return db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(Math.min(Math.max(f.limit, 1), 100));
}
