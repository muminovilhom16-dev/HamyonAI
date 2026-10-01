import { AnthropicProvider } from './anthropic';
import type { AIProvider } from './types';

export * from './types';
export { AnthropicProvider } from './anthropic';
export { estimateCostUsdMicros } from './pricing';

export interface AIConfig {
  provider: 'anthropic' | 'none';
  model: string;
  timeoutMs: number;
  anthropicApiKey?: string;
}

/** Returns null when AI is disabled or not configured; callers use the rule parser alone. */
export function createAIProvider(cfg: AIConfig): AIProvider | null {
  if (cfg.provider === 'anthropic' && cfg.anthropicApiKey) {
    return new AnthropicProvider({ apiKey: cfg.anthropicApiKey, model: cfg.model, timeoutMs: cfg.timeoutMs });
  }
  return null;
}
