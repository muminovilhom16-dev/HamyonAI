import { extractAmounts, type AmountMatch } from './amount';
import { DEBT_TYPES, type ParsedTransaction, type TransactionType } from './contract';
import {
  CATEGORY_KEYWORDS,
  DATE_PHRASES,
  DATE_WORDS,
  DEBT_GIVE_WORDS,
  DEBT_TAKE_WORDS,
  DEBT_WORDS,
  INCOME_SLUGS,
  INCOME_WORDS,
  PERSON_STEMS,
  RETURN_ANY_WORDS,
  RETURN_BY_ME_WORDS,
  RETURN_TO_ME_WORDS,
  STOP_WORDS,
} from './keywords';
import { tokenize, type Token } from './normalize';
import { UNIT_WORDS, scaleOf } from './numbers';

export interface RuleItem {
  tx: ParsedTransaction;
  amountConfidence: number;
  typeConfidence: number;
  /** null when type needs no category (debts). */
  categoryConfidence: number | null;
  flags: {
    assumedThousands: boolean;
    ambiguousPerson: boolean;
    categoryCandidates: string[];
    /** debt_return only: who paid back. */
    returnDirection: 'to_me' | 'by_me' | null;
  };
  /** Folded content words, used for user category rules. */
  contentTokens: string[];
  /** Original text of this item's segment. */
  segment: string;
}

export interface RuleParseResult {
  items: RuleItem[];
  /** Folded content words of the whole input (for "ask amount" flows). */
  contentTokens: string[];
  dateOffset: number;
}

const PERSON_SUFFIXES = ['', 'ga', 'm', 'mga', 'ning', 'mning', 'dan', 'mdan', 'ni', 'mni', 'lar', 'larga', 'jon', 'jonga'];
const NAME_SUFFIXES = ['ga', 'dan', 'ning', 'ni', 'ga'];

const ALL_KEYWORDS = new Set(Object.values(CATEGORY_KEYWORDS).flat());

function personStem(t: Token): string | null {
  if (t.kind !== 'word') return null;
  for (const stem of PERSON_STEMS) {
    if (!t.fold.startsWith(stem)) continue;
    const suffix = t.fold.slice(stem.length);
    if (PERSON_SUFFIXES.includes(suffix)) return stem;
  }
  return null;
}

function keywordMatches(fold: string, kw: string): boolean {
  return fold === kw || (kw.length >= 4 && fold.startsWith(kw));
}

function isKnownWord(fold: string): boolean {
  for (const kw of ALL_KEYWORDS) if (!kw.includes(' ') && keywordMatches(fold, kw)) return true;
  return false;
}

/** Capitalized "Sardordan"/"Murodga" (not a known shop/keyword) → "Sardor"/"Murod". */
function nameWithCase(t: Token): string | null {
  if (t.kind !== 'word' || !/^\p{Lu}/u.test(t.raw)) return null;
  for (const suf of NAME_SUFFIXES) {
    if (t.fold.length > suf.length + 2 && t.fold.endsWith(suf)) {
      const stemFold = t.fold.slice(0, -suf.length);
      if (isKnownWord(stemFold) || isKnownWord(t.fold)) return null;
      return t.raw.slice(0, t.raw.length - suf.length);
    }
  }
  return null;
}

function hasWord(tokens: Token[], words: string[]): boolean {
  const folded = tokens.map((t) => t.fold);
  return words.some((w) => {
    const parts = w.split(' ');
    if (parts.length === 1) return folded.includes(w);
    return folded.some((_, i) => parts.every((p, j) => folded[i + j] === p));
  });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function detectDateOffset(tokens: Token[]): { offset: number; indices: Set<number> } {
  const indices = new Set<number>();
  let offset = 0;
  tokens.forEach((t, i) => {
    if (t.kind === 'word' && DATE_WORDS[t.fold] !== undefined) {
      offset = DATE_WORDS[t.fold]!;
      indices.add(i);
    }
  });
  for (const [phrase, off] of DATE_PHRASES) {
    for (let i = 0; i + phrase.length <= tokens.length; i++) {
      if (phrase.every((p, j) => tokens[i + j]!.fold === p)) {
        offset = off;
        phrase.forEach((_, j) => indices.add(i + j));
      }
    }
  }
  return { offset, indices };
}

function categorize(tokens: Token[], allowed: (slug: string) => boolean): { slug: string | null; confidence: number; candidates: string[] } {
  const folded = tokens.filter((t) => t.kind === 'word').map((t) => t.fold);
  const joined = ` ${folded.join(' ')} `;
  const scores = new Map<string, number>();
  for (const [slug, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!allowed(slug)) continue;
    let best = 0;
    for (const kw of kws) {
      const hit = kw.includes(' ') ? joined.includes(` ${kw} `) : folded.some((w) => keywordMatches(w, kw));
      if (hit) best = Math.max(best, kw.length);
    }
    if (best > 0) scores.set(slug, best);
  }
  if (scores.size === 0) return { slug: null, confidence: 0, candidates: [] };
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0]!;
  const tied = ranked.filter(([, s]) => s === top[1]).map(([slug]) => slug);
  if (tied.length > 1) return { slug: tied[0]!, confidence: 0.6, candidates: tied };
  // A clearly longer match wins; a close runner-up lowers confidence a bit.
  const runnerUp = ranked[1];
  const confidence = runnerUp && top[1] - runnerUp[1] <= 1 ? 0.75 : 0.95;
  return { slug: top[0], confidence, candidates: ranked.map(([s]) => s) };
}

