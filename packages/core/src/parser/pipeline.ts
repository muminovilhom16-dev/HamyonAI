import { AIUnavailableError, type AIProvider, type AIUsage, type CategoryOption } from '@hamyon/ai';
import { maskCardNumbers } from '../pii';
import { DEBT_TYPES, parsedTransactionSchema, type ParsedTransaction, type TransactionType } from './contract';
import { parseRuleBased, type RuleItem } from './rule-parser';

/**
 * TZ §7 pipeline: preprocessing → parser → structured JSON → schema
 * validation → business validation → confidence check. The output says,
 * per item, what the caller may do; nothing here touches the database.
 */

export type ItemDecision =
  /** Confident: save now, show the card (auto-saved, editable, undoable). */
  | 'save'
  /** Amount was guessed ("taksi 20"): ask before saving. */
  | 'confirm_amount'
  /** Category unclear: ask the user to pick one before saving. */
  | 'confirm_category'
  /** "Murod akaga 300 ming": debt or expense? */
  | 'ask_person_kind'
  /** Debt operations are handled by the debt engine. */
  | 'debt';

export interface PipelineItem {
  tx: ParsedTransaction;
  decision: ItemDecision;
  /** Saved without a category because AI was unavailable; categorize later. */
  categoryPending: boolean;
  categorySource: 'user_rule' | 'keywords' | 'ai' | 'none';
  returnDirection: RuleItem['flags']['returnDirection'];
  categoryCandidates: string[];
  contentTokens: string[];
}

export type PipelineResult =
  | { kind: 'items'; items: PipelineItem[]; ai: AIStatus; usage: AIUsage | null; maskedText: string }
  | { kind: 'no_amount'; contentTokens: string[]; ai: AIStatus; usage: null; maskedText: string };

export type AIStatus = 'not_needed' | 'used' | 'unavailable' | 'disabled';

export interface UserCategoryRule {
  /** Folded content tokens joined by single spaces. */
  pattern: string;
  categoryKey: string;
}

export interface PipelineInput {
  text: string;
  today: string;
  language: 'uz_latn' | 'uz_cyrl' | 'ru';
  /** Visible wallet categories; `slug` is the category key (system slug or custom id). */
  categories: CategoryOption[];
  userRules: UserCategoryRule[];
  ai: AIProvider | null;
  confidenceThreshold: number;
  /** Called on every AI failure, for observability. */
  onAIError?: (err: AIUnavailableError) => void;
}

export function matchUserRule(contentTokens: string[], rules: UserCategoryRule[]): UserCategoryRule | null {
  if (contentTokens.length === 0) return null;
  const tokens = new Set(contentTokens);
  // Most specific (longest) pattern wins.
  const sorted = [...rules].sort((a, b) => b.pattern.split(' ').length - a.pattern.split(' ').length);
  return sorted.find((r) => r.pattern.split(' ').every((p) => tokens.has(p))) ?? null;
}

interface Working {
  rule: RuleItem;
  tx: ParsedTransaction;
  categoryConfidence: number | null;
  typeConfidence: number;
  categorySource: PipelineItem['categorySource'];
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const maskedText = maskCardNumbers(input.text).slice(0, 1000);
  const parsed = parseRuleBased(maskedText, { today: input.today });
  const threshold = input.confidenceThreshold;

  // No amount anywhere: never guess (TZ rule 3). AI is not consulted because
  // an amount it produced could not be verified against the text.
  if (parsed.items.length === 0) {
    return { kind: 'no_amount', contentTokens: parsed.contentTokens, ai: 'not_needed', usage: null, maskedText };
  }

  const keys = new Map(input.categories.map((c) => [c.slug, c]));
  const allowedFor = (type: TransactionType, key: string | null) => {
    if (!key) return false;
    const c = keys.get(key);
    return !!c && ((type === 'income' && c.kind === 'income') || (type === 'expense' && c.kind === 'expense'));
  };

  const work: Working[] = parsed.items.map((rule) => {
    const w: Working = {
      rule,
      tx: { ...rule.tx },
      categoryConfidence: rule.categoryConfidence,
      typeConfidence: rule.typeConfidence,
      categorySource: rule.tx.category_id ? 'keywords' : 'none',
    };
    // Keyword category must exist (and be visible) in this wallet.
    if (w.tx.category_id && !allowedFor(w.tx.type, w.tx.category_id)) {
      w.tx.category_id = null;
      w.categoryConfidence = DEBT_TYPES.has(w.tx.type) ? null : 0;
      w.categorySource = 'none';
    }
    // User rules beat keywords and AI (TZ §10).
    if (!DEBT_TYPES.has(w.tx.type)) {
      const r = matchUserRule(rule.contentTokens, input.userRules);
      if (r && allowedFor(w.tx.type, r.categoryKey)) {
        w.tx.category_id = r.categoryKey;
        w.categoryConfidence = 0.99;
        w.categorySource = 'user_rule';
      }
    }
    return w;
  });

