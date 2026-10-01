import { AIUnavailableError, type AIUsage, type SpeechProvider, type TranscribeInput, type TranscribeOutput } from './types';

export interface GoogleSpeechOptions {
  apiKey: string;
  /** "default" works for uz-UZ; other models may not support Uzbek. */
  model: string;
  /** v1p1beta1 supports alternativeLanguageCodes (Uzbek + Russian in one call). */
  apiVersion: 'v1' | 'v1p1beta1';
  timeoutMs: number;
  /** Estimated USD per audio minute, for cost tracking only. */
  usdPerMinute: number;
  baseURL?: string;
}

interface RecognizeResponse {
  results?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }>; languageCode?: string }>;
  totalBilledTime?: string;
}

/** Google Cloud Speech-to-Text (synchronous recognize, audio ≤ 60 s). */
export class GoogleSpeechProvider implements SpeechProvider {
  readonly name = 'google';
  constructor(private readonly opts: GoogleSpeechOptions) {}

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const [primary, ...alternatives] = input.languages;
    const body = {
      config: {
        encoding: input.encoding,
        sampleRateHertz: input.sampleRateHertz,
        languageCode: primary ?? 'uz-UZ',
        ...(this.opts.apiVersion === 'v1p1beta1' && alternatives.length && { alternativeLanguageCodes: alternatives.slice(0, 3) }),
        model: this.opts.model,
        enableAutomaticPunctuation: true,
        maxAlternatives: 1,
      },
      audio: { content: Buffer.from(input.audio).toString('base64') },
    };
    const base = this.opts.baseURL ?? 'https://speech.googleapis.com';
    const url = `${base}/${this.opts.apiVersion}/speech:recognize`;
    const started = performance.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        // Key in a header, not the URL, so it never lands in proxy/access logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string }).name;
      throw new AIUnavailableError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'api_error');
    }
    if (res.status === 429) throw new AIUnavailableError('rate_limited');
    if (!res.ok) throw new AIUnavailableError('api_error');

    let json: RecognizeResponse;
    try {
      json = (await res.json()) as RecognizeResponse;
    } catch {
      throw new AIUnavailableError('bad_output');
    }

    const billedSeconds = Number.parseFloat(json.totalBilledTime ?? '0') || 0;
    const usage: AIUsage = {
      provider: this.name,
      model: this.opts.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsdMicros: Math.round((billedSeconds * this.opts.usdPerMinute * 1_000_000) / 60),
      latencyMs: Math.round(performance.now() - started),
    };

    const results = json.results ?? [];
    const parts = results.map((r) => r.alternatives?.[0]).filter((a): a is { transcript?: string; confidence?: number } => !!a);
    const text = parts.map((a) => (a.transcript ?? '').trim()).filter(Boolean).join(' ').trim();
    const confs = parts.map((a) => a.confidence).filter((c): c is number => typeof c === 'number');
    const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
    return { text, confidence, languageCode: results[0]?.languageCode ?? null, usage };
  }
}