function isAmountWord(t: Token): boolean {
  return t.kind === 'word' && (UNIT_WORDS[t.fold] !== undefined || scaleOf(t.fold, true) !== null);
}

/** Splits tokens into segments by separators; amount-less segments merge into a neighbour. */
function segment(tokens: Token[], amounts: AmountMatch[]): Array<{ from: number; to: number; amounts: AmountMatch[] }> {
  const raw: Array<{ from: number; to: number }> = [];
  let from = 0;
  tokens.forEach((t, i) => {
    if (t.kind === 'sep') {
      raw.push({ from, to: i });
      from = i + 1;
    }
  });
  raw.push({ from, to: tokens.length });
  const segs = raw
    .filter((s) => s.to > s.from)
    .map((s) => ({ ...s, amounts: amounts.filter((a) => a.startIdx >= s.from && a.endIdx <= s.to) }));
  const merged: typeof segs = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && (s.amounts.length === 0 || prev.amounts.length === 0)) {
      merged[merged.length - 1] = { from: prev.from, to: s.to, amounts: [...prev.amounts, ...s.amounts] };
    } else {
      merged.push(s);
    }
  }
  return merged;
}

/**
 * Deterministic parser. Works with no network/AI at all (TZ §45 fallback),
 * and also provides the trusted amount candidates that any AI output is
 * checked against.
 */
export function parseRuleBased(text: string, ctx: { today: string }): RuleParseResult {
  const tokens = tokenize(text);
  const amounts = extractAmounts(tokens);
  const { offset, indices: dateIdx } = detectDateOffset(tokens);
  const date = addDays(ctx.today, offset);

  const amountIdx = new Set<number>();
  for (const a of amounts) for (let i = a.startIdx; i < a.endIdx; i++) amountIdx.add(i);

  const isContent = (t: Token, i: number) =>
    t.kind === 'word' && !amountIdx.has(i) && !dateIdx.has(i) && !isAmountWord(t);

  const contentOf = (range: Array<[Token, number]>) =>
    range.filter(([t, i]) => isContent(t, i) && !STOP_WORDS.has(t.fold)).map(([t]) => t.fold);

  const indexed = tokens.map((t, i) => [t, i] as [Token, number]);
  const items: RuleItem[] = [];

  for (const seg of segment(tokens, amounts)) {
    seg.amounts.forEach((amount, k) => {
      // Words for this amount: those before it (since the previous amount);
      // if none, those after it (up to the next amount).
      const prevEnd = k === 0 ? seg.from : seg.amounts[k - 1]!.endIdx;
      const nextStart = k === seg.amounts.length - 1 ? seg.to : seg.amounts[k + 1]!.startIdx;
      const leading = indexed.slice(prevEnd, amount.startIdx);
      const trailing = indexed.slice(amount.endIdx, nextStart);
      const leadingHasContent = leading.some(([t, i]) => isContent(t, i));
      const isLast = k === seg.amounts.length - 1;
      const range = leadingHasContent ? (isLast ? [...leading, ...trailing] : leading) : trailing;
      const itemTokens = range.map(([t]) => t);
      const segTokens = indexed.slice(seg.from, seg.to).map(([t]) => t);
      items.push(buildItem(text, amount, range, segTokens, itemTokens, isContent, contentOf(range), date));
    });
  }

  return { items, contentTokens: contentOf(indexed), dateOffset: offset };
}