  const needsAI = work.some(
    (w) =>
      !w.rule.flags.ambiguousPerson &&
      ((w.categoryConfidence !== null && w.categoryConfidence < threshold) || w.typeConfidence < threshold),
  );

  let aiStatus: AIStatus = 'not_needed';
  let usage: AIUsage | null = null;
  if (needsAI) {
    if (!input.ai) {
      aiStatus = 'disabled';
    } else {
      try {
        const out = await input.ai.parseText({
          text: maskedText,
          today: input.today,
          language: input.language,
          categories: input.categories,
        });
        usage = out.usage;
        aiStatus = 'used';
        mergeAI(work, out.items, allowedFor, threshold);
      } catch (err) {
        aiStatus = 'unavailable';
        if (err instanceof AIUnavailableError) {
          usage = err.usage ?? null;
          input.onAIError?.(err);
        } else {
          input.onAIError?.(new AIUnavailableError('api_error'));
        }
      }
    }
  }

  const items = work.map((w): PipelineItem => {
    const aiDown = aiStatus === 'unavailable' || aiStatus === 'disabled';
    let decision: ItemDecision;
    let categoryPending = false;
    if (w.rule.flags.ambiguousPerson && w.tx.type === 'expense' && w.categorySource !== 'user_rule') {
      decision = 'ask_person_kind';
    } else if (DEBT_TYPES.has(w.tx.type)) {
      decision = 'debt';
    } else if (w.rule.amountConfidence < threshold) {
      decision = 'confirm_amount';
    } else if ((w.categoryConfidence ?? 0) >= threshold) {
      decision = 'save';
    } else if (aiDown) {
      // AI outage must not lose the transaction (TZ §45): amount is certain,
      // so save it and categorize later.
      decision = 'save';
      categoryPending = true;
      w.tx.category_id = null;
    } else {
      decision = 'confirm_category';
    }
    const confidence = Math.min(w.rule.amountConfidence, w.typeConfidence, w.categoryConfidence ?? 1);
    return {
      tx: { ...w.tx, confidence: Math.round(confidence * 1000) / 1000 },
      decision,
      categoryPending,
      categorySource: w.categorySource,
      returnDirection: w.rule.flags.returnDirection,
      categoryCandidates: w.rule.flags.categoryCandidates.filter((k) => keys.has(k)),
      contentTokens: w.rule.contentTokens,
    };
  });

  return { kind: 'items', items, ai: aiStatus, usage, maskedText };
}

/**
 * Merges AI output into the rule-based items. AI may refine type/category,
 * but amounts come only from deterministic parsing: AI items whose amount
 * does not match a parsed amount are discarded (never invent amounts).
 */
function mergeAI(
  work: Working[],
  rawItems: unknown[],
  allowedFor: (type: TransactionType, key: string | null) => boolean,
  threshold: number,
): void {
  const valid: ParsedTransaction[] = [];
  for (const raw of rawItems) {
    const r = parsedTransactionSchema.safeParse(raw);
    if (r.success) valid.push(r.data);
  }
  const used = new Set<number>();
  for (const w of work) {
    const idx = valid.findIndex((a, i) => !used.has(i) && a.amount === w.tx.amount && a.currency === w.tx.currency);
    if (idx < 0) continue;
    used.add(idx);
    const a = valid[idx]!;

    // Type: AI may override only the weak default ("expense" with no signal).
    if (a.type !== w.tx.type && w.typeConfidence < 0.95 && a.confidence >= threshold) {
      w.tx.type = a.type;
      w.typeConfidence = a.confidence;
      if (DEBT_TYPES.has(a.type)) {
        w.tx.category_id = null;
        w.categoryConfidence = null;
        w.tx.counterparty = a.counterparty ?? w.tx.counterparty;
        continue;
      }
    }
    if (DEBT_TYPES.has(w.tx.type)) {
      w.tx.counterparty ??= a.counterparty;
      continue;
    }
    // Category: user rules are never overridden; keywords only when weak.
    if (w.categorySource === 'user_rule') continue;
    if ((w.categoryConfidence ?? 0) < threshold && allowedFor(w.tx.type, a.category_id)) {
      w.tx.category_id = a.category_id;
      w.categoryConfidence = a.confidence;
      w.categorySource = 'ai';
    }
  }
}
