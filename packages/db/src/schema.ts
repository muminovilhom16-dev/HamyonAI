import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Money rule (TZ §30, §37): every amount is a BIGINT in minor-less units
 * (whole so'm, whole dollars). Never floating point. `mode: 'number'` is safe
 * because values are validated with Number.isSafeInteger at the boundary.
 */
const money = (name: string) => bigint(name, { mode: 'number' });

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const languageEnum = pgEnum('language', ['uz_latn', 'uz_cyrl', 'ru']);
export const currencyEnum = pgEnum('currency', ['UZS', 'USD']);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'expense',
  'income',
  'debt_given',
  'debt_taken',
  'debt_return',
]);
export const transactionSourceEnum = pgEnum('transaction_source', [
  'text',
  'voice',
  'receipt',
  'bank_forward',
  'web',
]);
export const categoryKindEnum = pgEnum('category_kind', ['expense', 'income']);
export const accountKindEnum = pgEnum('account_kind', ['cash', 'card']);
export const categoryStatusEnum = pgEnum('category_status', ['final', 'pending']);
export const walletKindEnum = pgEnum('wallet_kind', ['personal', 'family']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'member']);
export const debtDirectionEnum = pgEnum('debt_direction', ['given', 'taken']);
export const debtStatusEnum = pgEnum('debt_status', ['open', 'closed']);
export const reminderKindEnum = pgEnum('reminder_kind', [
  'daily',
  'weekly_report',
  'monthly_report',
  'debt_due',
  'reactivation',
  'budget_alert',
  'recurring_due',
]);
export const reminderStatusEnum = pgEnum('reminder_status', ['scheduled', 'sent', 'skipped', 'failed']);

// ─── Users & wallets ────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Telegram user id. Internal only: never sent to AI providers (TZ §39).
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  displayName: text('display_name'),
  // Telegram @username, lowercase, without "@". Lets a lender's debt reminder
  // reach this user when they are the debtor.
  username: text('username'),
  /** Debtor-side opt-out of reminders sent on behalf of other users' debts. */
  debtRemindersFromOthers: boolean('debt_reminders_from_others').notNull().default(true),
  /** Version of the reply-keyboard menu this user has been sent (re-sent when it changes). */
  menuVersion: integer('menu_version').notNull().default(0),
  language: languageEnum('language').notNull().default('uz_latn'),
  currency: currencyEnum('currency').notNull().default('UZS'),
  timezone: text('timezone').notNull().default('Asia/Tashkent'),
  reminderTime: time('reminder_time').notNull().default('21:00'),
  remindersEnabled: boolean('reminders_enabled').notNull().default(true),
  onboardingStep: text('onboarding_step'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  plan: text('plan').notNull().default('free'),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('users_username_idx').on(t.username).where(sql`${t.username} is not null`)]);

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: walletKindEnum('kind').notNull().default('personal'),
  name: text('name'),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  baseCurrency: currencyEnum('base_currency').notNull().default('UZS'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  // One personal wallet per user; family wallets are v2.
  uniqueIndex('wallets_one_personal_per_user').on(t.ownerUserId).where(sql`${t.kind} = 'personal'`),
]);

export const walletMembers = pgTable('wallet_members', {
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp('left_at', { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.walletId, t.userId] }),
  index('wallet_members_user_idx').on(t.userId),
]);

// ─── Categories ─────────────────────────────────────────────────────────────

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  // Stable key of a system category ("transport"); null for user-created ones.
  slug: text('slug'),
  // Custom name or user rename. Null means: localized system name for `slug`.
  name: text('name'),
  kind: categoryKindEnum('kind').notNull().default('expense'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('categories_wallet_slug_uq').on(t.walletId, t.slug).where(sql`${t.slug} is not null`),
  check('categories_slug_or_name', sql`${t.slug} is not null or ${t.name} is not null`),
]);

export const categoryRules = pgTable('category_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  // Normalized keyword/pattern (lowercase, Latin-transliterated).
  pattern: text('pattern').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  hits: integer('hits').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('category_rules_user_wallet_pattern_uq').on(t.userId, t.walletId, t.pattern)]);

// ─── Debts ──────────────────────────────────────────────────────────────────

