import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { AppError } from '../errors';

export interface SettingsPatch {
  language?: 'uz_latn' | 'uz_cyrl' | 'ru';
  currency?: 'UZS' | 'USD';
  reminderTime?: string;
  remindersEnabled?: boolean;
}

export async function updateUserSettings(db: Database, userId: string, patch: SettingsPatch) {
  if (patch.reminderTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.reminderTime)) {
    throw new AppError('validation', 'invalid reminder time');
  }
  const [u] = await db
    .update(schema.users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();
  if (!u) throw new AppError('not_found');
  return u;
}

export async function personalWalletId(db: Database, userId: string): Promise<string> {
  const [w] = await db
    .select({ id: schema.wallets.id })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.ownerUserId, userId), eq(schema.wallets.kind, 'personal')));
  if (!w) throw new AppError('not_found');
  return w.id;
}
