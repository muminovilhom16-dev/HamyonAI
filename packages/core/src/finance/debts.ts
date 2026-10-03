import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { AppError } from '../errors';
import { foldWord } from '../parser/normalize';
import { normalizeTgUsername } from '../users';
import { amountInUzs, UNDO_WINDOW_MS, type FinanceDeps, type Transaction, type TransactionSource } from './transactions';
import { occurredAtFor } from './time';

const { debts, debtPayments, transactions, analyticsEvents } = schema;

export type Debt = typeof debts.$inferSelect;
export type DebtDirection = Debt['direction'];

/**
 * Debt engine (TZ §12-13). Debts are never expenses: they live in `debts` /
 * `debt_payments`, and their events are `debt_*` transactions that every
 * statistic excludes. Amounts are integers; remaining is updated under a row
 * lock inside one DB transaction.
 */

const CASE_SUFFIXES = ['larga', 'larning', 'ning', 'dan', 'ga', 'ni', 'lar'];

/** "Murod akaga" / "Мурод ака" / "murod aka" → "murod aka". */
export function counterpartyKey(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => foldWord(w))
    .filter(Boolean)
    .map((w) => {
      for (const suf of CASE_SUFFIXES) {
        if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
      }
      return w;
    })
    .join(' ')
    .slice(0, 100);
}

/** Display form: trims case suffix from the last word, capitalizes. */
export function cleanCounterparty(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 4);
  const last = words[words.length - 1]!;
  for (const suf of ['ga', 'dan', 'ning', 'га', 'дан', 'нинг']) {
    if (last.toLowerCase().endsWith(suf) && last.length - suf.length >= 3) {
      words[words.length - 1] = last.slice(0, -suf.length);
      break;
    }
  }
  const s = words.join(' ').slice(0, 100);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface CreateDebtInput {
  walletId: string;
  userId: string;
  timeZone: string;
  direction: DebtDirection;
  counterparty: string;
  amount: number;
  currency: 'UZS' | 'USD';
  date: string;
  dueDate?: string | null;
  note?: string | null;
  source: TransactionSource;
  rawInput: string | null;
  confidence?: number | null;
  /** Debtor's Telegram @username (any form); invalid → validation error. */
  counterpartyUsername?: string | null;
}

/** Empty → null; anything else must be a valid Telegram username. */
function usernameOrThrow(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null || raw.trim() === '') return null;
  const u = normalizeTgUsername(raw);
  if (!u) throw new AppError('validation', 'invalid username');
  return u;
}

export async function createDebt(deps: FinanceDeps, input: CreateDebtInput): Promise<{ debt: Debt; tx: Transaction }> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new AppError('validation', 'invalid amount');
  const counterpartyUsername = usernameOrThrow(input.counterpartyUsername);
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new AppError('validation', 'invalid date');
  const counterparty = cleanCounterparty(input.counterparty);
  const key = counterpartyKey(counterparty);
  if (!key) throw new AppError('validation', 'counterparty required');
  await assertWalletAccess(deps.db, input.userId, input.walletId);
  const now = deps.now ? deps.now() : new Date();
  const { amountUzs, fxRateUzs } = await amountInUzs(deps, input.amount, input.currency, input.date);

  return deps.db.transaction(async (db) => {
    const [debt] = await db
      .insert(debts)
      .values({
        walletId: input.walletId,
        createdByUserId: input.userId,
        counterparty,
        counterpartyKey: key,
        counterpartyUsername,
        direction: input.direction,
        total: input.amount,
        remaining: input.amount,
        currency: input.currency,
        dueDate: input.dueDate ?? null,
      })
      .returning();
    const [tx] = await db
      .insert(transactions)
      .values({
        walletId: input.walletId,
        userId: input.userId,
        type: input.direction === 'given' ? 'debt_given' : 'debt_taken',
        amount: input.amount,
        currency: input.currency,
        amountUzs,
        fxRateUzs,
        debtId: debt!.id,
        note: input.note ?? null,
        counterparty,
        occurredAt: occurredAtFor(input.date, now, input.timeZone),
        source: input.source,
        rawInput: input.rawInput?.slice(0, 1000) ?? null,
        aiConfidence: input.confidence ?? null,
      })
      .returning();
    await db.insert(analyticsEvents).values({
      userId: input.userId,
      name: 'transaction_created',
      props: { source: input.source, type: tx!.type },
    });
    await db.update(schema.users).set({ lastActivityAt: now }).where(eq(schema.users.id, input.userId));
    return { debt: debt!, tx: tx! };
  });
}

