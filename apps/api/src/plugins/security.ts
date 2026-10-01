import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Env } from '@hamyon/config';

export async function registerSecurity(
  app: FastifyInstance,
  env: Pick<Env, 'CORS_ORIGINS' | 'RATE_LIMIT_MAX_PER_MINUTE'>,
): Promise<void> {
  await app.register(helmet, {
    // API + server-rendered status pages only; strict defaults.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], styleSrc: ["'unsafe-inline'"], imgSrc: ["'self'", 'data:'], frameAncestors: ["'none'"] },
    },
    referrerPolicy: { policy: 'no-referrer' },
  });
  // Only explicitly configured web origins may call the API with credentials.
  await app.register(cors, { origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX_PER_MINUTE, timeWindow: '1 minute' });
}
