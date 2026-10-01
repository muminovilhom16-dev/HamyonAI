import Anthropic from '@anthropic-ai/sdk';
import { estimateCostUsdMicros } from './pricing';
import {
  AIUnavailableError,
  type AIProvider,
  type AIUsage,
  type CategorizeInput,
  type CategorizeOutput,
  type CategoryOption,
  type ParseTextInput,
  type ParseTextOutput,
} from './types';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** For tests / proxies. */
  baseURL?: string;
}

// Frozen instructions (no per-request data) so the prefix stays cacheable.
const PARSE_SYSTEM = `You convert short personal-finance messages from users in Uzbekistan into structured records.
Messages may be in Uzbek (Latin or Cyrillic), Russian, or a mix, with typos, slang and abbreviations.

Return one item per separate money operation in the message ("non 5 ming, sut 12 ming" is two items).

Field rules:
- type: "expense" by default. "income" only with an explicit income signal (oylik/maosh/zarplata tushdi, "+500 ming", получил зарплату).
  Debts are never expenses: "qarz berdim"/"дал в долг" → debt_given; "qarz oldim"/"взял в долг" → debt_taken;
  "X qaytardi"/"вернул долг" → debt_return.
- amount: integer in whole units (so'm or dollars), never fractional. "ming"/"k"/"к"/"тыс" = ×1000, "mln"/"млн" = ×1 000 000,
  "yarim" = 0.5, "полтора" = 1.5. Words are numbers too: "yigirma besh ming" = 25000.
  A bare number under 1000 in so'm usually means thousands ("taksi 20" = 20000) — then set confidence ≤ 0.6.
- NEVER invent or estimate an amount. If the message states no amount, return an empty items list.
- currency: "USD" only for $/dollar/доллар/usd, otherwise "UZS".
- category_id: one slug from the provided list that matches the meaning, or null for debts or when nothing fits.
  The same meaning always gets the same category (e.g. installing Windows on a computer → tech_services).
- note: a short description in the user's own words and language, without the amount; null if none.
- counterparty: the person's name for debts or payments to a person ("Murod aka"), else null.
- date: YYYY-MM-DD. Use "today" unless the message says otherwise (kecha/вчера = yesterday).
- confidence: 0..1, your certainty in the whole item. Below 0.8 if the type, amount or category is a guess.`;

const CATEGORIZE_SYSTEM = `You assign one spending category slug to a short finance note from a user in Uzbekistan
(Uzbek Latin/Cyrillic or Russian). Choose from the provided list only; use null if nothing fits.`;

function nullable(schema: Record<string, unknown>) {
  return { anyOf: [schema, { type: 'null' }] };
}

function parseSchema(categories: CategoryOption[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'amount', 'currency', 'category_id', 'note', 'counterparty', 'date', 'confidence'],
          properties: {
            type: { type: 'string', enum: ['expense', 'income', 'debt_given', 'debt_taken', 'debt_return'] },
            amount: { type: 'integer' },
            currency: { type: 'string', enum: ['UZS', 'USD'] },
            category_id: nullable({ type: 'string', enum: categories.map((c) => c.slug) }),
            note: nullable({ type: 'string' }),
            counterparty: nullable({ type: 'string' }),
            date: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
    },
  };
}

function categorizeSchema(categories: CategoryOption[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['category_id', 'confidence'],
    properties: {
      category_id: nullable({ type: 'string', enum: categories.map((c) => c.slug) }),
      confidence: { type: 'number' },
    },
  };
}

const categoryList = (categories: CategoryOption[]) =>
  categories.map((c) => `- ${c.slug} (${c.kind}): ${c.name}`).join('\n');

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs,
      maxRetries: 1,
      ...(opts.baseURL && { baseURL: opts.baseURL }),
    });
  }

  async parseText(input: ParseTextInput): Promise<ParseTextOutput> {
    const { json, usage } = await this.call(
      PARSE_SYSTEM,
      `Categories:\n${categoryList(input.categories)}\n\nToday: ${input.today}\nUser language: ${input.language}\n\nMessage:\n${input.text}`,
      parseSchema(input.categories),
    );
    const items = (json as { items?: unknown }).items;
    if (!Array.isArray(items)) throw new AIUnavailableError('bad_output', usage);
    return { items, usage };
  }

  async categorize(input: CategorizeInput): Promise<CategorizeOutput> {
    const { json, usage } = await this.call(
      CATEGORIZE_SYSTEM,
      `Categories:\n${categoryList(input.categories)}\n\nNote:\n${input.text}`,
      categorizeSchema(input.categories),
    );
    const out = json as { category_id?: unknown; confidence?: unknown };
    const slug = typeof out.category_id === 'string' ? out.category_id : null;
    const confidence = typeof out.confidence === 'number' ? out.confidence : 0;
    return { slug, confidence, usage };
  }

  private async call(system: string, user: string, schema: Record<string, unknown>): Promise<{ json: unknown; usage: AIUsage }> {
    const started = performance.now();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.opts.model,
        // Thinking is always on for this model family; low effort keeps
        // this short extraction task fast and cheap. Thinking tokens count
        // toward max_tokens, so leave headroom.
        max_tokens: 4000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        // Server-side fallback if a safety classifier declines.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: user }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AIUnavailableError('timeout');
      if (err instanceof Anthropic.RateLimitError) throw new AIUnavailableError('rate_limited');
      if (err instanceof Anthropic.APIError) throw new AIUnavailableError('api_error');
      throw new AIUnavailableError('api_error');
    }

    const usage: AIUsage = {
      provider: this.name,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsdMicros: estimateCostUsdMicros(response.model, response.usage.input_tokens, response.usage.output_tokens),
      latencyMs: Math.round(performance.now() - started),
    };

    if (response.stop_reason === 'refusal') throw new AIUnavailableError('refused', usage);
    if (response.stop_reason === 'max_tokens') throw new AIUnavailableError('bad_output', usage);

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      return { json: JSON.parse(text), usage };
    } catch {
      throw new AIUnavailableError('bad_output', usage);
    }
  }
}
