import { AnthropicProvider } from './anthropic';
import { GoogleSpeechProvider } from './google-speech';
import type { AIProvider, SpeechProvider } from './types';

export * from './types';
export { AnthropicProvider } from './anthropic';
export { GoogleSpeechProvider } from './google-speech';
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

export interface SpeechConfig {
  provider: 'google' | 'none';
  googleApiKey?: string;
  model: string;
  apiVersion: 'v1' | 'v1p1beta1';
  timeoutMs: number;
  usdPerMinute: number;
}

/** Returns null when speech-to-text is disabled or not configured. */
export function createSpeechProvider(cfg: SpeechConfig): SpeechProvider | null {
  if (cfg.provider === 'google' && cfg.googleApiKey) {
    return new GoogleSpeechProvider({
      apiKey: cfg.googleApiKey,
      model: cfg.model,
      apiVersion: cfg.apiVersion,
      timeoutMs: cfg.timeoutMs,
      usdPerMinute: cfg.usdPerMinute,
    });
  }
  return null;
}
