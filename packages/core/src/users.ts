import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { SYSTEM_CATEGORIES, type Language } from './categories';

const { users, wallets, walletMembers, categories } = schema;

export type User = typeof users.$inferSelect;

export interface TelegramProfile {
  telegramId: number;
  displayName?: string | null;
  languageCode?: string | null;
}

/** Initial guess only; onboarding asks the user explicitly. */
export function languageFromTelegram(code?: string | null): Language {
  if (code?.toLowerCase().startsWith('ru')) return 'ru';
  return 'uz_latn';
}

export interface EnsureUserResult {
  user: User;
  personalWalletId: string;
  created: boolean;
}

/**
 * Finds or creates the user together with their personal wallet, owner
 * membership and default categories, atomically. Safe under concurrent
 * /start (unique telegram_id + ON CONFLICT).
 */
export async function ensureUser(
  db: Database,
  profile: TelegramProfile,
  defaults: { currency?: 'UZS' | 'USD'; timezone?: string; reminderTime?: string } = {},
): Promise<EnsureUserResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({
        telegramId: profile.telegramId,
        displayName: profile.displayName?.slice(0, 64) ?? null,
        language: languageFromTelegram(profile.languageCode),
        ...(defaults.currency && { currency: defaults.currency }),
        ...(defaults.timezone && { timezone: defaults.timezone }),
        ...(defaults.reminderTime && { reminderTime: defaults.reminderTime }),
        onboardingStep: 'language',
      })
      .onConflictDoNothing({ target: users.telegramId })
      .returning();

    if (inserted[0]) {
      const user = inserted[0];
      const [wallet] = await tx.insert(wallets).values({ ownerUserId: user.id, kind: 'personal' }).returning();
      await tx.insert(walletMembers).values({ walletId: wallet!.id, userId: user.id, role: 'owner' });
      await tx.insert(categories).values(
        SYSTEM_CATEGORIES.map((c, i) => ({
          walletId: wallet!.id,
          slug: c.slug,
          kind: c.kind,
          icon: c.icon,
          sortOrder: i,
        })),
      );
      return { user, personalWalletId: wallet!.id, created: true };
    }

    const [user] = await tx.select().from(users).where(eq(users.telegramId, profile.telegramId));
    const [wallet] = await tx
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.ownerUserId, user!.id), eq(wallets.kind, 'personal')));
    return { user: user!, personalWalletId: wallet!.id, created: false };
  });
}
