import type { FastifyInstance } from 'fastify';
import { loadEnv } from '@hamyon/config';
import { AIUnavailableError, type AIProvider, type SpeechProvider } from '@hamyon/ai';
import type { ExchangeRateProvider } from '@hamyon/core';
import { createDb, resetTestDatabase, testDatabaseUrl, type DbHandle } from '@hamyon/db';
import { buildApp } from '../src/app';

export const SECRET = 'w'.repeat(40);
export const env = loadEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: testDatabaseUrl(),
  TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  TELEGRAM_BOT_USERNAME: 'HamyonAIBot',
  AUTH_TOKEN_SECRET: 'a'.repeat(40),
  PUBLIC_BASE_URL: 'https://api.hamyon.test',
  WEB_BASE_URL: 'https://app.hamyon.test',
});

export interface ApiCall { method: string; payload: Record<string, any> }

export interface Harness {
  app: FastifyInstance;
  h: DbHandle;
  calls: ApiCall[];
  failChatIds: Set<number>;
  clock: { now: Date };
  ai: { current: AIProvider | null };
  speech: { current: SpeechProvider | null };
  send(fromId: number, text: string, opts?: { lang?: string }): Promise<number>;
  tap(fromId: number, data: string): Promise<number>;
  voice(fromId: number, duration?: number): Promise<number>;
  /** Text messages sent or edited since the last reset. */
  texts(): string[];
  /** Inline keyboard of the last sent/edited message. */
  lastKeyboard(): Array<Array<{ text: string; callback_data?: string }>>;
  reset(): void;
  close(): Promise<void>;
}

const fx: ExchangeRateProvider = { name: 'fake', async fetchRate() { return '12800.00'; } };

export async function createHarness(): Promise<Harness> {
  await resetTestDatabase(testDatabaseUrl());
  const h = createDb(testDatabaseUrl());
  const calls: ApiCall[] = [];
  const failChatIds = new Set<number>();
  const clock = { now: new Date('2026-10-01T10:00:00Z') };
  const ai: { current: AIProvider | null } = { current: null };
  const aiProxy: AIProvider = {
    name: 'proxy',
    parseText: (i) => (ai.current ? ai.current.parseText(i) : Promise.reject(new Error('no ai'))),
    categorize: (i) => (ai.current ? ai.current.categorize(i) : Promise.reject(new Error('no ai'))),
  };
  const speech: { current: SpeechProvider | null } = { current: null };
  const speechProxy: SpeechProvider = {
    name: 'proxy',
    transcribe: (i) => (speech.current ? speech.current.transcribe(i) : Promise.reject(new AIUnavailableError('not_configured'))),
  };
  const app = await buildApp({
    speech: speechProxy,
    downloadFile: async () => new Uint8Array([79, 103, 103, 83]),
    env,
    dbHandle: h,
    fx,
    ai: aiProxy,
    now: () => clock.now,
    botInfo: {
      id: 123456, is_bot: true, first_name: 'Hamyon AI', username: 'HamyonAIBot',
      can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false,
      can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false,
    } as never,
    configureBotApi: (api) => {
      api.config.use(async (_prev, method, payload) => {
        const p = payload as Record<string, any>;
        calls.push({ method, payload: p });
        if (method === 'getFile') return { ok: true, result: { file_id: 'f', file_unique_id: 'u', file_path: 'voice/file_1.oga' } } as never;
        if (failChatIds.has(p.chat_id)) throw new Error('telegram down: secret internal detail');
        return { ok: true, result: { message_id: calls.length, date: 0, chat: { id: p.chat_id, type: 'private' }, text: p.text } } as never;
      });
    },
  });

  let updateId = 1;
  const post = async (body: unknown) => {
    const res = await app.inject({
      method: 'POST',
      url: env.TELEGRAM_WEBHOOK_PATH,
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: body as object,
    });
    return res.statusCode;
  };
  const from = (id: number, lang = 'uz') => ({ id, is_bot: false, first_name: 'Ali', language_code: lang });

  return {
    app, h, calls, failChatIds, clock, ai, speech,
    send(fromId, text, opts = {}) {
      const cmd = text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] : undefined;
      return post({
        update_id: updateId++,
        message: {
          message_id: 1, date: Math.floor(clock.now.getTime() / 1000), chat: { id: fromId, type: 'private' },
          from: from(fromId, opts.lang), text, ...(cmd && { entities: cmd }),
        },
      });
    },
    voice(fromId, duration = 4) {
      return post({
        update_id: updateId++,
        message: {
          message_id: 1, date: Math.floor(clock.now.getTime() / 1000), chat: { id: fromId, type: 'private' }, from: from(fromId),
          voice: { file_id: 'f', file_unique_id: 'u', duration, mime_type: 'audio/ogg' },
        },
      });
    },
    tap(fromId, data) {
      return post({
        update_id: updateId++,
        callback_query: {
          id: `cq${updateId}`, from: from(fromId), chat_instance: 'ci', data,
          message: { message_id: 99, date: 0, chat: { id: fromId, type: 'private' }, text: 'card' },
        },
      });
    },
    texts: () => calls.filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText').map((c) => c.payload.text as string),
    lastKeyboard() {
      const last = [...calls].reverse().find((c) => c.payload.reply_markup?.inline_keyboard);
      return last?.payload.reply_markup.inline_keyboard ?? [];
    },
    reset() { calls.length = 0; failChatIds.clear(); },
    async close() { await app.close(); await h.close(); },
  };
}