function buildItem(
  text: string,
  amount: AmountMatch,
  range: Array<[Token, number]>,
  segTokens: Token[],
  itemTokens: Token[],
  isContent: (t: Token, i: number) => boolean,
  contentTokens: string[],
  date: string,
): RuleItem {
  // Type: debt words are checked on the whole segment ("300 ming qarz berdim").
  let type: TransactionType = 'expense';
  let typeConfidence = 0.9;
  let returnDirection: RuleItem['flags']['returnDirection'] = null;

  if (hasWord(segTokens, DEBT_WORDS)) {
    if (hasWord(segTokens, RETURN_BY_ME_WORDS)) {
      type = 'debt_return'; returnDirection = 'by_me'; typeConfidence = 0.95;
    } else if (hasWord(segTokens, RETURN_TO_ME_WORDS)) {
      type = 'debt_return'; returnDirection = 'to_me'; typeConfidence = 0.95;
    } else if (hasWord(segTokens, RETURN_ANY_WORDS)) {
      type = 'debt_return'; returnDirection = null; typeConfidence = 0.9;
    } else if (hasWord(segTokens, DEBT_GIVE_WORDS)) {
      type = 'debt_given'; typeConfidence = 0.97;
    } else if (hasWord(segTokens, DEBT_TAKE_WORDS)) {
      type = 'debt_taken'; typeConfidence = 0.97;
    } else {
      type = 'debt_given'; typeConfidence = 0.5;
    }
  } else if (hasWord(segTokens, RETURN_BY_ME_WORDS)) {
    type = 'debt_return'; returnDirection = 'by_me'; typeConfidence = 0.9;
  } else if (hasWord(segTokens, RETURN_TO_ME_WORDS)) {
    type = 'debt_return'; returnDirection = 'to_me'; typeConfidence = 0.9;
  } else if (amount.sign === '+' || hasWord(segTokens, INCOME_WORDS)) {
    type = 'income'; typeConfidence = 0.95;
  } else if (amount.sign === '-') {
    typeConfidence = 0.95;
  }

  // Counterparty: "Murod akaga" → "Murod aka", "Sardordan" → "Sardor".
  let counterparty: string | null = null;
  const words = range.filter(([t]) => t.kind === 'word');
  for (let j = 0; j < words.length && !counterparty; j++) {
    const [t] = words[j]!;
    const stem = personStem(t);
    if (stem) {
      const prev = words[j - 1]?.[0];
      const stemRaw = t.raw.slice(0, stem.length);
      counterparty = prev && /^\p{Lu}/u.test(prev.raw) ? `${prev.raw} ${stemRaw}` : stemRaw;
    } else {
      counterparty = nameWithCase(t);
    }
  }

  // Debts need a person: fall back to a capitalized word that is not a
  // known keyword ("Саша вернул 50к", "Aziz 100 ming qaytardi").
  if (!counterparty && DEBT_TYPES.has(type)) {
    const debtWords = new Set([...DEBT_WORDS, ...DEBT_GIVE_WORDS, ...DEBT_TAKE_WORDS, ...RETURN_TO_ME_WORDS, ...RETURN_BY_ME_WORDS, ...RETURN_ANY_WORDS]);
    const name = words.find(([t]) => /^\p{Lu}/u.test(t.raw) && !debtWords.has(t.fold) && !STOP_WORDS.has(t.fold) && !isKnownWord(t.fold));
    if (name) counterparty = name[0].raw;
  }

  // Category
  let category: ReturnType<typeof categorize> = { slug: null, confidence: 0, candidates: [] };
  if (type === 'expense') {
    category = categorize(itemTokens, (s) => !INCOME_SLUGS.has(s));
  } else if (type === 'income') {
    category = categorize(itemTokens, (s) => INCOME_SLUGS.has(s));
    if (!category.slug) category = { slug: 'other_income', confidence: 0.9, candidates: ['other_income'] };
  }

  const ambiguousPerson = type === 'expense' && counterparty !== null && category.slug === null;

  const noteTokens = range.filter(([t, i]) => isContent(t, i) && !STOP_WORDS.has(t.fold)).map(([t]) => t.raw);
  let note = noteTokens.join(' ').slice(0, 200) || null;
  if (note) note = note[0]!.toUpperCase() + note.slice(1);

  const amountConfidence = amount.assumedThousands ? 0.6 : 0.97;
  const categoryConfidence = DEBT_TYPES.has(type) ? null : category.confidence;
  const confidence = Math.min(amountConfidence, typeConfidence, categoryConfidence ?? 1);

  return {
    tx: {
      type,
      amount: amount.value,
      currency: amount.currency,
      category_id: category.slug,
      note,
      counterparty,
      date,
      confidence,
    },
    amountConfidence,
    typeConfidence,
    categoryConfidence,
    flags: { assumedThousands: amount.assumedThousands, ambiguousPerson, categoryCandidates: category.candidates, returnDirection },
    contentTokens,
    segment: text.slice(segTokens[0]?.start ?? 0, segTokens[segTokens.length - 1]?.end ?? text.length),
  };
}
