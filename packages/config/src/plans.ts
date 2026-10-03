import { z } from 'zod';

/**
 * Plan limits are business hypotheses (TZ §34) and must stay configurable.
 * `null` means unlimited. Text input is intentionally absent: it is never
 * limited, regardless of plan (TZ §35).
 */
export const planIdSchema = z.enum(['free', 'pro', 'family']);
export type PlanId = z.infer<typeof planIdSchema>;

const limit = z.number().int().min(0).nullable();

export const planLimitsSchema = z.object({
  voicePerMonth: limit,
  receiptsPerMonth: limit,
  bankImportsPerMonth: limit,
  activeDebts: limit,
  budgets: limit,
  /** Soft AI spend ceiling per user per month, in UZS. */
  aiCostUzsPerMonth: limit,
  familyMembers: limit,
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planConfigOverrideSchema = z.partialRecord(planIdSchema, planLimitsSchema);
export type PlanConfig = Record<PlanId, PlanLimits>;

// ASSUMPTION: placeholder numbers until product decides. Override via PLAN_LIMITS_JSON.
export const defaultPlanConfig: PlanConfig = {
  free: {
    voicePerMonth: 30,
    receiptsPerMonth: 10,
    bankImportsPerMonth: 30,
    activeDebts: 5,
    budgets: 10,
    aiCostUzsPerMonth: 1000,
    familyMembers: null,
  },
  pro: {
    voicePerMonth: null,
    receiptsPerMonth: null,
    bankImportsPerMonth: null,
    activeDebts: null,
    budgets: null,
    aiCostUzsPerMonth: 5000,
    familyMembers: null,
  },
  family: {
    voicePerMonth: null,
    receiptsPerMonth: null,
    bankImportsPerMonth: null,
    activeDebts: null,
    budgets: null,
    aiCostUzsPerMonth: 5000,
    familyMembers: 5,
  },
};

export function loadPlanConfig(json?: string): PlanConfig {
  if (!json) return defaultPlanConfig;
  const parsed = planConfigOverrideSchema.parse(JSON.parse(json));
  return { ...defaultPlanConfig, ...parsed };
}
