import { InlineKeyboard, type Api, type RawApi } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import { claimProactive, dueDebtorReminders, dueDebtReminders, markProactiveFailed, type DueDebtorReminder, type DueDebtReminder } from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import { formatDay, formatMoney } from './format';
import { t, tf } from './i18n';

export interface ReminderDeps {
  db: Database;
  api: Api<RawApi>;
  log: FastifyBaseLogger;
  maxPerDay: number;
  now?: () => Date;
  /** Gap between sends; Telegram allows ~30 msg/s overall. */
  sendGapMs?: number;
}

export function debtReminderText(r: DueDebtReminder): string {
  const key =
    r.kind === 'due_today'
      ? r.direction === 'given' ? 'reminderDueTodayGiven' : 'reminderDueTodayTaken'
      : r.direction === 'given' ? 'reminderDueSoonGiven' : 'reminderDueSoonTaken';
  return tf(r.language, key, {
    name: r.counterparty,
    amount: formatMoney(r.remaining, r.currency, r.language),
    date: formatDay(r.dueDate, r.language),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The debtor's message: who they owe, how much, due today; with an opt-out button. */
export function debtorReminderText(r: DueDebtorReminder): string {
  return tf(r.debtorLanguage, 'reminderDebtorDueToday', {
    name: r.lenderName,
    amount: formatMoney(r.remaining, r.currency, r.debtorLanguage),
  });
}

type Outcome = 'sent' | 'skipped' | 'failed';

/** Claims a proactive slot for `userId`, sends, and records the outcome. */
async function deliverOnce(
  deps: ReminderDeps,
  now: Date,
  claim: { userId: string; timeZone: string; dedupeKey: string; payload: unknown },
  send: () => Promise<unknown>,
): Promise<Outcome> {
  const id = await claimProactive(deps.db, { kind: 'debt_due', maxPerDay: deps.maxPerDay, now, ...claim });
  if (!id) return 'skipped';
  try {
    await send();
    await deps.db.insert(schema.analyticsEvents).values({ userId: claim.userId, name: 'reminder_sent', props: { kind: 'debt_due' } });
    return 'sent';
  } catch (err) {
    // E.g. the user blocked the bot. Not counted toward the daily cap.
    await markProactiveFailed(deps.db, id);
    deps.log.warn({ err: err instanceof Error ? err.message : 'send failed' }, 'reminder delivery failed');
    return 'failed';
  } finally {
    if (deps.sendGapMs !== 0) await sleep(deps.sendGapMs ?? 40);
  }
}

/**
 * Sends due debt reminders once each, within each user's daily cap:
 * first to debtors who use the bot (when the lender attached their @username),
 * then to lenders — whose due-today message says the debtor was reminded too.
 */
export async function sendDebtReminders(deps: ReminderDeps): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = deps.now ? deps.now() : new Date();
  const stats = { sent: 0, skipped: 0, failed: 0 };

  const remindedDebtors = new Map<string, string>(); // debtId → @username
  for (const r of await dueDebtorReminders(deps.db, now)) {
    const outcome = await deliverOnce(
      deps,
      now,
      { userId: r.debtorUserId, timeZone: r.debtorTimeZone, dedupeKey: `debtor:${r.debtId}:${r.dueDate}`, payload: { debtId: r.debtId, debtor: true } },
      () =>
        deps.api.sendMessage(r.debtorTelegramId, debtorReminderText(r), {
          reply_markup: new InlineKeyboard().text(t(r.debtorLanguage, 'debtorOptOut'), 'dro:off'),
        }),
    );
    stats[outcome]++;
    if (outcome === 'sent') remindedDebtors.set(r.debtId, r.debtorUsername);
  }

  for (const r of await dueDebtReminders(deps.db, now)) {
    const debtor = r.kind === 'due_today' ? remindedDebtors.get(r.debtId) : undefined;
    const text = debtor ? `${debtReminderText(r)}\n${tf(r.language, 'reminderDebtorAlsoSent', { username: debtor })}` : debtReminderText(r);
    const outcome = await deliverOnce(
      deps,
      now,
      { userId: r.userId, timeZone: r.timeZone, dedupeKey: `debt:${r.debtId}:${r.kind}:${r.dueDate}`, payload: { debtId: r.debtId, kind: r.kind } },
      () => deps.api.sendMessage(r.telegramId, text),
    );
    stats[outcome]++;
  }
  return stats;
}

/** In-process schedule (every 10 minutes) until the queue (Phase 6) takes over. */
export function scheduleReminders(deps: ReminderDeps, intervalMs = 600_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const stats = await sendDebtReminders(deps);
      if (stats.sent || stats.failed) deps.log.info({ reminders: stats }, 'debt reminders');
    } catch (err) {
      deps.log.error({ err }, 'reminder tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
