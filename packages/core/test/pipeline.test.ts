import { describe, expect, it, vi } from 'vitest';
import { AIUnavailableError, type AIProvider, type CategoryOption } from '@hamyon/ai';
import { SYSTEM_CATEGORIES } from '../src/categories';
import { runPipeline, type PipelineInput } from '../src/parser/pipeline';

const categories: CategoryOption[] = SYSTEM_CATEGORIES.map((c) => ({ slug: c.slug, name: c.names.uz_latn, kind: c.kind }));
const usage = { provider: 'fake', model: 'fake', inputTokens: 10, outputTokens: 5, costUsdMicros: 1, latencyMs: 1 };

function fakeAI(items: unknown[] | Error): AIProvider & { calls: number } {
  const p = {
    name: 'fake',
    calls: 0,
    async parseText() {
      p.calls++;
      if (items instanceof Error) throw items;
      return { items, usage };
    },
    async categorize() {
      return { slug: null, confidence: 0, usage };
    },
  };
  return p;
}

const run = (text: string, over: Partial<PipelineInput> = {}) =>
  runPipeline({ text, today: '2026-10-01', language: 'uz_latn', categories, userRules: [], ai: null, confidenceThreshold: 0.8, ...over });

const aiItem = (o: Record<string, unknown>) => ({
  type: 'expense', currency: 'UZS', category_id: null, note: null, counterparty: null, date: '2026-10-01', confidence: 0.95, ...o,
});

describe('pipeline: confident rule results skip AI (cost control)', () => {
  it('taksi 20 ming saves without calling AI', async () => {
    const ai = fakeAI([]);
    const r = await run('taksi 20 ming', { ai });
    expect(ai.calls).toBe(0);
    expect(r.kind).toBe('items');
    if (r.kind !== 'items') return;
    expect(r.items[0]).toMatchObject({ decision: 'save', tx: { amount: 20_000, category_id: 'transport' } });
  });

  it('taksi 20 asks to confirm the amount', async () => {
    const r = await run('taksi 20');
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]!.decision).toBe('confirm_amount');
    expect(r.items[0]!.tx.amount).toBe(20_000);
  });

  it('bugun bozorga bordim → no_amount, nothing to save, AI not called', async () => {
    const ai = fakeAI([aiItem({ amount: 50_000 })]);
    const r = await run('bugun bozorga bordim', { ai });
    expect(r.kind).toBe('no_amount');
    expect(ai.calls).toBe(0);
  });
});

describe('pipeline: AI refinement', () => {
  it('uses AI category for unknown words', async () => {
    const ai = fakeAI([aiItem({ amount: 40_000, category_id: 'entertainment', confidence: 0.9 })]);
    const r = await run('xyz 40 ming', { ai });
    if (r.kind !== 'items') throw new Error();
    expect(ai.calls).toBe(1);
    expect(r.ai).toBe('used');
    expect(r.usage).toEqual(usage);
    expect(r.items[0]).toMatchObject({ decision: 'save', categorySource: 'ai', tx: { category_id: 'entertainment' } });
  });

  it('never accepts an AI amount that is not in the text', async () => {
    const r = await run('xyz 40 ming', { ai: fakeAI([aiItem({ amount: 45_000, category_id: 'food' })]) });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]!.tx.amount).toBe(40_000);
    expect(r.items[0]!.tx.category_id).not.toBe('food');
    expect(r.items[0]!.decision).toBe('confirm_category');
  });

  it('rejects schema-invalid AI items', async () => {
    const r = await run('xyz 40 ming', {
      ai: fakeAI([{ type: 'expense', amount: 40000.5, currency: 'UZS' }, aiItem({ amount: 40_000, category_id: 'food', type: 'gift' })]),
    });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]!.decision).toBe('confirm_category');
  });

  it('rejects AI categories that do not exist or mismatch the type', async () => {
    const r = await run('xyz 40 ming', { ai: fakeAI([aiItem({ amount: 40_000, category_id: 'salary' })]) });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]!.tx.category_id).toBeNull();
  });

  it('low AI confidence asks the user to pick a category', async () => {
    const r = await run('xyz 40 ming', { ai: fakeAI([aiItem({ amount: 40_000, category_id: 'food', confidence: 0.5 })]) });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]!.decision).toBe('confirm_category');
  });

  it('AI may turn a weak default expense into a debt, but debt is never an expense', async () => {
    const r = await run('Alisherga 100 ming', {
      ai: fakeAI([aiItem({ amount: 100_000, type: 'debt_given', counterparty: 'Alisher', confidence: 0.9 })]),
    });
    if (r.kind !== 'items') throw new Error();
    // Payment to a person is ambiguous: the user is asked, AI is not trusted here.
    expect(r.items[0]!.decision).toBe('ask_person_kind');
  });
});