/** Open debts in a wallet whose counterparty matches `name` (exact key, else first name). */
export async function findOpenDebts(db: Database, walletId: string, name: string, direction?: DebtDirection | null): Promise<Debt[]> {
  const key = counterpartyKey(name);
  if (!key) return [];
  const open = await db
    .select()
    .from(debts)
    .where(
      and(
        eq(debts.walletId, walletId),
        eq(debts.status, 'open'),
        isNull(debts.deletedAt),
        ...(direction ? [eq(debts.direction, direction)] : []),
      ),
    )
    .orderBy(sql`${debts.dueDate} asc nulls last`, asc(debts.createdAt));
  const exact = open.filter((d) => d.counterpartyKey === key);
  if (exact.length) return exact;
  // "Murod" ↔ "Murod aka": match on the first word if it identifies one person.
  const first = key.split(' ')[0]!;
  return open.filter((d) => d.counterpartyKey.split(' ')[0] === first);
}

export type RepaymentResult =
  | { kind: 'ok'; tx: Transaction; debts: Debt[]; remaining: number; currency: 'UZS' | 'USD'; counterparty: string; direction: DebtDirection }
  | { kind: 'no_debt' }
  | { kind: 'ambiguous_person'; names: string[] }
  | { kind: 'ambiguous_direction' }
  | { kind: 'currency_mismatch'; currency: 'UZS' | 'USD' }
  | { kind: 'overpayment'; remaining: number; currency: 'UZS' | 'USD' };

export interface RepaymentInput {
  walletId: string;
  userId: string;
  timeZone: string;
  counterparty: string;
  /** to_me: they paid me back (given debts); by_me: I paid back (taken debts). */
  returnDirection: 'to_me' | 'by_me' | null;
  amount: number;
  currency: 'UZS' | 'USD';
  date: string;
  note?: string | null;
  source: TransactionSource;
  rawInput: string | null;
}

/**
 * Applies a repayment to the oldest/earliest-due open debts with this person
 * (FIFO), keeping partial-payment history. Never overpays silently.
 */
export async function recordRepayment(deps: FinanceDeps, input: RepaymentInput): Promise<RepaymentResult> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new AppError('validation', 'invalid amount');
  await assertWalletAccess(deps.db, input.userId, input.walletId);
  const wanted: DebtDirection | null =
    input.returnDirection === 'to_me' ? 'given' : input.returnDirection === 'by_me' ? 'taken' : null;

  const candidates = await findOpenDebts(deps.db, input.walletId, input.counterparty, wanted);
  if (candidates.length === 0) return { kind: 'no_debt' };
  const people = [...new Set(candidates.map((d) => d.counterpartyKey))];
  if (people.length > 1) {
    return { kind: 'ambiguous_person', names: [...new Set(candidates.map((d) => d.counterparty))] };
  }
  const directions = [...new Set(candidates.map((d) => d.direction))];
  if (directions.length > 1) return { kind: 'ambiguous_direction' };
  const direction = directions[0]!;
  const sameCurrency = candidates.filter((d) => d.currency === input.currency);
  if (sameCurrency.length === 0) return { kind: 'currency_mismatch', currency: candidates[0]!.currency };

  const now = deps.now ? deps.now() : new Date();
  const { amountUzs, fxRateUzs } = await amountInUzs(deps, input.amount, input.currency, input.date);

  return deps.db.transaction(async (db) => {
    // Lock the rows, then re-check under the lock.
    const locked = await db
      .select()
      .from(debts)
      .where(and(inArray(debts.id, sameCurrency.map((d) => d.id)), eq(debts.status, 'open'), isNull(debts.deletedAt)))
      .orderBy(sql`${debts.dueDate} asc nulls last`, asc(debts.createdAt))
      .for('update');
    const totalRemaining = locked.reduce((s, d) => s + d.remaining, 0);
    if (input.amount > totalRemaining) {
      return { kind: 'overpayment', remaining: totalRemaining, currency: input.currency } as const;
    }

    const [tx] = await db
      .insert(transactions)
      .values({
        walletId: input.walletId,
        userId: input.userId,
        type: 'debt_return',
        amount: input.amount,
        currency: input.currency,
        amountUzs,
        fxRateUzs,
        debtId: locked[0]!.id,
        note: input.note ?? null,
        counterparty: locked[0]!.counterparty,
        occurredAt: occurredAtFor(input.date, now, input.timeZone),
        source: input.source,
        rawInput: input.rawInput?.slice(0, 1000) ?? null,
      })
      .returning();

    let left = input.amount;
    const updated: Debt[] = [];
    for (const d of locked) {
      if (left === 0) break;
      const pay = Math.min(left, d.remaining);
      left -= pay;
      await db.insert(debtPayments).values({ debtId: d.id, transactionId: tx!.id, amount: pay, paidAt: tx!.occurredAt, note: input.note ?? null });
      const remaining = d.remaining - pay;
      const [u] = await db
        .update(debts)
        .set({ remaining, status: remaining === 0 ? 'closed' : 'open', closedAt: remaining === 0 ? now : null, updatedAt: now })
        .where(eq(debts.id, d.id))
        .returning();
      updated.push(u!);
    }
    await db.insert(analyticsEvents).values({ userId: input.userId, name: 'transaction_created', props: { source: input.source, type: 'debt_return' } });
    await db.update(schema.users).set({ lastActivityAt: now }).where(eq(schema.users.id, input.userId));
    return {
      kind: 'ok',
      tx: tx!,
      debts: updated,
      remaining: totalRemaining - input.amount,
      currency: input.currency,
      counterparty: locked[0]!.counterparty,
      direction,
    } as const;
  });
}

