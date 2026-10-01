import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';

const { webLoginTokens, webSessions } = schema;

export interface AuthConfig {
  /** Server-side pepper; tokens are stored only as HMAC(secret, token). */
  secret: string;
  loginTokenTtlMinutes: number;
  sessionTtlDays: number;
}

export const generateToken = (): string => randomBytes(32).toString('base64url');

export function hashToken(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Issues a one-time /web login token (TZ §26). Returns the raw token once. */
export async function issueLoginToken(
  db: Database,
  cfg: AuthConfig,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + cfg.loginTokenTtlMinutes * 60_000);
  await db.insert(webLoginTokens).values({ userId, tokenHash: hashToken(cfg.secret, token), expiresAt });
  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' };

/**
 * Atomically marks the token used. A token can be consumed at most once even
 * under concurrent requests (single conditional UPDATE). Used and expired
 * tokens both show the "link expired" page to the user.
 */
export async function consumeLoginToken(
  db: Database,
  cfg: AuthConfig,
  token: string,
  now: Date = new Date(),
): Promise<ConsumeResult> {
  if (!token || token.length > 128) return { ok: false, reason: 'invalid' };
  const tokenHash = hashToken(cfg.secret, token);
  const [row] = await db
    .update(webLoginTokens)
    .set({ usedAt: now })
    .where(and(eq(webLoginTokens.tokenHash, tokenHash), isNull(webLoginTokens.usedAt), gt(webLoginTokens.expiresAt, now)))
    .returning({ userId: webLoginTokens.userId });
  if (row) return { ok: true, userId: row.userId };

  const [existing] = await db
    .select({ id: webLoginTokens.id })
    .from(webLoginTokens)
    .where(eq(webLoginTokens.tokenHash, tokenHash));
  return { ok: false, reason: existing ? 'expired' : 'invalid' };
}

export async function createSession(
  db: Database,
  cfg: AuthConfig,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + cfg.sessionTtlDays * 86_400_000);
  await db.insert(webSessions).values({ userId, tokenHash: hashToken(cfg.secret, token), expiresAt, lastSeenAt: now });
  return { token, expiresAt };
}

export async function resolveSession(
  db: Database,
  cfg: AuthConfig,
  token: string | undefined,
  now: Date = new Date(),
): Promise<{ userId: string; sessionId: string } | null> {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select({ id: webSessions.id, userId: webSessions.userId })
    .from(webSessions)
    .where(
      and(
        eq(webSessions.tokenHash, hashToken(cfg.secret, token)),
        isNull(webSessions.revokedAt),
        gt(webSessions.expiresAt, now),
      ),
    );
  return row ? { userId: row.userId, sessionId: row.id } : null;
}

export async function revokeSession(db: Database, sessionId: string, now: Date = new Date()): Promise<void> {
  await db.update(webSessions).set({ revokedAt: now }).where(eq(webSessions.id, sessionId));
}
