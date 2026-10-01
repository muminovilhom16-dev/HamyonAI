import type { FastifyInstance } from 'fastify';
import type { DbHandle } from '@hamyon/db';

export function healthRoutes(app: FastifyInstance, pool: DbHandle['pool']): void {
  // Liveness: process is up.
  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

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
