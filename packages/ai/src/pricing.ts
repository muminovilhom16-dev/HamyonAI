/**
 * USD per million tokens. Since $/MTok == micro-dollars per token, cost in
 * micro-dollars is simply tokens × price. Unknown models cost 0 and should be
 * added here when introduced (prices as of 2026-09).
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export function estimateCostUsdMicros(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return inputTokens * p.input + outputTokens * p.output;
}
