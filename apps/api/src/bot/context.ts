import type { Context } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import type { AIProvider } from '@hamyon/ai';
import type { AuthConfig, ExchangeRateProvider, User } from '@hamyon/core';
import type { Database } from '@hamyon/db';

export interface BotContext extends Context {
  user?: User;
  walletId?: string;
}

export interface BotServices {
  db: Database;
  ai: AIProvider | null;
  fx: ExchangeRateProvider | null;
  auth: AuthConfig;
  log: FastifyBaseLogger;
  confidenceThreshold: number;
  now: () => Date;
  webLoginUrl?: (token: string) => string;
}
