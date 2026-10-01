import type { FastifyInstance } from 'fastify';
import { AppError } from '@hamyon/core';

/**
 * Centralized error handling. Clients get a stable `{ error: code }` body;
 * stack traces, SQL and provider messages stay in logs only (TZ §63).
 */
export function registerErrorHandling(app: FastifyInstance, opts: { spaFallback?: boolean } = {}): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, 'app error');
      return reply.status(error.statusCode).send({ error: error.code });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send({ error: 'rate_limited' });
    if ((error as { validation?: unknown }).validation || status === 400) {
      return reply.status(400).send({ error: 'validation' });
    }
    if (status && status >= 400 && status < 500) return reply.status(status).send({ error: 'bad_request' });
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ error: 'internal' });
  });

  app.setNotFoundHandler((request, reply) => {
    // Web panel client-side routes get index.html; API paths stay JSON.
    const isApi = /^\/(api|auth|telegram|health|ready)(\/|$|\?)/.test(request.url);
    if (opts.spaFallback && request.method === 'GET' && !isApi) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({ error: 'not_found' });
  });
}
