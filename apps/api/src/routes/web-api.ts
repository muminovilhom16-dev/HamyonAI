import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PlanConfig } from '@hamyon/config';
import { eq } from 'drizzle-orm';
import {
  AppError,
  DEBT_TYPES,
  budgetStatus,
  monthInsights,
  contributeToGoal,
  createGoal,
  listGoals,
  removeGoal,
  createRecurring,
  listRecurring,
  removeRecurring,
  removeBudget,
  setBudget,
  createCategory,
  createTransaction,
  updateCategory,
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
  cancelAccountDeletion,
  deletionDate,
  exportTransactions,
  requestAccountDeletion,
  type AuthConfig,
  type ExchangeRateProvider,
  type Transaction,
} from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import { renderCsv, renderXlsx } from '../export';
import { t } from '../i18n';
import { requireSession, SESSION_COOKIE } from './auth';

export interface WebApiOptions {
  db: Database;
  auth: AuthConfig;
  fx: ExchangeRateProvider | null;
  now: () => Date;
  deletionGraceDays: number;
  plans: PlanConfig;
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

type CategoryRef = { id: string; name: string; icon: string | null };

function txDto(tx: Transaction, timeZone: string, cats: CategoryRef[]) {
  const cat = tx.categoryId ? cats.find((c) => c.id === tx.categoryId) : undefined;
  const local = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(tx.occurredAt);
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    amountUzs: tx.amountUzs,
    categoryId: tx.categoryId,
    categoryName: cat?.name ?? null,
    categoryIcon: cat?.icon ?? null,
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
      deletionGraceDays: opts.deletionGraceDays,
      deletionScheduledFor: user.deletionRequestedAt
        ? localDate(deletionDate(user.deletionRequestedAt, opts.deletionGraceDays), user.timezone)
        : null,
    };
  });

  // TZ §31: export with a chosen date range.
  app.get('/api/export', { preHandler: session }, async (request, reply) => {
    const q = parse(z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx'), start: date.optional(), end: date.optional() }), request.query);
    const { user, walletId } = await context(opts.db, request);
    const rows = await exportTransactions(opts.db, {
      userId: user.id, walletId, timeZone: user.timezone, language: user.language,
      ...(q.start && { startDate: q.start }), ...(q.end && { endDate: q.end }),
    });
    const body = q.format === 'csv' ? renderCsv(rows, user.language) : await renderXlsx(rows, user.language);
    const name = `hamyon-${q.start ?? 'all'}${q.end ? `_${q.end}` : ''}.${q.format}`;
    return reply
      .header('content-type', q.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${name}"`)
      .header('cache-control', 'no-store')
      .send(body);
  });

  // TZ §40: delete account (grace period, then permanent removal).
  app.post('/api/account/delete', { preHandler: session }, async (request, reply) => {
    const body = parse(z.object({ confirm: z.literal(true) }).strict(), request.body);
    void body;
    const userId = request.auth!.userId;
    await requestAccountDeletion(opts.db, userId, opts.now());
    await opts.db.insert(schema.analyticsEvents).values({ userId, name: 'account_deletion_requested', props: { via: 'web' } });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(202).send({ ok: true });
  });

  app.post('/api/account/cancel-deletion', { preHandler: session }, async (request) => {
    await cancelAccountDeletion(opts.db, request.auth!.userId, opts.now());
    return { ok: true };
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
    const dashboard = await getDashboard(opts.db, {
      userId: user.id, walletId, startDate, endDate, timeZone: user.timezone, language: user.language,
      uncategorizedName: t(user.language, 'uncategorized'),
    });
    // Pace of the current month (only meaningful for the month view).
    const insights = q.period === 'month' ? await monthInsights(opts.db, { userId: user.id, walletId, timeZone: user.timezone, now: fin.now() }) : null;
    return { ...dashboard, insights };
  });

  // ?all=1 includes hidden ones (category management); default is what pickers show.
  app.get('/api/categories', { preHandler: session }, async (request) => {
    const q = parse(z.object({ all: z.enum(['0', '1']).optional() }), request.query);
    const { user, walletId } = await context(opts.db, request);
    const cats = await listWalletCategories(opts.db, walletId, user.language);
    return cats
      .filter((c) => q.all === '1' || !c.isHidden)
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, hidden: c.isHidden, custom: c.key === c.id }));
  });

  app.post('/api/categories', { preHandler: session }, async (request, reply) => {
    const body = parse(
      z.object({ name: z.string().min(1).max(40), kind: z.enum(['expense', 'income']), icon: z.string().max(16).nullable().optional() }).strict(),
      request.body,
    );
    const { user, walletId } = await context(opts.db, request);
    const c = await createCategory(opts.db, user.id, walletId, { ...body, lang: user.language });
    return reply.status(201).send({ id: c.id, name: c.name, kind: c.kind, icon: c.icon, hidden: false, custom: true });
  });

  app.patch<{ Params: { id: string } }>('/api/categories/:id', { preHandler: session }, async (request, reply) => {
    const id = parse(uuid, request.params.id);
    const body = parse(
      z.object({ name: z.string().min(1).max(40).nullable().optional(), icon: z.string().max(16).nullable().optional(), hidden: z.boolean().optional() }).strict(),
      request.body,
    );
    await updateCategory(opts.db, request.auth!.userId, id, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.hidden !== undefined && { isHidden: body.hidden }),
    });
    return reply.status(204).send();
  });

  // ─── Budgets (monthly limits) ───
  app.get('/api/budgets', { preHandler: session }, async (request) => {
    const { user, walletId } = await context(opts.db, request);
    return budgetStatus(opts.db, { userId: user.id, walletId, timeZone: user.timezone, now: fin.now(), lang: user.language });
  });

  app.put('/api/budgets', { preHandler: session }, async (request) => {
    const body = parse(
      z.object({ categoryId: uuid.nullable(), amountUzs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict(),
      request.body,
    );
    const { user, walletId } = await context(opts.db, request);
    const plan = (user.plan in opts.plans ? user.plan : 'free') as keyof typeof opts.plans;
    await setBudget(opts.db, { userId: user.id, walletId, categoryId: body.categoryId, amountUzs: body.amountUzs, maxBudgets: opts.plans[plan].budgets });
    return budgetStatus(opts.db, { userId: user.id, walletId, timeZone: user.timezone, now: fin.now(), lang: user.language });
  });

  app.delete<{ Params: { id: string } }>('/api/budgets/:id', { preHandler: session }, async (request, reply) => {
    await removeBudget(opts.db, request.auth!.userId, parse(uuid, request.params.id));
    return reply.status(204).send();
  });

  // ─── Recurring payments ───
  app.get('/api/recurring', { preHandler: session }, async (request) => {
    const { user, walletId } = await context(opts.db, request);
    return listRecurring(opts.db, { userId: user.id, walletId, timeZone: user.timezone, now: fin.now(), lang: user.language });
  });

  app.post('/api/recurring', { preHandler: session }, async (request, reply) => {
    const body = parse(
      z.object({
        note: z.string().min(1).max(100),
        amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        currency: z.enum(['UZS', 'USD']).optional(),
        categoryId: uuid.nullable(),
        dayOfMonth: z.number().int().min(1).max(28),
      }).strict(),
      request.body,
    );
    const { user, walletId } = await context(opts.db, request);
    await createRecurring(opts.db, { userId: user.id, walletId, ...body, currency: body.currency ?? user.currency });
    return reply.status(201).send(await listRecurring(opts.db, { userId: user.id, walletId, timeZone: user.timezone, now: fin.now(), lang: user.language }));
  });

  app.delete<{ Params: { id: string } }>('/api/recurring/:id', { preHandler: session }, async (request, reply) => {
    await removeRecurring(opts.db, request.auth!.userId, parse(uuid, request.params.id));
    return reply.status(204).send();
  });

  // ─── Savings goals (not expenses) ───
  const goalsOf = (user: { id: string; timezone: string }, walletId: string) =>
    listGoals(opts.db, { userId: user.id, walletId, timeZone: user.timezone, now: fin.now() });

  app.get('/api/goals', { preHandler: session }, async (request) => {
    const { user, walletId } = await context(opts.db, request);
    return goalsOf(user, walletId);
  });

  app.post('/api/goals', { preHandler: session }, async (request, reply) => {
    const body = parse(
      z.object({
        name: z.string().min(1).max(60),
        targetAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        currency: z.enum(['UZS', 'USD']).optional(),
        targetDate: date.nullable().optional(),
      }).strict(),
      request.body,
    );
    const { user, walletId } = await context(opts.db, request);
    await createGoal(opts.db, { userId: user.id, walletId, name: body.name, targetAmount: body.targetAmount, currency: body.currency ?? user.currency, targetDate: body.targetDate ?? null });
    return reply.status(201).send(await goalsOf(user, walletId));
  });

  app.post<{ Params: { id: string } }>('/api/goals/:id/contributions', { preHandler: session }, async (request) => {
    const id = parse(uuid, request.params.id);
    const body = parse(z.object({ amount: z.number().int().refine((n) => n !== 0).refine(Number.isSafeInteger) }).strict(), request.body);
    const { user, walletId } = await context(opts.db, request);
    await contributeToGoal(opts.db, { userId: user.id, goalId: id, amount: body.amount, timeZone: user.timezone, now: fin.now() });
    return goalsOf(user, walletId);
  });

  app.delete<{ Params: { id: string } }>('/api/goals/:id', { preHandler: session }, async (request, reply) => {
    await removeGoal(opts.db, request.auth!.userId, parse(uuid, request.params.id));
    return reply.status(204).send();
  });

  app.get('/api/transactions', { preHandler: session }, async (request) => {
    const q = parse(
      z.object({
        start: date.optional(),
        end: date.optional(),
        type: z.enum(['expense', 'income', 'debt_given', 'debt_taken', 'debt_return']).optional(),
        categoryId: uuid.optional(),
        q: z.string().trim().min(1).max(60).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().max(200).optional(),
      }),
      request.query,
    );
    const { user, walletId } = await context(opts.db, request);
    const cats = await listWalletCategories(opts.db, walletId, user.language);
    const rows = await listTransactions(opts.db, user.id, walletId, {
      timeZone: user.timezone,
      limit: q.limit,
      ...(q.start && { startDate: q.start }),
      ...(q.end && { endDate: q.end }),
      ...(q.type && { type: q.type }),
      ...(q.categoryId && { categoryId: q.categoryId }),
      ...(q.q && {
        search: q.q,
        searchCategoryIds: cats.filter((c) => c.name.toLowerCase().includes(q.q!.toLowerCase())).map((c) => c.id),
      }),
      ...(q.cursor && { before: decodeCursor(q.cursor) }),
    });
    return {
      items: rows.map((r) => txDto(r, user.timezone, cats)),
      nextCursor: rows.length === q.limit ? encodeCursor(rows.at(-1)!) : null,
    };
  });

  // Manual entry from the web panel: expenses and income only (debts go through the bot's debt engine).
  app.post('/api/transactions', { preHandler: session }, async (request, reply) => {
    const body = parse(
      z.object({
        type: z.enum(['expense', 'income']),
        amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        currency: z.enum(['UZS', 'USD']).optional(),
        categoryId: uuid,
        date,
        note: z.string().max(200).nullable().optional(),
      }).strict(),
      request.body,
    );
    const { user, walletId } = await context(opts.db, request);
    if (body.date > localDate(fin.now(), user.timezone)) throw new AppError('validation', 'future date');
    const cats = await listWalletCategories(opts.db, walletId, user.language);
    const cat = cats.find((c) => c.id === body.categoryId);
    if (!cat || cat.kind !== body.type) throw new AppError('validation', 'category');
    const tx = await createTransaction(fin, {
      walletId,
      userId: user.id,
      timeZone: user.timezone,
      tx: {
        type: body.type,
        amount: body.amount,
        currency: body.currency ?? user.currency,
        category_id: cat.id,
        note: body.note?.trim() || null,
        counterparty: null,
        date: body.date,
        confidence: 1,
      },
      source: 'web',
      rawInput: null,
    });
    return reply.status(201).send(txDto(tx, user.timezone, cats));
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
    return txDto(tx, user.timezone, cats);
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
