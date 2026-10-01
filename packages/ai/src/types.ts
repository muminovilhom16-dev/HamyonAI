/**
 * Provider-neutral AI contracts (TZ §44). Business logic depends only on
 * these interfaces; concrete providers are replaceable via config.
 * Providers return *unvalidated* data — callers must schema-validate.
 */

export interface AIUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in integer micro-dollars (no floats in cost accounting). */
  costUsdMicros: number;
  latencyMs: number;
}

export interface CategoryOption {
  slug: string;
  name: string;
  kind: 'expense' | 'income';
}

export interface ParseTextInput {
  /** PII-masked user text. Never includes telegram ids, phone numbers, etc. */
  text: string;
  /** User's local date, YYYY-MM-DD. */
  today: string;
  language: 'uz_latn' | 'uz_cyrl' | 'ru';
  categories: CategoryOption[];
}

export interface ParseTextOutput {
  /** Raw items as returned by the model — NOT trusted until validated. */
  items: unknown[];
  usage: AIUsage;
}

export interface CategorizeInput {
  text: string;
  categories: CategoryOption[];
}

export interface CategorizeOutput {
  slug: string | null;
  confidence: number;
  usage: AIUsage;
}

export interface AIProvider {
  readonly name: string;
  parseText(input: ParseTextInput): Promise<ParseTextOutput>;
  categorize(input: CategorizeInput): Promise<CategorizeOutput>;
}

/** Provider down, timed out, refused, or returned unusable output. Callers fall back. */
export class AIUnavailableError extends Error {
  constructor(
    readonly reason: 'not_configured' | 'timeout' | 'rate_limited' | 'api_error' | 'refused' | 'bad_output',
    readonly usage?: AIUsage,
  ) {
    super(`AI unavailable: ${reason}`);
    this.name = 'AIUnavailableError';
  }
}

// ─── Speech-to-text (TZ §44: replaceable SpeechProvider) ───

export interface TranscribeInput {
  audio: Uint8Array;
  /** Telegram voice notes are OGG/Opus, 48 kHz. */
  encoding: 'OGG_OPUS';
  sampleRateHertz: number;
  /** BCP-47, most likely first (e.g. ["uz-UZ", "ru-RU"]). */
  languages: string[];
}

export interface TranscribeOutput {
  text: string;
  /** 0..1, provider's own confidence; 0 when not reported. */
  confidence: number;
  languageCode: string | null;
  usage: AIUsage;
}

export interface SpeechProvider {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<TranscribeOutput>;
}
