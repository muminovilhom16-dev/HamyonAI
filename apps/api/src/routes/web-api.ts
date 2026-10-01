import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  AppError,
  DEBT_TYPES,
  addDays,
  debtPaymentsOf,
  deleteDebtEvent,
  getDashboard,
  getDebtForUser,
  getTransactionForUser,
  listOpenDebts,
  listTransactions,
  listWalletCategories,
  localDate,
  periodRange,
  personalWalletId,
  setDebtDueDate,
  softDeleteTransaction,
  undoDebtEvent,
  undoDelete,
  updateTransaction,
  updateUserSettings,
  type AuthConfig,
  type ExchangeRateProvider,
  type Transaction,
} from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import { t } from '../i18n';
import { requireSession } from './auth';

export interface WebApiOptions {
  db: Database;
  auth: AuthConfig;
  fx: ExchangeRateProvider | null;
  now: () => Date;
}

/** Custom header a cross-site form cannot send: CSRF guard for mutations. */
export const CSRF_HEADER = 'x-hamyon-csrf';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

function parse<T extends z.ZodTypeAny>(schemaDef: T, value: unknown): z.infer<T> {
  const r = schemaDef.safeParse(value);
  if (!r.success) throw new AppError('validation');
  return r.data;
}

async function context(db: Database, request: FastifyRequest) {
  const userId = request.auth!.userId;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new AppError('unauthorized');
  return { user, walletId: await personalWalletId(db, userId) };
}

function txDto(tx: Transaction, timeZone: string, categoryName: (id: string | null) => string | null) {
  const local = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(tx.occurredAt);
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    amountUzs: tx.amountUzs,
    categoryId: tx.categoryId,
    categoryName: categoryName(tx.categoryId),
    categoryPending: tx.categoryStatus === 'pending',
    note: tx.note,
    counterparty: tx.counterparty,
    date: localDate(tx.occurredAt, timeZone),
    time: local,
    source: tx.source,
  };
}

const encodeCursor = (tx: Transaction) => Buffer.from(`${tx.occurredAt.toISOString()}|${tx.id}`).toString('base64url');
function decodeCursor(c: string | undefined) {
  if (!c) return undefined;
  const [iso, id] = Buffer.from(c, 'base64url').toString().split('|');
  const occurredAt = new Date(iso ?? '');
  if (Number.isNaN(occurredAt.getTime()) || !uuid.safeParse(id).success) throw new AppError('validation');
  return { occurredAt, id: id! };
}