export interface DebtSummaryRow {
  counterparty: string;
  counterpartyKey: string;
  direction: DebtDirection;
  currency: 'UZS' | 'USD';
  remaining: number;
  total: number;
  nearestDue: string | null;
  debtIds: string[];
  /** Latest debtor @username set on any debt in the group. */
  username: string | null;
  /** True when a Hamyon user with that username exists (reminders can reach them). */
  onBot: boolean;
}

/** Open debts grouped per person, direction and currency (for /qarzlar and web). */
export async function listOpenDebts(db: Database, userId: string, walletId: string): Promise<DebtSummaryRow[]> {
  await assertWalletAccess(db, userId, walletId);
  const rows = await db
    .select()
    .from(debts)
    .where(and(eq(debts.walletId, walletId), eq(debts.status, 'open'), isNull(debts.deletedAt)))
    .orderBy(asc(debts.createdAt));
  const groups = new Map<string, DebtSummaryRow>();
  for (const d of rows) {
    const k = `${d.direction}|${d.counterpartyKey}|${d.currency}`;
    const g = groups.get(k) ?? {
      counterparty: d.counterparty, counterpartyKey: d.counterpartyKey, direction: d.direction, currency: d.currency,
      remaining: 0, total: 0, nearestDue: null, debtIds: [], username: null, onBot: false,
    };
    g.remaining += d.remaining;
    g.total += d.total;
    g.debtIds.push(d.id);
    if (d.dueDate && (!g.nearestDue || d.dueDate < g.nearestDue)) g.nearestDue = d.dueDate;
    if (d.counterpartyUsername) g.username = d.counterpartyUsername; // rows are oldest first → latest wins
    groups.set(k, g);
  }
  const usernames = [...new Set([...groups.values()].map((g) => g.username).filter((u): u is string => !!u))];
  if (usernames.length) {
    const found = await db
      .select({ username: schema.users.username })
      .from(schema.users)
      .where(and(inArray(schema.users.username, usernames), isNull(schema.users.deletionRequestedAt)));
    const onBot = new Set(found.map((f) => f.username));
    for (const g of groups.values()) g.onBot = !!g.username && onBot.has(g.username);
  }
  return [...groups.values()].sort((a, b) => b.remaining - a.remaining);
}

export async function getDebtForUser(db: Database, userId: string, debtId: string): Promise<Debt> {
  if (!/^[0-9a-f-]{36}$/i.test(debtId)) throw new AppError('not_found');
  const [d] = await db.select().from(debts).where(eq(debts.id, debtId));
  if (!d) throw new AppError('not_found');
  await assertWalletAccess(db, userId, d.walletId);
  return d;
}

export async function debtPaymentsOf(db: Database, userId: string, debtId: string) {
  await getDebtForUser(db, userId, debtId);
  return db
    .select()
    .from(debtPayments)
    .where(and(eq(debtPayments.debtId, debtId), isNull(debtPayments.deletedAt)))
    .orderBy(desc(debtPayments.paidAt));
}