export const debts = pgTable('debts', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  counterparty: text('counterparty').notNull(),
  // Normalized name used to match "Murod aka" ≈ "murod aka" ≈ "Мурод ака".
  counterpartyKey: text('counterparty_key').notNull(),
  // Debtor's Telegram @username (lowercase, no "@"); a reminder reaches them
  // on the due date only if they use the bot under this username.
  counterpartyUsername: text('counterparty_username'),
  direction: debtDirectionEnum('direction').notNull(),
  total: money('total').notNull(),
  remaining: money('remaining').notNull(),
  currency: currencyEnum('currency').notNull(),
  dueDate: date('due_date'),
  // Installment schedule (v2). Kept nullable so MVP rows need no migration later.
  schedule: jsonb('schedule'),
  status: debtStatusEnum('status').notNull().default('open'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  /** Soft delete of a mistaken debt (undo window, then purge). */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  check('debts_total_positive', sql`${t.total} > 0`),
  check('debts_remaining_range', sql`${t.remaining} >= 0 and ${t.remaining} <= ${t.total}`),
  check('debts_counterparty_username_format', sql`${t.counterpartyUsername} is null or ${t.counterpartyUsername} ~ '^[a-z0-9_]{5,32}$'`),
  index('debts_wallet_open_idx').on(t.walletId, t.counterpartyKey).where(sql`${t.status} = 'open'`),
]);

// ─── Exchange rates ─────────────────────────────────────────────────────────

export const exchangeRates = pgTable('exchange_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  currency: currencyEnum('currency').notNull(),
  rateDate: date('rate_date').notNull(),
  // UZS per 1 unit. A rate, not money, so exact decimal (never float).
  rateUzs: numeric('rate_uzs', { precision: 14, scale: 2 }).notNull(),
  source: text('source').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('exchange_rates_currency_date_uq').on(t.currency, t.rateDate),
  check('exchange_rates_positive', sql`${t.rateUzs} > 0`),
]);

// ─── Transactions ───────────────────────────────────────────────────────────

