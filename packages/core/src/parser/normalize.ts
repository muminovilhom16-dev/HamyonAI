/**
 * Text normalization shared by every parser stage. Everything is reduced to a
 * single lowercase Latin form so Uzbek Latin, Uzbek Cyrillic, Russian and
 * mixed-script input ("тaкси" with a Latin "a") hit the same dictionaries.
 */

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h',
};

const APOSTROPHES = /[ʻʼ'`‘’ʹ′´]/g;

export function unifyApostrophes(s: string): string {
  return s.replace(APOSTROPHES, "'");
}

export function transliterate(s: string): string {
  let out = '';
  for (const ch of s) out += CYR_TO_LAT[ch] ?? ch;
  return out;
}

/** Lowercase + apostrophes + Cyrillic→Latin for a single word. */
export function normalizeWord(word: string): string {
  return transliterate(unifyApostrophes(word.toLowerCase()))
    .replace(/[^a-z0-9'$+.,-]/g, '')
    .replace(/^'+|'+$/g, '');
}

/** Same as normalizeWord but also drops apostrophes: "go'sht" → "gosht". */
export function foldWord(word: string): string {
  return normalizeWord(word).replace(/'/g, '');
}

export interface Token {
  /** Text exactly as the user wrote it. */
  raw: string;
  /** Normalized Latin lowercase form (apostrophes kept). */
  norm: string;
  /** Normalized form without apostrophes, for dictionary lookups. */
  fold: string;
  start: number;
  end: number;
  kind: 'number' | 'word' | 'sep' | 'symbol' | 'ordinal';
}

// Order matters: ordinals/dates ("15-sentabr") before plain numbers.
const TOKEN_RE = /\d{1,2}:\d{2}|\d+-[\p{L}']+|[+-]?\d+(?:[.,]\d+)*|[\p{L}\p{M}][\p{L}\p{M}'ʻʼ‘’`]*|[$€]|[,;\n]/gu;

export function tokenize(input: string): Token[] {
  // Split glued forms: "20k" → "20 k", "50$" → "50 $", "$50" → "$ 50", "1.5mln" → "1.5 mln".
  const text = input
    .replace(/(\d)([\p{L}$€])/gu, '$1 $2')
    .replace(/([$€])(\d)/g, '$1 $2');
  // Glued splitting changes offsets; map back by tracking inserted spaces.
  const offsetMap: number[] = [];
  {
    let i = 0;
    let j = 0;
    while (j < text.length) {
      if (i < input.length && text[j] === input[i]) {
        offsetMap[j] = i;
        i++;
      } else {
        offsetMap[j] = i;
      }
      j++;
    }
    offsetMap[text.length] = input.length;
  }

  const tokens: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const start = offsetMap[m.index!]!;
    const end = offsetMap[m.index! + raw.length]!;
    let kind: Token['kind'];
    if (/^[,;\n]$/.test(raw)) kind = 'sep';
    else if (/^[$€]$/.test(raw)) kind = 'symbol';
    else if (/^\d+[-:]/.test(raw)) kind = 'ordinal';
    else if (/^[+-]?\d/.test(raw)) kind = 'number';
    else kind = 'word';
    const norm = kind === 'word' ? normalizeWord(raw) : raw.toLowerCase();
    tokens.push({ raw: input.slice(start, end), norm, fold: norm.replace(/'/g, ''), start, end, kind });
  }
  return mergeDigitGroups(input, tokens);
}

/** "20 000" / "1 500 000" → one number token (single space or nbsp between groups). */
function mergeDigitGroups(input: string, tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === 'number' &&
      t.kind === 'number' &&
      /^\d{3}$/.test(t.raw) &&
      /^[+-]?\d{1,3}(?:[  ]\d{3})*$/.test(prev.raw) &&
      /^[  ]$/.test(input.slice(prev.end, t.start))
    ) {
      const raw = input.slice(prev.start, t.end);
      out[out.length - 1] = { ...prev, raw, norm: raw, fold: raw, end: t.end };
      continue;
    }
    out.push(t);
  }
  return out;
}
