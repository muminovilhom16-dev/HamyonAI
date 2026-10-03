import type { FastifyInstance } from 'fastify';
import type { DbHandle } from '@hamyon/db';

export function healthRoutes(app: FastifyInstance, pool: DbHandle['pool'], features: { ai: boolean } = { ai: false }): void {
  // Liveness: process is up. `ai` says only whether an AI provider is configured (no secrets).
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok', ai: features.ai ? 'on' : 'off' }));

  // Readiness: dependencies reachable. No internal details in the response.
  app.get('/ready', { config: { rateLimit: false } }, async (request, reply) => {
    try {
      await pool.query('select 1');
      return { status: 'ready' };
    } catch (err) {
      request.log.error({ err }, 'readiness check failed');
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
}
