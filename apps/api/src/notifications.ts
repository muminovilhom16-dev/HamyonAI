import { InlineKeyboard, type Api, type RawApi } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import {
  addDays,
  claimProactive,
  dailyReminderCandidates,
  listWalletCategories,
  markProactiveFailed,
  personalWalletId,
  reactivationCandidates,
  reportCandidates,
  summarize,
  zonedInstant,
  type Language,
  type ProactiveCandidate,
  type ReminderKind,
} from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import { formatDay } from './format';
import { b } from './bot/html';
import { summaryLines } from './bot/summary';
import { t, tf } from './i18n';
import { sendDebtReminders } from './reminders';

export interface NotificationDeps {
  db: Database;
  api: Api<RawApi>;
  log: FastifyBaseLogger;
  maxPerDay: number;
  weeklyReportTime: string;
  monthlyReportTime: string;
  now?: () => Date;
  sendGapMs?: number;
}

type Stats = Record<string, { sent: number; skipped: number; failed: number }>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Claims a slot (dedupe + daily cap), sends, records the outcome. */
async function deliver(
  deps: NotificationDeps,
  c: ProactiveCandidate,
  kind: ReminderKind,
  dedupeKey: string,
  build: (reminderId: string) => { text: string; reply_markup?: InlineKeyboard } | null,
  stats: Stats,
  label: string,
  now: Date,
) {
  const s = (stats[label] ??= { sent: 0, skipped: 0, failed: 0 });
  const id = await claimProactive(deps.db, { userId: c.userId, kind, dedupeKey, timeZone: c.timeZone, maxPerDay: deps.maxPerDay, now });
  if (!id) {
    s.skipped++;
    return;
  }
  const msg = build(id);
  if (!msg) {
    await markProactiveFailed(deps.db, id);
    s.skipped++;
    return;
  }
  try {
    await deps.api.sendMessage(c.telegramId, msg.text, msg.reply_markup ? { reply_markup: msg.reply_markup } : {});
    await deps.db.insert(schema.analyticsEvents).values({ userId: c.userId, name: 'reminder_sent', props: { kind: label } });
    s.sent++;
  } catch (err) {
    await markProactiveFailed(deps.db, id);
    deps.log.warn({ kind: label, err: err instanceof Error ? err.message : 'send failed' }, 'proactive delivery failed');
    s.failed++;
  }
  if (deps.sendGapMs !== 0) await sleep(deps.sendGapMs ?? 40);
}

function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return Math.abs(pct) >= 10 ? pct : null;
}

/** Short report (TZ §33: 3–5 lines). Null when the period is empty (no spam). */
export async function buildPeriodReport(
  db: Database,
  input: { userId: string; language: Language; timeZone: string; period: 'week' | 'month'; startDate: string; endDate: string; prevStart: string; prevEnd: string },
): Promise<string | null> {
  const walletId = await personalWalletId(db, input.userId);
  const range = (a: string, b: string) => [zonedInstant(a, input.timeZone), zonedInstant(addDays(b, 1), input.timeZone)] as const;
  const [from, to] = range(input.startDate, input.endDate);
  const cur = await summarize(db, input.userId, walletId, from, to);
  if (cur.count === 0) return null;
  const lang = input.language;
  const cats = await listWalletCategories(db, walletId, lang);
  // Comparison of the top category with the previous period (one line, only when notable).
  const top = cur.byCategory[0];
  let compare: string | null = null;
  if (top?.categoryId) {
    const name = cats.find((c) => c.id === top.categoryId)?.name ?? t(lang, 'uncategorized');
    const [pf, pt] = range(input.prevStart, input.prevEnd);
    const prev = await summarize(db, input.userId, walletId, pf, pt);
    const prevTop = prev.byCategory.find((c) => c.categoryId === top.categoryId)?.totalUzs ?? 0;
    const pct = changePct(top.totalUzs, prevTop);
    if (pct !== null) {
      const key = input.period === 'week' ? (pct > 0 ? 'compareUpWeek' : 'compareDownWeek') : pct > 0 ? 'compareUpMonth' : 'compareDownMonth';
      compare = tf(lang, key, { category: name, pct: String(Math.abs(pct)) });
    }
  }
  // TZ §33: title + body + comparison ≤ 5 lines.
  const lines = [
    `${b(t(lang, input.period === 'week' ? 'weeklyTitle' : 'monthlyTitle'))} · ${formatDay(input.startDate, lang)} — ${formatDay(input.endDate, lang)}`,
    '',
    ...summaryLines(lang, cur, cats, compare ? 3 : 4),
  ];
  if (compare) lines.push('', compare);
  return lines.join('\n');
}

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;

/** One scheduler tick: everything due now, most important first. */
export async function runProactiveTick(deps: NotificationDeps): Promise<Stats> {
  const now = deps.now ? deps.now() : new Date();
  const stats: Stats = {};

  // 1. Debts (money owed is the most actionable).
  stats.debt = await sendDebtReminders({ ...deps, now: () => now });

  // 2. Daily reminder with the "no spending today" button.
  for (const c of await dailyReminderCandidates(deps.db, now)) {
    await deliver(deps, c, 'daily', `daily:${c.localDate}`, (id) => ({
      text: t(c.language, 'dailyReminder'),
      reply_markup: new InlineKeyboard().text(t(c.language, 'noSpendButton'), `ns:${id}`),
    }), stats, 'daily', now);
  }

  // 3. Reports: weekly (Sunday evening) and monthly (1st, for the month just ended).
  const weekly = await reportCandidates(deps.db, now, 'weekly', deps.weeklyReportTime);
  for (const c of weekly) {
    const end = c.localDate; // Sunday
    const start = addDays(end, -6);
    const text = await buildPeriodReport(deps.db, {
      userId: c.userId, language: c.language, timeZone: c.timeZone, period: 'week',
      startDate: start, endDate: end, prevStart: addDays(start, -7), prevEnd: addDays(end, -7),
    });
    if (!text) continue;
    await deliver(deps, c, 'weekly_report', `weekly:${start}`, () => ({ text }), stats, 'weekly', now);
  }
  const monthly = await reportCandidates(deps.db, now, 'monthly', deps.monthlyReportTime);
  for (const c of monthly) {
    const end = addDays(c.localDate, -1);
    const start = monthStart(end);
    const prevEnd = addDays(start, -1);
    const text = await buildPeriodReport(deps.db, {
      userId: c.userId, language: c.language, timeZone: c.timeZone, period: 'month',
      startDate: start, endDate: end, prevStart: monthStart(prevEnd), prevEnd,
    });
    if (!text) continue;
    await deliver(deps, c, 'monthly_report', `monthly:${start.slice(0, 7)}`, () => ({ text }), stats, 'monthly', now);
  }

  // 4. Reactivation after 3 and 7 quiet days, then silence.
  for (const c of await reactivationCandidates(deps.db, now)) {
    await deliver(deps, c, 'reactivation', `react:${c.days}:${c.lastActiveDate}`, () => ({
      text: t(c.language, c.days === 3 ? 'reactivation3' : 'reactivation7'),
    }), stats, 'reactivation', now);
  }
  return stats;
}

/** In-process fallback scheduler (used when no Redis queue is configured). */
export function scheduleNotifications(deps: NotificationDeps, intervalMs = 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const stats = await runProactiveTick(deps);
      const sent = Object.values(stats).reduce((a, s) => a + s.sent + s.failed, 0);
      if (sent) deps.log.info({ notifications: stats }, 'proactive tick');
    } catch (err) {
      deps.log.error({ err }, 'proactive tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
