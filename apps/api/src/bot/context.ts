import type { Context } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import type { AIProvider, SpeechProvider } from '@hamyon/ai';
import type { PlanConfig } from '@hamyon/config';
import type { AuthConfig, ExchangeRateProvider, User } from '@hamyon/core';
import type { Database } from '@hamyon/db';

export interface BotContext extends Context {
  user?: User;
  walletId?: string;
}

export interface BotServices {
  db: Database;
  ai: AIProvider | null;
  speech: SpeechProvider | null;
  /** Downloads a Telegram file by its file_path (voice notes). */
  downloadFile: (filePath: string) => Promise<Uint8Array>;
  plans: PlanConfig;
  voiceMaxSeconds: number;
  fx: ExchangeRateProvider | null;
  auth: AuthConfig;
  log: FastifyBaseLogger;
  confidenceThreshold: number;
  now: () => Date;
  webLoginUrl?: (token: string) => string;
}
