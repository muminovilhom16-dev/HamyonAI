import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { AppError } from '../errors';
import { foldWord } from '../parser/normalize';
import { getTransactionForUser, type Transaction } from './transactions';

const { accounts, transactions } = schema;

export const MAX_ACCOUNTS_PER_WALLET = 10;
export type AccountKind = 'cash' | 'card';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: 'UZS' | 'USD';
  openingBalance: number;
  isDefault: boolean;
  archived: boolean;
  /** opening + income − expenses recorded on this account. */
  balance: number;
}

// ─── Text hints: "kartadan", "naqd", "humo"… ────────────────────────────────

const CARD_WORDS = ['karta', 'kartadan', 'kartaga', 'kartam', 'kartamdan', 'humo', 'humodan', 'uzcard', 'uzkard', 'uzcarddan', 'visa', 'plastik', 'plastikdan', 'карта', 'картой', 'карты', 'карту', 'картадан', 'хумо', 'узкард'];
const CASH_WORDS = ['naqd', 'naqdga', 'naqddan', 'naxt', 'naqt', 'наличные', 'наличными', 'нал', 'налом', 'нақд'];
const CARD = new Set(CARD_WORDS.map(foldWord));
const CASH = new Set(CASH_WORDS.map(foldWord));
const words = (text: string) => text.toLowerCase().split(/[^\p{L}'ʻʼ‘’]+/u).filter(Boolean);

/** "taksi 20 ming kartadan" → card; "naqd" → cash; both or none → null. */
export function accountHint(text: string): AccountKind | null {
  const folded = words(text).map(foldWord);
  const card = folded.some((w) => CARD.has(w));
  const cash = folded.some((w) => CASH.has(w));
  return card === cash ? null : card ? 'card' : 'cash';
}

/** Removes the payment-method words from a note ("Taksi kartadan" → "Taksi"). */
export function stripAccountWords(note: string | null): string | null {
  if (!note) return note;
  const kept = note.split(/\s+/).filter((w) => {
    const f = foldWord(w.toLowerCase().replace(/[^\p{L}'ʻʼ‘’]/gu, ''));
    return !CARD.has(f) && !CASH.has(f) && f !== 'bilan' && f !== 'pul';
  });
  const out = kept.join(' ').trim();
  return out ? out[0]!.toUpperCase() + out.slice(1) : null;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createAccount(
  db: Database,
  input: { userId: string; walletId: string; name: string; kind: AccountKind; currency?: 'UZS' | 'USD'; openingBalance?: number },
): Promise<string> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new AppError('validation', 'name');
  const opening = input.openingBalance ?? 0;
  if (!Number.isSafeInteger(opening)) throw new AppError('validation', 'balance');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`accounts:${input.walletId}`}))`);
    const existing = await tx.select({ id: accounts.id, isDefault: accounts.isDefault }).from(accounts).where(and(eq(accounts.walletId, input.walletId), eq(accounts.archived, false)));
    if (existing.length >= MAX_ACCOUNTS_PER_WALLET) throw new AppError('validation', 'too many');
    const [row] = await tx
      .insert(accounts)
      .values({
        walletId: input.walletId,
        name,
        kind: input.kind,
        currency: input.currency ?? 'UZS',
        openingBalance: opening,
        isDefault: !existing.some((a) => a.isDefault),
      })
      .returning({ id: accounts.id });
    return row!.id;
  });
}

export async function listAccounts(db: Database, input: { userId: string; walletId: string; includeArchived?: boolean }): Promise<Account[]> {
  await assertWalletAccess(db, input.userId, input.walletId);
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.walletId, input.walletId), input.includeArchived ? undefined : eq(accounts.archived, false)))
    .orderBy(desc(accounts.isDefault), asc(accounts.createdAt));
  if (rows.length === 0) return [];
  // In the account's own currency: UZS accounts sum so'm values, USD accounts sum dollar amounts.
  const sums = await db
    .select({
      accountId: transactions.accountId,
      uzs: sql<string>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountUzs} else -${transactions.amountUzs} end), 0)`,
      usd: sql<string>`coalesce(sum(case when ${transactions.currency} = 'USD' then (case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end) else 0 end), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.walletId, input.walletId), isNull(transactions.deletedAt), sql`${transactions.type} in ('income', 'expense')`, sql`${transactions.accountId} is not null`))
    .groupBy(transactions.accountId);
  const byId = new Map(sums.map((s) => [s.accountId, s]));
  return rows.map((a) => {
    const s = byId.get(a.id);
    const delta = s ? Number(a.currency === 'USD' ? s.usd : s.uzs) : 0;
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      openingBalance: a.openingBalance,
      isDefault: a.isDefault,
      archived: a.archived,
      balance: a.openingBalance + delta,
    };
  });
}

async function loadOwned(db: Database, userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('not_found');
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!row) throw new AppError('not_found');
  await assertWalletAccess(db, userId, row.walletId);
  return row;
}

/** Rename, change opening balance, make default, archive (history keeps the link). */
export async function updateAccount(
  db: Database,
  userId: string,
  id: string,
  patch: { name?: string; openingBalance?: number; isDefault?: true; archived?: boolean },
): Promise<void> {
  const row = await loadOwned(db, userId, id);
  const set: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) throw new AppError('validation', 'name');
    set.name = name;
  }
  if (patch.openingBalance !== undefined) {
    if (!Number.isSafeInteger(patch.openingBalance)) throw new AppError('validation', 'balance');
    set.openingBalance = patch.openingBalance;
  }
  if (patch.archived !== undefined) set.archived = patch.archived;
  await db.transaction(async (tx) => {
    if (patch.isDefault || (patch.archived && row.isDefault)) {
      await tx.update(accounts).set({ isDefault: false }).where(eq(accounts.walletId, row.walletId));
    }
    if (patch.isDefault) set.isDefault = true;
    if (patch.archived) set.isDefault = false;
    await tx.update(accounts).set(set).where(eq(accounts.id, id));
    // Archiving the default hands the role to the oldest remaining account.
    if (patch.archived && row.isDefault) {
      const [next] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.walletId, row.walletId), eq(accounts.archived, false)))
        .orderBy(asc(accounts.createdAt))
        .limit(1);
      if (next) await tx.update(accounts).set({ isDefault: true }).where(eq(accounts.id, next.id));
    }
  });
}

/** Account for a new record: the hinted kind (default first), else the default account; null without accounts. */
export async function accountForNewRecord(db: Database, walletId: string, hint: AccountKind | null): Promise<string | null> {
  const rows = await db
    .select({ id: accounts.id, kind: accounts.kind, isDefault: accounts.isDefault })
    .from(accounts)
    .where(and(eq(accounts.walletId, walletId), eq(accounts.archived, false)))
    .orderBy(desc(accounts.isDefault), asc(accounts.createdAt));
  if (hint) return rows.find((a) => a.kind === hint)?.id ?? rows[0]?.id ?? null;
  return rows.find((a) => a.isDefault)?.id ?? null;
}

/** Moves a record to another account (or none). Debts are not tied to accounts. */
export async function setTransactionAccount(db: Database, userId: string, txId: string, accountId: string | null): Promise<Transaction> {
  const tx = await getTransactionForUser(db, userId, txId);
  if (tx.type !== 'expense' && tx.type !== 'income') throw new AppError('validation', 'type');
  if (accountId) {
    const acc = await loadOwned(db, userId, accountId);
    if (acc.walletId !== tx.walletId || acc.archived) throw new AppError('validation', 'account');
  }
  const [row] = await db.update(transactions).set({ accountId, updatedAt: new Date() }).where(eq(transactions.id, tx.id)).returning();
  return row!;
}
