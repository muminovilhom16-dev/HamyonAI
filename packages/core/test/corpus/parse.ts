/** Corpus line: `text | amounts (a+b) | type | category-or-dash`. Lines starting with # are section tags. */
export interface Case { text: string; amounts: number[]; type: string; category: string | null; tag: string }

export function parseCorpus(src: string): Case[] {
  const out: Case[] = [];
  let tag = '';
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { tag = line.slice(1).trim(); continue; }
    const [text, amounts, type, category] = line.split('|').map((s) => s.trim());
    out.push({
      text: text!,
      amounts: amounts ? amounts.split('+').map(Number) : [],
      type: type || 'expense',
      category: !category || category === '-' ? null : category,
      tag,
    });
  }
  return out;
}