/** Changes the due date and/or the debtor's @username; omitted fields stay as they are. */
export async function updateDebtMeta(
  deps: FinanceDeps,
  userId: string,
  debtId: string,
  patch: { dueDate?: string | null; counterpartyUsername?: string | null },
): Promise<Debt> {
  await getDebtForUser(deps.db, userId, debtId);
  const set: Partial<typeof debts.$inferInsert> = { updatedAt: deps.now ? deps.now() : new Date() };
  if (patch.dueDate !== undefined) {
    if (patch.dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) throw new AppError('validation', 'invalid date');
    set.dueDate = patch.dueDate;
  }
  if (patch.counterpartyUsername !== undefined) set.counterpartyUsername = usernameOrThrow(patch.counterpartyUsername);
  const [d] = await deps.db.update(debts).set(set).where(eq(debts.id, debtId)).returning();
  return d!;
}

export function setDebtDueDate(deps: FinanceDeps, userId: string, debtId: string, dueDate: string | null): Promise<Debt> {
  return updateDebtMeta(deps, userId, debtId, { dueDate });
}

/**
 * Deletes a debt event shown on a card:
 * - debt_given/taken: soft-deletes the debt (only if nothing was repaid yet);
 * - debt_return: reverses the payments and restores remaining.
 */
export async function deleteDebtEvent(deps: FinanceDeps, userId: string, txId: string): Promise<Transaction> {
  const now = deps.now ? deps.now() : new Date();
  return deps.db.transaction(async (db) => {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).for('update');
    if (!tx) throw new AppError('not_found');
    await assertWalletAccess(db as unknown as Database, userId, tx.walletId);
    if (tx.deletedAt) return tx;
    if (tx.type === 'debt_given' || tx.type === 'debt_taken') {
      const paid = await db
        .select({ id: debtPayments.id })
        .from(debtPayments)
        .where(and(eq(debtPayments.debtId, tx.debtId!), isNull(debtPayments.deletedAt)));
      if (paid.length) throw new AppError('validation', 'debt has repayments');
      await db.update(debts).set({ deletedAt: now, updatedAt: now }).where(eq(debts.id, tx.debtId!));
    } else if (tx.type === 'debt_return') {
      const pays = await db
        .select()
        .from(debtPayments)
        .where(and(eq(debtPayments.transactionId, tx.id), isNull(debtPayments.deletedAt)));
      for (const p of pays) {
        await db
          .update(debts)
          .set({ remaining: sql`${debts.remaining} + ${p.amount}`, status: 'open', closedAt: null, updatedAt: now })
          .where(eq(debts.id, p.debtId));
        await db.update(debtPayments).set({ deletedAt: now }).where(eq(debtPayments.id, p.id));
      }
    } else {
      throw new AppError('validation', 'not a debt event');
    }
    const [row] = await db.update(transactions).set({ deletedAt: now }).where(eq(transactions.id, tx.id)).returning();
    return row!;
  });
}

/** Undo of deleteDebtEvent within the undo window. */
export async function undoDebtEvent(deps: FinanceDeps, userId: string, txId: string): Promise<{ ok: boolean; tx: Transaction }> {
  const now = deps.now ? deps.now() : new Date();
  return deps.db.transaction(async (db) => {
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId)).for('update');
    if (!tx) throw new AppError('not_found');
    await assertWalletAccess(db as unknown as Database, userId, tx.walletId);
    if (!tx.deletedAt) return { ok: true, tx };
    if (now.getTime() - tx.deletedAt.getTime() > UNDO_WINDOW_MS) return { ok: false, tx };
    if (tx.type === 'debt_given' || tx.type === 'debt_taken') {
      await db.update(debts).set({ deletedAt: null, updatedAt: now }).where(eq(debts.id, tx.debtId!));
    } else {
      const pays = await db.select().from(debtPayments).where(eq(debtPayments.transactionId, tx.id));
      for (const p of pays.filter((x) => x.deletedAt && x.deletedAt.getTime() === tx.deletedAt!.getTime())) {
        const [d] = await db.select().from(debts).where(eq(debts.id, p.debtId)).for('update');
        // Something else was repaid meanwhile: refuse rather than overpay.
        if (!d || d.remaining < p.amount) return { ok: false, tx };
        const remaining = d.remaining - p.amount;
        await db
          .update(debts)
          .set({ remaining, status: remaining === 0 ? 'closed' : 'open', closedAt: remaining === 0 ? now : null, updatedAt: now })
          .where(eq(debts.id, d.id));
        await db.update(debtPayments).set({ deletedAt: null }).where(eq(debtPayments.id, p.id));
      }
    }
    const [row] = await db.update(transactions).set({ deletedAt: null }).where(eq(transactions.id, tx.id)).returning();
    return { ok: true, tx: row! };
  });
}
