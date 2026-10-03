import { and, asc, eq, sql } from 'drizzle-orm';
import type { CategoryOption } from '@hamyon/ai';
import { schema, type Database } from '@hamyon/db';
import { assertWalletAccess } from '../access';
import { categoryDisplayName, type Language } from '../categories';
import { AppError } from '../errors';
import { STOP_WORDS } from '../parser/keywords';
import { tokenize } from '../parser/normalize';
import type { UserCategoryRule } from '../parser/pipeline';

const { categories, categoryRules } = schema;

export interface WalletCategory {
  id: string;
  /** Key used by parsers/AI: system slug, or the id for custom categories. */
  key: string;
  name: string;
  kind: 'expense' | 'income';
  icon: string | null;
  isHidden: boolean;
}

export async function listWalletCategories(db: Database, walletId: string, lang: Language): Promise<WalletCategory[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.walletId, walletId))
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt));
  return rows.map((c) => ({
    id: c.id,
    key: c.slug ?? c.id,
    name: categoryDisplayName(c, lang),
    kind: c.kind,
    icon: c.icon,
    isHidden: c.isHidden,
  }));
}

export const toCategoryOptions = (cats: WalletCategory[]): CategoryOption[] =>
  cats.filter((c) => !c.isHidden).map((c) => ({ slug: c.key, name: c.name, kind: c.kind }));

/** Learned-rule pattern from a note: folded content words, no stop words or numbers. */
export function patternFromText(text: string | null): string | null {
  if (!text) return null;
  const words = tokenize(text)
    .filter((t) => t.kind === 'word' && !STOP_WORDS.has(t.fold) && t.fold.length >= 2)
    .map((t) => t.fold);
  const unique = [...new Set(words)].slice(0, 5);
  return unique.length ? unique.join(' ') : null;
}

export async function listUserRules(db: Database, userId: string, walletId: string): Promise<UserCategoryRule[]> {
  const rows = await db
    .select({ pattern: categoryRules.pattern, slug: categories.slug, id: categories.id })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(and(eq(categoryRules.userId, userId), eq(categoryRules.walletId, walletId)));
  return rows.map((r) => ({ pattern: r.pattern, categoryKey: r.slug ?? r.id }));
}

/** Correction → reusable rule (TZ §10). Re-correcting the same pattern updates it. */
export async function learnRule(db: Database, userId: string, walletId: string, pattern: string, categoryId: string): Promise<void> {
  await db
    .insert(categoryRules)
    .values({ userId, walletId, pattern, categoryId })
    .onConflictDoUpdate({
      target: [categoryRules.userId, categoryRules.walletId, categoryRules.pattern],
      set: { categoryId, updatedAt: sql`now()`, hits: sql`${categoryRules.hits} + 1` },
    });
}

const MAX_CUSTOM_CATEGORIES = 50;
const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();
const cleanIcon = (s: string | null | undefined) => {
  const v = s?.trim();
  return v ? [...v].slice(0, 2).join('') : null;
};

/** User-created category. Names are unique per wallet and kind (case-insensitive). */
export async function createCategory(
  db: Database,
  userId: string,
  walletId: string,
  input: { name: string; kind: 'expense' | 'income'; icon?: string | null; lang: Language },
): Promise<WalletCategory> {
  await assertWalletAccess(db, userId, walletId);
  const name = cleanName(input.name);
  if (name.length < 1 || name.length > 40) throw new AppError('validation', 'name length');
  const existing = await listWalletCategories(db, walletId, input.lang);
  if (existing.some((c) => c.kind === input.kind && c.name.toLowerCase() === name.toLowerCase())) {
    throw new AppError('validation', 'category exists');
  }
  if (existing.filter((c) => c.key === c.id).length >= MAX_CUSTOM_CATEGORIES) throw new AppError('validation', 'too many categories');
  const [row] = await db
    .insert(categories)
    .values({ walletId, name, kind: input.kind, icon: cleanIcon(input.icon) ?? '🏷', sortOrder: 1000 })
    .returning();
  return { id: row!.id, key: row!.id, name, kind: row!.kind, icon: row!.icon, isHidden: false };
}

/**
 * Rename / change icon / hide or show. System categories are never deleted,
 * only hidden; `name: null` restores a system category's localized name.
 */
export async function updateCategory(
  db: Database,
  userId: string,
  categoryId: string,
  patch: { name?: string | null; icon?: string | null; isHidden?: boolean },
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) throw new AppError('not_found');
  const [row] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!row) throw new AppError('not_found');
  await assertWalletAccess(db, userId, row.walletId);
  const set: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    if (patch.name === null) {
      if (!row.slug) throw new AppError('validation', 'custom category needs a name');
      set.name = null;
    } else {
      const name = cleanName(patch.name);
      if (name.length < 1 || name.length > 40) throw new AppError('validation', 'name length');
      set.name = name;
    }
  }
  if (patch.icon !== undefined) set.icon = cleanIcon(patch.icon);
  if (patch.isHidden !== undefined) set.isHidden = patch.isHidden;
  await db.update(categories).set(set).where(eq(categories.id, categoryId));
}