export function webApiRoutes(app: FastifyInstance, opts: WebApiOptions): void {
  const session = requireSession(opts);
  const fin = { db: opts.db, fx: opts.fx, now: opts.now };

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (request.headers[CSRF_HEADER] !== '1') throw new AppError('forbidden');
  });

  app.get('/api/settings', { preHandler: session }, async (request) => {
    const { user } = await context(opts.db, request);
    return {
      displayName: user.displayName,
      language: user.language,
      currency: user.currency,
      timezone: user.timezone,
      reminderTime: user.reminderTime.slice(0, 5),
      remindersEnabled: user.remindersEnabled,
    };
  });

  app.patch('/api/settings', { preHandler: session }, async (request) => {
    const body = parse(
      z.object({
        language: z.enum(['uz_latn', 'uz_cyrl', 'ru']).optional(),
        currency: z.enum(['UZS', 'USD']).optional(),
        reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
        remindersEnabled: z.boolean().optional(),
      }).strict(),
      request.body,
    );
    const u = await updateUserSettings(opts.db, request.auth!.userId, body);
    return { language: u.language, currency: u.currency, reminderTime: u.reminderTime.slice(0, 5), remindersEnabled: u.remindersEnabled };
  });

  app.get('/api/dashboard', { preHandler: session }, async (request) => {
    const q = parse(
      z.object({ period: z.enum(['day', 'week', 'month', 'custom']).default('month'), start: date.optional(), end: date.optional() }),
      request.query,
    );
    const { user, walletId } = await context(opts.db, request);
    let startDate: string;
    let endDate: string;
    if (q.period === 'custom') {
      if (!q.start || !q.end || q.start > q.end || addDays(q.start, 366) < q.end) throw new AppError('validation');
      [startDate, endDate] = [q.start, q.end];
    } else {
      ({ startDate, endDate } = periodRange(q.period, opts.now(), user.timezone));
    }
    return getDashboard(opts.db, {
      userId: user.id, walletId, startDate, endDate, timeZone: user.timezone, language: user.language,
      uncategorizedName: t(user.language, 'uncategorized'),
    });
  });

  app.get('/api/categories', { preHandler: session }, async (request) => {
    const { user, walletId } = await context(opts.db, request);
    const cats = await listWalletCategories(opts.db, walletId, user.language);
    return cats.filter((c) => !c.isHidden).map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon }));
  });

  app.get('/api/transactions', { preHandler: session }, async (request) => {
    const q = parse(
      z.object({
        start: date.optional(),
        end: date.optional(),
        type: z.enum(['expense', 'income', 'debt_given', 'debt_taken', 'debt_return']).optional(),
        categoryId: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().max(200).optional(),
      }),
      request.query,
    );
    const { user, walletId } = await context(opts.db, request);
    const cats = await listWalletCategories(opts.db, walletId, user.language);
    const name = (id: string | null) => cats.find((c) => c.id === id)?.name ?? null;
    const rows = await listTransactions(opts.db, user.id, walletId, {
      timeZone: user.timezone,
      limit: q.limit,
      ...(q.start && { startDate: q.start }),
      ...(q.end && { endDate: q.end }),
      ...(q.type && { type: q.type }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.cursor && { before: decodeCursor(q.cursor) }),
    });
    return {
      items: rows.map((r) => txDto(r, user.timezone, name)),
      nextCursor: rows.length === q.limit ? encodeCursor(rows.at(-1)!) : null,
    };
  });

  app.patch<{ Params: { id: string } }>('/api/transactions/:id', { preHandler: session }, async (request) => {
    const id = parse(uuid, request.params.id);
    const body = parse(
      z.object({
        amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
        categoryId: uuid.optional(),
        date: date.optional(),
        note: z.string().max(200).nullable().optional(),
      }).strict(),
      request.body,
    );
    const { user, walletId } = await context(opts.db, request);
    const tx = await updateTransaction(
      fin,
      user.id,
      id,
      {
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.categoryId !== undefined && { categoryKey: body.categoryId }),
        ...(body.date !== undefined && { date: body.date }),
        ...(body.note !== undefined && { note: body.note }),
      },
      user.timezone,
    );
    const cats = await listWalletCategories(opts.db, walletId, user.language);
    return txDto(tx, user.timezone, (cid) => cats.find((c) => c.id === cid)?.name ?? null);
  });

  // Delete (soft) — debts go through the debt engine so balances stay right.
  app.delete<{ Params: { id: string } }>('/api/transactions/:id', { preHandler: session }, async (request, reply) => {
    const id = parse(uuid, request.params.id);
    const userId = request.auth!.userId;
    const tx = await getTransactionForUser(opts.db, userId, id);
    if (DEBT_TYPES.has(tx.type)) await deleteDebtEvent(fin, userId, id);
    else await softDeleteTransaction(fin, userId, id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/transactions/:id/restore', { preHandler: session }, async (request) => {
    const id = parse(uuid, request.params.id);
    const userId = request.auth!.userId;
    const tx = await getTransactionForUser(opts.db, userId, id);
    const r = DEBT_TYPES.has(tx.type) ? await undoDebtEvent(fin, userId, id) : await undoDelete(fin, userId, id);
    if (!r.ok) throw new AppError('link_expired');
    return { ok: true };
  });

  app.get('/api/debts', { preHandler: session }, async (request) => {
    const { user, walletId } = await context(opts.db, request);
    const groups = await listOpenDebts(opts.db, user.id, walletId);
    return Promise.all(
      groups.map(async (g) => ({
        counterparty: g.counterparty,
        direction: g.direction,
        currency: g.currency,
        remaining: g.remaining,
        total: g.total,
        nearestDue: g.nearestDue,
        debts: await Promise.all(
          g.debtIds.map(async (id) => {
            const d = await getDebtForUser(opts.db, user.id, id);
            const payments = await debtPaymentsOf(opts.db, user.id, id);
            return {
              id: d.id, total: d.total, remaining: d.remaining, dueDate: d.dueDate,
              createdDate: localDate(d.createdAt, user.timezone),
              payments: payments.map((p) => ({ amount: p.amount, date: localDate(p.paidAt, user.timezone) })),
            };
          }),
        ),
      })),
    );
  });

  app.patch<{ Params: { id: string } }>('/api/debts/:id', { preHandler: session }, async (request) => {
    const id = parse(uuid, request.params.id);
    const body = parse(z.object({ dueDate: date.nullable() }).strict(), request.body);
    const d = await setDebtDueDate(fin, request.auth!.userId, id, body.dueDate);
    return { id: d.id, dueDate: d.dueDate };
  });
}