/**
 * Where the money is: cash or a card (Humo, Uzcard, Visa...). Optional — a
 * transaction without an account still counts everywhere else. Balance =
 * opening balance + income − expenses recorded on the account.
 */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: accountKindEnum('kind').notNull(),
  currency: currencyEnum('currency').notNull().default('UZS'),
  openingBalance: money('opening_balance').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('accounts_wallet_idx').on(t.walletId),
  uniqueIndex('accounts_wallet_default_uq').on(t.walletId).where(sql`${t.isDefault}`),
]);

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  amount: money('amount').notNull(),
  currency: currencyEnum('currency').notNull(),
  // Frozen at creation; later rate changes never touch history (TZ §38).
  amountUzs: money('amount_uzs').notNull(),
  fxRateUzs: numeric('fx_rate_uzs', { precision: 14, scale: 2 }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  categoryStatus: categoryStatusEnum('category_status').notNull().default('final'),
  debtId: uuid('debt_id').references(() => debts.id, { onDelete: 'set null' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  note: text('note'),
  counterparty: text('counterparty'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  source: transactionSourceEnum('source').notNull(),
  // Must be PII-masked (card numbers etc.) before persistence.
  rawInput: text('raw_input'),
  aiConfidence: doublePrecision('ai_confidence'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  check('transactions_amount_positive', sql`${t.amount} > 0 and ${t.amountUzs} > 0`),
  check(
    'transactions_fx_rate_required',
    sql`(${t.currency} = 'UZS' and ${t.amount} = ${t.amountUzs}) or (${t.currency} <> 'UZS' and ${t.fxRateUzs} is not null)`,
  ),
  check(
    'transactions_debt_link',
    sql`${t.type} in ('debt_given','debt_taken','debt_return') or ${t.debtId} is null`,
  ),
  check(
    'transactions_debt_no_category',
    sql`${t.type} not in ('debt_given','debt_taken','debt_return') or ${t.categoryId} is null`,
  ),
  check(
    'transactions_confidence_range',
    sql`${t.aiConfidence} is null or (${t.aiConfidence} >= 0 and ${t.aiConfidence} <= 1)`,
  ),
  index('transactions_wallet_occurred_idx').on(t.walletId, t.occurredAt).where(sql`${t.deletedAt} is null`),
  index('transactions_user_created_idx').on(t.userId, t.createdAt),
  index('transactions_deleted_idx').on(t.deletedAt).where(sql`${t.deletedAt} is not null`),
]);

export const debtPayments = pgTable('debt_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  debtId: uuid('debt_id')
    .notNull()
    .references(() => debts.id, { onDelete: 'cascade' }),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  amount: money('amount').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  note: text('note'),
  createdAt: createdAt(),
  /** Reversed (deleted) repayment; remaining was restored. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  check('debt_payments_amount_positive', sql`${t.amount} > 0`),
  index('debt_payments_debt_idx').on(t.debtId),
]);

// ─── Reminders, AI usage, analytics ─────────────────────────────────────────

export const reminders = pgTable('reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: reminderKindEnum('kind').notNull(),
  // Prevents sending the same proactive message twice (e.g. "daily:2026-10-01").
  dedupeKey: text('dedupe_key').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
  status: reminderStatusEnum('status').notNull().default('scheduled'),
  payload: jsonb('payload'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('reminders_user_dedupe_uq').on(t.userId, t.dedupeKey),
  index('reminders_user_sent_idx').on(t.userId, t.sentAt),
  index('reminders_due_idx').on(t.scheduledFor).where(sql`${t.status} = 'scheduled'`),
]);

export const aiUsageLog = pgTable('ai_usage_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  feature: text('feature').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  // Integer micro-dollars to avoid float cost accounting.
  costUsdMicros: bigint('cost_usd_micros', { mode: 'number' }).notNull().default(0),
  latencyMs: integer('latency_ms'),
  success: boolean('success').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('ai_usage_user_created_idx').on(t.userId, t.createdAt)]);

export const analyticsEvents = pgTable('analytics_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  props: jsonb('props'),
  createdAt: createdAt(),
}, (t) => [index('analytics_events_name_created_idx').on(t.name, t.createdAt)]);

// ─── Web auth ───────────────────────────────────────────────────────────────

/** One-time /web login links. Only the HMAC of the token is stored. */
export const webLoginTokens = pgTable('web_login_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const webSessions = pgTable('web_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index('web_sessions_user_idx').on(t.userId)]);

// ─── Telegram idempotency ───────────────────────────────────────────────────

/** Telegram re-delivers updates on webhook failure; this prevents double-saving. */
export const processedUpdates = pgTable('processed_updates', {
  updateId: bigint('update_id', { mode: 'number' }).primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Pending inputs ─────────────────────────────────────────────────────────

export const pendingKindEnum = pgEnum('pending_kind', [
  'confirm_amount',
  'confirm_category',
  'ask_person_kind',
  'ask_amount',
  'edit_amount',
  'ask_counterparty',
  'ask_debt_direction',
  'budget_amount',
  'recurring_text',
  'recurring_day',
  'goal_text',
  'goal_amount',
  'goal_pick',
  'account_text',
]);

/**
 * Parsed input waiting for the user (amount/category/type clarification).
 * Nothing here is a transaction yet: unconfirmed data never reaches
 * `transactions` (TZ §7). Expired rows are purged.
 */
export const pendingInputs = pgTable('pending_inputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  kind: pendingKindEnum('kind').notNull(),
  payload: jsonb('payload').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('pending_inputs_user_open_idx').on(t.userId, t.createdAt).where(sql`${t.resolvedAt} is null`)]);

/**
 * Monthly spending limit (TZ v1: budgets). `category_id` null = limit on all
 * expenses. Amounts in so'm; months follow the user's time zone.
 */
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  amountUzs: money('amount_uzs').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('budgets_wallet_category_uq').on(t.walletId, t.categoryId).where(sql`${t.categoryId} is not null`),
  uniqueIndex('budgets_wallet_total_uq').on(t.walletId).where(sql`${t.categoryId} is null`),
  check('budgets_amount_positive', sql`${t.amountUzs} > 0`),
]);

/**
 * Regular payments (internet, kommunal, kredit, obunalar). On `day_of_month`
 * the bot asks "paid?"; one tap records the expense. `last_handled_month`
 * (YYYY-MM) makes paying/skipping idempotent per month.
 */
export const recurringPayments = pgTable('recurring_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  amount: money('amount').notNull(),
  currency: currencyEnum('currency').notNull().default('UZS'),
  note: text('note').notNull(),
  dayOfMonth: integer('day_of_month').notNull(),
  lastHandledMonth: text('last_handled_month'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('recurring_wallet_idx').on(t.walletId),
  check('recurring_day_range', sql`${t.dayOfMonth} between 1 and 28`),
  check('recurring_amount_positive', sql`${t.amount} > 0`),
]);

/**
 * Savings goals. Money put aside is NOT an expense (like debts): it lives
 * only here, so spending reports stay true. `saved_amount` is the running
 * sum of `goal_contributions`, updated in the same transaction.
 */
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: money('target_amount').notNull(),
  currency: currencyEnum('currency').notNull().default('UZS'),
  savedAmount: money('saved_amount').notNull().default(0),
  targetDate: date('target_date', { mode: 'string' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('goals_wallet_idx').on(t.walletId),
  check('goals_target_positive', sql`${t.targetAmount} > 0`),
  check('goals_saved_non_negative', sql`${t.savedAmount} >= 0`),
]);

export const goalContributions = pgTable('goal_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => goals.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  // Negative = taken back out of the goal.
  amount: money('amount').notNull(),
  createdAt: createdAt(),
}, (t) => [index('goal_contributions_goal_idx').on(t.goalId), check('goal_contributions_non_zero', sql`${t.amount} <> 0`)]);
