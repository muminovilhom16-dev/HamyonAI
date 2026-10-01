import { and, asc, eq, sql } from 'drizzle-orm';
import type { CategoryOption } from '@hamyon/ai';
import { schema, type Database } from '@hamyon/db';
import { categoryDisplayName, type Language } from '../categories';
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
