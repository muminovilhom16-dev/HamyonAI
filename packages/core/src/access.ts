import { and, eq, isNull } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { AppError } from './errors';

const { walletMembers } = schema;

export type WalletRole = 'owner' | 'member';

/**
 * Server-side authorization for every wallet-scoped operation (TZ §39).
 * Returns the caller's role; throws `forbidden` (never `not_found` details)
 * when the user is not an active member, so wallet ids cannot be probed.
 */
export async function assertWalletAccess(
  db: Database,
  userId: string,
  walletId: string,
  opts: { requireRole?: WalletRole } = {},
): Promise<WalletRole> {
  const [m] = await db
    .select({ role: walletMembers.role })
    .from(walletMembers)
    .where(and(eq(walletMembers.walletId, walletId), eq(walletMembers.userId, userId), isNull(walletMembers.leftAt)));
  if (!m) throw new AppError('forbidden');
  if (opts.requireRole === 'owner' && m.role !== 'owner') throw new AppError('forbidden');
  return m.role;
}
