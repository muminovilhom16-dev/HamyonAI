import type { FastifyServerOptions } from 'fastify';
import type { Env } from '@hamyon/config';

/**
 * Structured JSON logs. Secrets, tokens and auth headers are redacted, and
 * query strings are stripped from logged URLs (login tokens live there).
 */
export function loggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): FastifyServerOptions['logger'] {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-telegram-bot-api-secret-token"]',
        'res.headers["set-cookie"]',
        '*.token',
        '*.password',
      ],
      censor: '[redacted]',
    },
    serializers: {
      req(req: { method: string; url: string; id: string }) {
        return { id: req.id, method: req.method, url: req.url.split('?')[0] };
      },
    },
    ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
  };
}