describe('pipeline: AI outage (TZ §45, rule 9)', () => {
  it('taksi 20 ming still becomes a transaction when AI is down', async () => {
    const ai = fakeAI(new AIUnavailableError('timeout'));
    const r = await run('taksi 20 ming', { ai });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]).toMatchObject({ decision: 'save', categoryPending: false, tx: { category_id: 'transport' } });
  });

  it('unknown category + AI down → saved with pending category, not lost', async () => {
    const onAIError = vi.fn();
    const r = await run('xyz 40 ming', { ai: fakeAI(new AIUnavailableError('api_error')), onAIError });
    if (r.kind !== 'items') throw new Error();
    expect(r.ai).toBe('unavailable');
    expect(r.items[0]).toMatchObject({ decision: 'save', categoryPending: true, tx: { amount: 40_000, category_id: null } });
    expect(onAIError).toHaveBeenCalledOnce();
  });

  it('unexpected provider exceptions are also contained', async () => {
    const r = await run('xyz 40 ming', { ai: fakeAI(new Error('socket hang up')) });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]!.categoryPending).toBe(true);
  });

  it('AI not configured behaves like an outage', async () => {
    const r = await run('xyz 40 ming');
    if (r.kind !== 'items') throw new Error();
    expect(r.ai).toBe('disabled');
    expect(r.items[0]!.decision).toBe('save');
  });
});

describe('pipeline: user category rules (TZ §10)', () => {
  it('user rule beats keywords and AI, and AI is not called', async () => {
    const ai = fakeAI([aiItem({ amount: 70_000, category_id: 'tech_services' })]);
    const r = await run('kompyuter windows ustanovkasi 70 ming', {
      ai,
      userRules: [{ pattern: 'windows', categoryKey: 'education' }],
    });
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]).toMatchObject({ categorySource: 'user_rule', tx: { category_id: 'education' }, decision: 'save' });
    expect(ai.calls).toBe(0);
  });
});

describe('pipeline: privacy', () => {
  it('masks card numbers before AI and in returned text', async () => {
    let sent = '';
    const ai: AIProvider = {
      name: 'spy',
      async parseText(i) { sent = i.text; return { items: [], usage }; },
      async categorize() { return { slug: null, confidence: 0, usage }; },
    };
    const r = await run('8600123412341234 xyz 40 ming', { ai });
    expect(sent).not.toContain('8600123412341234');
    expect(sent).toContain('****1234');
    expect(r.maskedText).not.toContain('8600123412341234');
  });
});

describe('pipeline: multiple + debt + income', () => {
  it('non 5 ming, sut 12 ming → two saves', async () => {
    const r = await run('non 5 ming, sut 12 ming');
    if (r.kind !== 'items') throw new Error();
    expect(r.items.map((i) => [i.tx.amount, i.decision])).toEqual([[5_000, 'save'], [12_000, 'save']]);
  });

  it('debt goes to the debt engine', async () => {
    const r = await run('Murod akaga 300 ming qarz berdim');
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]).toMatchObject({ decision: 'debt', tx: { type: 'debt_given', category_id: null } });
  });

  it('income is saved as income', async () => {
    const r = await run('oylik tushdi 6 mln');
    if (r.kind !== 'items') throw new Error();
    expect(r.items[0]).toMatchObject({ decision: 'save', tx: { type: 'income', category_id: 'salary' } });
  });
});
