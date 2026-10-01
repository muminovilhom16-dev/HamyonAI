import { and, desc, eq, gt, inArray, isNull, lt, or, isNotNull } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';

const { pendingInputs } = schema;

export type PendingKind = (typeof pendingInputs.$inferSelect)['kind'];
export type Pending = typeof pendingInputs.$inferSelect;

export const PENDING_TTL_MINUTES = 60 * 24;

export async function createPending(
  db: Database,
  input: { userId: string; walletId: string; kind: PendingKind; payload: unknown; now?: Date; ttlMinutes?: number },
): Promise<Pending> {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(pendingInputs)
    .values({
      userId: input.userId,
      walletId: input.walletId,
      kind: input.kind,
      payload: input.payload,
      expiresAt: new Date(now.getTime() + (input.ttlMinutes ?? PENDING_TTL_MINUTES) * 60_000),
    })
    .returning();
  return row!;
}

/** Open (unresolved, unexpired) pending item owned by this user, or null. */
export async function getOpenPending(db: Database, userId: string, id: string, now: Date = new Date()): Promise<Pending | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select()
    .from(pendingInputs)
    .where(and(eq(pendingInputs.id, id), eq(pendingInputs.userId, userId), isNull(pendingInputs.resolvedAt), gt(pendingInputs.expiresAt, now)));
  return row ?? null;
}

/** Latest open item waiting for a typed reply (amount), if any. */
export async function latestAwaitingReply(db: Database, userId: string, now: Date = new Date()): Promise<Pending | null> {
  const [row] = await db
    .select()
    .from(pendingInputs)
    .where(
      and(
        eq(pendingInputs.userId, userId),
        inArray(pendingInputs.kind, ['ask_amount', 'edit_amount']),
        isNull(pendingInputs.resolvedAt),
        gt(pendingInputs.expiresAt, now),
      ),
    )
    .orderBy(desc(pendingInputs.createdAt))
    .limit(1);
  return row ?? null;
}

/** Marks resolved; returns false if it was already resolved (double tap safe). */
export async function resolvePending(db: Database, id: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(pendingInputs)
    .set({ resolvedAt: now })
    .where(and(eq(pendingInputs.id, id), isNull(pendingInputs.resolvedAt)))
    .returning({ id: pendingInputs.id });
  return rows.length > 0;
}

/** Cancels all open typed-reply prompts for a user (a new message supersedes them). */
export async function cancelAwaitingReplies(db: Database, userId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(pendingInputs)
    .set({ resolvedAt: now })
    .where(and(eq(pendingInputs.userId, userId), inArray(pendingInputs.kind, ['ask_amount', 'edit_amount']), isNull(pendingInputs.resolvedAt)));
}

export async function purgePending(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db
    .delete(pendingInputs)
    .where(or(lt(pendingInputs.expiresAt, now), and(isNotNull(pendingInputs.resolvedAt), lt(pendingInputs.resolvedAt, cutoff))))
    .returning({ id: pendingInputs.id });
  return rows.length;
}

export async function updatePendingPayload(db: Database, id: string, payload: unknown): Promise<void> {
  await db.update(pendingInputs).set({ payload }).where(and(eq(pendingInputs.id, id), isNull(pendingInputs.resolvedAt)));
}
