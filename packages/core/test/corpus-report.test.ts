import { describe, expect, it } from 'vitest';
import { parseRuleBased } from '../src/parser/rule-parser';
import { DEV } from './corpus/dev';
import { HOLDOUT } from './corpus/holdout';
import { parseCorpus, type Case } from './corpus/parse';

/**
 * Phase 7 corpus (TZ §60). Measures the deterministic layer alone — the
 * worst case, i.e. when AI is down. Category numbers:
 *   precision = when the parser assigns a category, it is the right one
 *   coverage  = share of cases where it assigns one (the rest go to AI / user)
 * A wrong silent category is worse than none, so precision is the gate.
 */
interface Result { c: Case; amountOk: boolean; typeOk: boolean; catAssigned: boolean; catOk: boolean; got: string }

function evaluate(cases: Case[]): Result[] {
  return cases.map((c) => {
    const r = parseRuleBased(c.text, { today: '2026-10-01' });
    const amounts = r.items.map((i) => i.tx.amount);
    const amountOk = JSON.stringify(amounts) === JSON.stringify(c.amounts);
    const typeOk = c.amounts.length === 0 || r.items.every((i) => i.tx.type === c.type);
    const cats = r.items.map((i) => i.tx.category_id);
    const catAssigned = cats.length > 0 && cats.every((x) => x !== null);
    const catOk = c.category === null ? true : catAssigned && cats.every((x) => x === c.category);
    return { c, amountOk, typeOk, catAssigned, catOk, got: `${JSON.stringify(amounts)} ${r.items.map((i) => `${i.tx.type}/${i.tx.category_id}`).join(' ')}` };
  });
}

function metrics(results: Result[]) {
  const withCat = results.filter((r) => r.c.category !== null);
  const assigned = withCat.filter((r) => r.catAssigned);
  return {
    cases: results.length,
    amount: results.filter((r) => r.amountOk).length / results.length,
    type: results.filter((r) => r.typeOk).length / results.length,
    categoryPrecision: assigned.filter((r) => r.catOk).length / Math.max(assigned.length, 1),
    categoryCoverage: assigned.length / Math.max(withCat.length, 1),
    categoryEndToEnd: withCat.filter((r) => r.catOk).length / Math.max(withCat.length, 1),
  };
}

const dev = evaluate(parseCorpus(DEV));
const holdout = evaluate(parseCorpus(HOLDOUT));
const all = [...dev, ...holdout];

describe('Phase 7 corpus', () => {
  it('has 300+ messages', () => {
    expect(all.length).toBeGreaterThanOrEqual(300);
  });

  it('report', () => {
    const fmt = (m: ReturnType<typeof metrics>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, k === 'cases' ? v : `${(v * 100).toFixed(1)}%`]));
    console.log('DEV', JSON.stringify(fmt(metrics(dev))));
    console.log('HOLDOUT', JSON.stringify(fmt(metrics(holdout))));
    console.log('ALL', JSON.stringify(fmt(metrics(all))));
    for (const r of all.filter((x) => !x.amountOk || !x.typeOk || (x.catAssigned && !x.catOk) || (x.c.category && !x.catAssigned))) {
      const why = !r.amountOk ? 'AMOUNT' : !r.typeOk ? 'TYPE' : r.catAssigned ? 'WRONG-CAT' : 'NO-CAT';
      console.log(`${dev.includes(r) ? 'dev' : 'hold'} ${why}: ${r.c.text} → ${r.got} (want ${r.c.amounts.join('+')} ${r.c.type}/${r.c.category ?? '-'})`);
    }
  });

  it('amount accuracy ≥ 98% (TZ §60)', () => {
    expect(metrics(all).amount).toBeGreaterThanOrEqual(0.98);
  });

  it('type accuracy ≥ 98%', () => {
    expect(metrics(all).type).toBeGreaterThanOrEqual(0.98);
  });

  it('category: a category the parser assigns is right ≥ 95% of the time', () => {
    expect(metrics(all).categoryPrecision).toBeGreaterThanOrEqual(0.95);
  });
});
