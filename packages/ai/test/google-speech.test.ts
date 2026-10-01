import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GoogleSpeechProvider } from '../src/google-speech';
import { AIUnavailableError } from '../src/types';

let server: http.Server;
let baseURL: string;
let last: { url: string; headers: http.IncomingHttpHeaders; body: any } | null = null;
let respond: (res: http.ServerResponse) => void = () => {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      last = { url: req.url!, headers: req.headers, body: JSON.parse(raw || '{}') };
      respond(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const json = (status: number, body: unknown) => (res: http.ServerResponse) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const provider = (timeoutMs = 2000) =>
  new GoogleSpeechProvider({ apiKey: 'test-key', model: 'default', apiVersion: 'v1p1beta1', timeoutMs, usdPerMinute: 0.024, baseURL });
const input = { audio: new Uint8Array([1, 2, 3]), encoding: 'OGG_OPUS' as const, sampleRateHertz: 48000, languages: ['uz-UZ', 'ru-RU'] };

describe('GoogleSpeechProvider', () => {
  it('sends OGG/Opus with Uzbek primary + Russian alternative, key in header', async () => {
    respond = json(200, {
      results: [{ alternatives: [{ transcript: "bozordan go'sht oldim", confidence: 0.9 }], languageCode: 'uz-uz' },
        { alternatives: [{ transcript: 'yuz ellik ming', confidence: 0.8 }] }],
      totalBilledTime: '15s',
    });
    const out = await provider().transcribe(input);
    expect(out.text).toBe("bozordan go'sht oldim yuz ellik ming");
    expect(out.confidence).toBeCloseTo(0.85);
    expect(out.languageCode).toBe('uz-uz');
    // 15 s × $0.024/min = $0.006 = 6000 micro-dollars
    expect(out.usage).toMatchObject({ provider: 'google', costUsdMicros: 6000 });

    expect(last!.url).toBe('/v1p1beta1/speech:recognize');
    expect(last!.url).not.toContain('key=');
    expect(last!.headers['x-goog-api-key']).toBe('test-key');
    expect(last!.body.config).toMatchObject({ encoding: 'OGG_OPUS', sampleRateHertz: 48000, languageCode: 'uz-UZ', alternativeLanguageCodes: ['ru-RU'] });
    expect(last!.body.audio.content).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('v1 omits alternative languages', async () => {
    respond = json(200, { results: [] });
    const p = new GoogleSpeechProvider({ apiKey: 'k', model: 'default', apiVersion: 'v1', timeoutMs: 2000, usdPerMinute: 0.024, baseURL });
    const out = await p.transcribe(input);
    expect(out.text).toBe('');
    expect(last!.body.config.alternativeLanguageCodes).toBeUndefined();
  });

  it.each([
    [429, 'rate_limited'],
    [403, 'api_error'],
    [500, 'api_error'],
  ])('HTTP %i → %s', async (status, reason) => {
    respond = json(status, { error: { message: 'x' } });
    const err = await provider().transcribe(input).catch((e) => e);
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect(err.reason).toBe(reason);
  });

  it('times out', async () => {
    respond = () => {};
    const err = await provider(200).transcribe(input).catch((e) => e);
    expect(err.reason).toBe('timeout');
  });
});
