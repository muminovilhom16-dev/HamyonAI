import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../src/anthropic';
import { AIUnavailableError } from '../src/types';

let server: http.Server;
let baseURL: string;
let lastRequest: { headers: http.IncomingHttpHeaders; body: Record<string, unknown> } | null = null;
let respond: (res: http.ServerResponse) => void;

const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
  content: [{ type: 'text', text }], stop_reason, stop_sequence: null,
  usage: { input_tokens: 500, output_tokens: 120 },
});
const json = (status: number, body: unknown) => (res: http.ServerResponse) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      lastRequest = { headers: req.headers, body: JSON.parse(raw || '{}') };
      respond(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => { lastRequest = null; });

const provider = (timeoutMs = 2000) => new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5-5', timeoutMs, baseURL });
const input = {
  text: 'taksi 25 ming', today: '2026-10-01', language: 'uz_latn' as const,
  categories: [{ slug: 'transport', name: 'Transport', kind: 'expense' as const }],
};

describe('AnthropicProvider.parseText', () => {
  it('sends a strict JSON-schema request with fallbacks and minimal data', async () => {
    const item = { type: 'expense', amount: 25000, currency: 'UZS', category_id: 'transport', note: 'taksi', counterparty: null, date: '2026-10-01', confidence: 0.97 };
    respond = json(200, message(JSON.stringify({ items: [item] })));
    const out = await provider().parseText(input);

    expect(out.items).toEqual([item]);
    expect(out.usage).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', inputTokens: 500, outputTokens: 120 });
    // 500×4 + 120×20 micro-dollars
    expect(out.usage.costUsdMicros).toBe(4400);

    const body = lastRequest!.body as any;
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(lastRequest!.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.output_config.format.schema.properties.items.items.properties.category_id.anyOf[0].enum).toEqual(['transport']);
    expect(body.tool_choice).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    // Privacy: only the message, date, language and categories are sent.
    expect(JSON.stringify(body)).not.toMatch(/telegram|user_id|phone/i);
  });

  it.each([
    ['refusal', json(200, message('', 'refusal')), 'refused'],
    ['truncated', json(200, message('{"items": [', 'max_tokens')), 'bad_output'],
    ['non-JSON text', json(200, message('sorry')), 'bad_output'],
    ['missing items', json(200, message('{"foo": 1}')), 'bad_output'],
    ['rate limit', json(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }), 'rate_limited'],
    ['server error', json(500, { type: 'error', error: { type: 'api_error', message: 'boom' } }), 'api_error'],
  ])('%s → AIUnavailableError(%s)', async (_name, handler, reason) => {
    respond = handler;
    const err = await provider().parseText(input).catch((e) => e);
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect(err.reason).toBe(reason);
  });

  it('times out instead of hanging', async () => {
    respond = () => {};
    const err = await provider(300).parseText(input).catch((e) => e);
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect(err.reason).toBe('timeout');
  }, 10_000);
});

describe('AnthropicProvider.categorize', () => {
  it('returns slug and confidence', async () => {
    respond = json(200, message('{"category_id":"transport","confidence":0.9}'));
    const out = await provider().categorize({ text: 'Yandex Go', categories: input.categories });
    expect(out).toMatchObject({ slug: 'transport', confidence: 0.9 });
  });
});
