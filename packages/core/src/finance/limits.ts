import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { PlanConfig, PlanId } from '@hamyon/config';
import { schema, type Database } from '@hamyon/db';
import { localDate, zonedInstant } from './time';

/** Features with a per-month plan limit, mapped to their usage-log feature name. */
const FEATURE_LOG: Record<'voicePerMonth', string> = { voicePerMonth: 'stt' };

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number | null;
}

/**
 * Monthly quota check (TZ §34-35). Limits come from config, never code.
 * Text input is never limited, so it has no entry here.
 */
export async function checkMonthlyLimit(
  db: Database,
  input: { userId: string; plan: string; timeZone: string; now: Date; feature: keyof typeof FEATURE_LOG; plans: PlanConfig },
): Promise<LimitCheck> {
  const plan = (input.plan in input.plans ? input.plan : 'free') as PlanId;
  const limit = input.plans[plan][input.feature];
  if (limit === null) return { allowed: true, used: 0, limit: null };
  const monthStart = zonedInstant(`${localDate(input.now, input.timeZone).slice(0, 7)}-01`, input.timeZone);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.aiUsageLog)
    .where(
      and(
        eq(schema.aiUsageLog.userId, input.userId),
        eq(schema.aiUsageLog.feature, FEATURE_LOG[input.feature]),
        eq(schema.aiUsageLog.success, true),
        gte(schema.aiUsageLog.createdAt, monthStart),
      ),
    );
  const used = row?.count ?? 0;
  return { allowed: used < limit, used, limit };
}

/** AI text features whose spend counts toward the AI budget (STT has its own count limit). */
const AI_TEXT_FEATURES = ['parse_text', 'categorize'];

export interface AiBudgetCheck {
  allowed: boolean;
  /** Which cap blocked the call, if any. */
  reason: 'user_month' | 'global_day' | null;
}

/**
 * AI spend guard (TZ §35). Two caps, both from config:
 * - per user per local month, in so'm (`plans[plan].aiCostUzsPerMonth`);
 * - all users per UTC day, in dollars — protects the prepaid API balance.
 * When either is reached the caller runs rule-only (clarifying questions, never guesses).
 */
export async function checkAiBudget(
  db: Database,
  input: { userId: string; plan: string; timeZone: string; now: Date; plans: PlanConfig; usdToUzs: number; dailyBudgetUsd: number },
): Promise<AiBudgetCheck> {
  const dayStart = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()));
  const [day] = await db
    .select({ micros: sql<string>`coalesce(sum(${schema.aiUsageLog.costUsdMicros}), 0)` })
    .from(schema.aiUsageLog)
    .where(and(inArray(schema.aiUsageLog.feature, AI_TEXT_FEATURES), gte(schema.aiUsageLog.createdAt, dayStart)));
  if (Number(day?.micros ?? 0) >= input.dailyBudgetUsd * 1_000_000) return { allowed: false, reason: 'global_day' };

  const plan = (input.plan in input.plans ? input.plan : 'free') as PlanId;
  const limitUzs = input.plans[plan].aiCostUzsPerMonth;
  if (limitUzs === null) return { allowed: true, reason: null };
  const monthStart = zonedInstant(`${localDate(input.now, input.timeZone).slice(0, 7)}-01`, input.timeZone);
  const [month] = await db
    .select({ micros: sql<string>`coalesce(sum(${schema.aiUsageLog.costUsdMicros}), 0)` })
    .from(schema.aiUsageLog)
    .where(
      and(
        eq(schema.aiUsageLog.userId, input.userId),
        inArray(schema.aiUsageLog.feature, AI_TEXT_FEATURES),
        gte(schema.aiUsageLog.createdAt, monthStart),
      ),
    );
  const spentUzs = (Number(month?.micros ?? 0) / 1_000_000) * input.usdToUzs;
  return spentUzs >= limitUzs ? { allowed: false, reason: 'user_month' } : { allowed: true, reason: null };
}
