import type { Api, RawApi } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import { claimProactive, dueDebtReminders, markProactiveFailed, type DueDebtReminder } from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import { formatDay, formatMoney } from './format';
import { tf } from './i18n';

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

/** Sends due debt reminders once each, within the per-user daily cap. */
export async function sendDebtReminders(deps: ReminderDeps): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = deps.now ? deps.now() : new Date();
  const due = await dueDebtReminders(deps.db, now);
  const stats = { sent: 0, skipped: 0, failed: 0 };
  for (const r of due) {
    const id = await claimProactive(deps.db, {
      userId: r.userId,
      kind: 'debt_due',
      dedupeKey: `debt:${r.debtId}:${r.kind}:${r.dueDate}`,
      timeZone: r.timeZone,
      maxPerDay: deps.maxPerDay,
      now,
      payload: { debtId: r.debtId, kind: r.kind },
    });
    if (!id) {
      stats.skipped++;
      continue;
    }
    try {
      await deps.api.sendMessage(r.telegramId, debtReminderText(r));
      await deps.db.insert(schema.analyticsEvents).values({ userId: r.userId, name: 'reminder_sent', props: { kind: 'debt_due' } });
      stats.sent++;
    } catch (err) {
      // E.g. the user blocked the bot. Not counted toward the daily cap.
      await markProactiveFailed(deps.db, id);
      deps.log.warn({ err: err instanceof Error ? err.message : 'send failed' }, 'reminder delivery failed');
      stats.failed++;
    }
    if (deps.sendGapMs !== 0) await sleep(deps.sendGapMs ?? 40);
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
