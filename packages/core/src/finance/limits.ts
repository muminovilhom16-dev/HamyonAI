import { and, eq, gte, sql } from 'drizzle-orm';
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
