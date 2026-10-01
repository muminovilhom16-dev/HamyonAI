import type { FastifyInstance } from 'fastify';
import type { Bot } from 'grammy';
import type { Update } from 'grammy/types';
import { eq } from 'drizzle-orm';
import { safeEqual } from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import type { BotContext } from '../bot';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Telegram webhook (TZ §42: webhook only, no polling in production).
 *  1. Rejects requests without the configured secret token (constant-time).
 *  2. Claims update_id so Telegram re-deliveries never double-save.
 *  3. On infrastructure failure releases the claim and returns 5xx so
 *     Telegram retries instead of the message being lost (TZ §64 rule 9).
 */
export function telegramWebhookRoute(
  app: FastifyInstance,
  opts: { path: string; secret: string; bot: Bot<BotContext>; db: Database },
): void {
  app.post(opts.path, { config: { rateLimit: false }, bodyLimit: 1_048_576 }, async (request, reply) => {
    const header = request.headers[SECRET_HEADER];
    if (typeof header !== 'string' || !safeEqual(header, opts.secret)) {
      return reply.status(401).send({ error: 'unauthorized' });
    }

    const update = request.body as Update | undefined;
    if (!update || typeof update.update_id !== 'number') {
      return reply.status(400).send({ error: 'validation' });
    }

    const claimed = await opts.db
      .insert(schema.processedUpdates)
      .values({ updateId: update.update_id })
      .onConflictDoNothing()
      .returning();
    if (claimed.length === 0) {
      request.log.info({ updateId: update.update_id }, 'duplicate telegram update skipped');
      return reply.status(200).send({ ok: true });
    }

    const started = performance.now();
    try {
      await opts.bot.handleUpdate(update);
    } catch (err) {
      request.log.error({ err, updateId: update.update_id }, 'telegram update failed, releasing for retry');
      await opts.db
        .delete(schema.processedUpdates)
        .where(eq(schema.processedUpdates.updateId, update.update_id))
        .catch(() => {});
      return reply.status(500).send({ error: 'internal' });
    }
    request.log.info(
      { updateId: update.update_id, telegramLatencyMs: Math.round(performance.now() - started) },
      'telegram update processed',
    );
    return reply.status(200).send({ ok: true });
  });
}
