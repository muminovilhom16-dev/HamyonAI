import { and, isNotNull, lt, or } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { DEFAULT_DELETION_GRACE_DAYS, purgeDeletedAccounts, purgeDeletedTransactions, purgePending } from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';

const DAY = 86_400_000;

/**
 * Idempotent cleanup, safe to run on every instance concurrently:
 * soft-deleted transactions after 30 days (TZ §19), stale pending inputs,
 * Telegram update ids (re-delivery window is far shorter than 7 days),
 * expired login tokens and sessions.
 */
export async function runMaintenance(
  db: Database,
  now: Date = new Date(),
  deletionGraceDays = DEFAULT_DELETION_GRACE_DAYS,
): Promise<Record<string, number>> {
  // TZ §40: accounts past the grace period are removed completely.
  const deletedAccounts = await purgeDeletedAccounts(db, now, deletionGraceDays);
  const purgedTransactions = await purgeDeletedTransactions(db, now);
  const purgedPending = await purgePending(db, now);
  const updates = await db
    .delete(schema.processedUpdates)
    .where(lt(schema.processedUpdates.receivedAt, new Date(now.getTime() - 7 * DAY)))
    .returning({ id: schema.processedUpdates.updateId });
  const tokens = await db
    .delete(schema.webLoginTokens)
    .where(lt(schema.webLoginTokens.expiresAt, new Date(now.getTime() - DAY)))
    .returning({ id: schema.webLoginTokens.id });
  const sessions = await db
    .delete(schema.webSessions)
    .where(
      or(
        lt(schema.webSessions.expiresAt, now),
        and(isNotNull(schema.webSessions.revokedAt), lt(schema.webSessions.revokedAt, new Date(now.getTime() - DAY))),
      ),
    )
    .returning({ id: schema.webSessions.id });
  return {
    deletedAccounts,
    purgedTransactions,
    purgedPending,
    processedUpdates: updates.length,
    loginTokens: tokens.length,
    sessions: sessions.length,
  };
}

/** Hourly in-process schedule until the queue (Phase 6) takes this over. */
export function scheduleMaintenance(db: Database, log: FastifyBaseLogger, deletionGraceDays: number, intervalMs = 3_600_000): () => void {
  const run = () =>
    runMaintenance(db, new Date(), deletionGraceDays)
      .then((r) => log.info({ maintenance: r }, 'maintenance done'))
      .catch((err: unknown) => log.error({ err }, 'maintenance failed'));
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
