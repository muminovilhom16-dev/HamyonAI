import { describe, expect, it } from 'vitest';
import { parseRuleBased } from '../src/parser/rule-parser';

const today = '2026-10-01';
const parse = (s: string) => parseRuleBased(s, { today });
const single = (s: string) => {
  const r = parse(s);
  expect(r.items, s).toHaveLength(1);
  return r.items[0]!;
};

describe('TZ §61 acceptance (rule parser part)', () => {
  it('taksi 20 ming → 20 000 UZS, Transport', () => {
    const it = single('taksi 20 ming');
    expect(it.tx).toMatchObject({ type: 'expense', amount: 20_000, currency: 'UZS', category_id: 'transport', date: today });
    expect(it.tx.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('taksi 20 → 20 000, Transport, needs confirmation', () => {
    const it = single('taksi 20');
    expect(it.tx).toMatchObject({ amount: 20_000, category_id: 'transport' });
    expect(it.flags.assumedThousands).toBe(true);
    expect(it.tx.confidence).toBeLessThan(0.8);
  });

  it('такси 15к → 15 000, Transport', () => {
    expect(single('такси 15к').tx).toMatchObject({ amount: 15_000, category_id: 'transport' });
  });

  it("bozordan go'sht oldim yuz ellik ming → 150 000, Oziq-ovqat", () => {
    const it = single("bozordan go'sht oldim yuz ellik ming");
    expect(it.tx).toMatchObject({ type: 'expense', amount: 150_000, category_id: 'food', counterparty: null });
    expect(it.tx.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('non 5 ming, sut 12 ming → two transactions', () => {
    const r = parse('non 5 ming, sut 12 ming');
    expect(r.items.map((i) => [i.tx.amount, i.tx.category_id, i.tx.note])).toEqual([
      [5_000, 'food', 'Non'],
      [12_000, 'food', 'Sut'],
    ]);
  });

  it("kompyuterga windows o'rnatish 70 ming → Texnika va xizmatlar", () => {
    expect(single("kompyuterga windows o'rnatish 70 ming").tx).toMatchObject({ amount: 70_000, category_id: 'tech_services' });
  });

  it('kompyuter windows ustanovkasi → same category', () => {
    expect(single('kompyuter windows ustanovkasi 70 ming').tx.category_id).toBe('tech_services');
    expect(single("kompyuterga windows qo'yish 50 ming").tx.category_id).toBe('tech_services');
  });

  it('Murod akaga 300 ming qarz berdim → debt, NOT expense', () => {
    expect(single('Murod akaga 300 ming qarz berdim').tx).toMatchObject({
      type: 'debt_given', amount: 300_000, counterparty: 'Murod aka', category_id: null,
    });
  });

  it('Murod aka 100 ming qaytardi → debt_return to me', () => {
    const it = single('Murod aka 100 ming qaytardi');
    expect(it.tx).toMatchObject({ type: 'debt_return', amount: 100_000, counterparty: 'Murod aka' });
    expect(it.flags.returnDirection).toBe('to_me');
  });

  it('oylik tushdi 6 mln → income', () => {
    expect(single('oylik tushdi 6 mln').tx).toMatchObject({ type: 'income', amount: 6_000_000, category_id: 'salary' });
  });

  it('50$ kurtka → 50 USD, Kiyim', () => {
    expect(single('50$ kurtka').tx).toMatchObject({ amount: 50, currency: 'USD', category_id: 'clothing', note: 'Kurtka' });
  });

  it('bugun bozorga bordim → no amount', () => {
    expect(parse('bugun bozorga bordim').items).toEqual([]);
  });
});

describe('types', () => {
  it.each([
    ['+500 ming', 'income'],
    ['зарплата 5 млн', 'income'],
    ['Sardordan 1 mln qarz oldim', 'debt_taken'],
    ['Akamga 200 ming qarzni qaytardim', 'debt_return'],
    ['taksi 20 ming', 'expense'],
  ])('%s → %s', (input, type) => {
    expect(single(input).tx.type).toBe(type);
  });

  it('Sardordan → counterparty Sardor', () => {
    expect(single('Sardordan 1 mln qarz oldim').tx.counterparty).toBe('Sardor');
  });

  it('Bozordan is a place, not a person', () => {
    expect(single('Bozordan 50 ming').tx.counterparty).toBeNull();
  });
});

describe('ambiguous person payment (TZ §11)', () => {
  it('Murod akaga 300 ming → ask debt or expense', () => {
    const it = single('Murod akaga 300 ming');
    expect(it.flags.ambiguousPerson).toBe(true);
    expect(it.tx.counterparty).toBe('Murod aka');
    expect(it.tx.category_id).toBeNull();
  });
});

describe('dates', () => {
  it.each([
    ['kecha taksi 20 ming', '2026-09-30'],
    ['вчера такси 20к', '2026-09-30'],
    ["o'tgan kuni taksi 20 ming", '2026-09-29'],
    ['bugun taksi 20 ming', today],
  ])('%s → %s', (input, date) => {
    const it = single(input);
    expect(it.tx.date).toBe(date);
    expect(it.tx.note).toBe(input.includes('такси') ? 'Такси' : 'Taksi');
  });
});

describe('categories', () => {
  it.each([
    ['Korzinka 230 ming', 'food'],
    ['Makro 120 ming', 'food'],
    ['Yandex Go 18 ming', 'transport'],
    ['metro 2 ming', 'transport'],
    ['gaz 80 ming', 'utilities'],
    ['svet 120 ming', 'utilities'],
    ['dorixona 45 ming', 'health'],
    ['kino 60 ming', 'entertainment'],
    ['internet 99 ming', 'telecom'],
    ['kafe 85 ming', 'cafe'],
    ['кофе 25к', 'cafe'],
    ['kredit 1.2 mln', 'loans'],
    ['kurs 500 ming', 'education'],
    ["to'yga 500 ming", 'celebrations'],
    ['аптека 30 тысяч', 'health'],
  ])('%s → %s', (input, slug) => {
    expect(single(input).tx.category_id).toBe(slug);
  });

  it('unknown words leave category empty for AI/pending', () => {
    const it = single('qwerty 20 ming');
    expect(it.tx.category_id).toBeNull();
    expect(it.categoryConfidence).toBe(0);
  });
});

describe('debt counterparty fallback', () => {
  it.each([
    ['Саша вернул 50к', 'Саша', 'debt_return'],
    ['Aziz 100 ming qaytardi', 'Aziz', 'debt_return'],
    ['дал в долг Мурод ака 300к', 'Мурод ака', 'debt_given'],
    ['Мурод ака вернул 100к', 'Мурод ака', 'debt_return'],
  ])('%s → %s', (input, name, type) => {
    const r = parseRuleBased(input, { today: '2026-10-01' });
    expect(r.items[0]!.tx).toMatchObject({ counterparty: name, type });
  });

  it('expenses do not invent a counterparty from a capitalized shop name', () => {
    expect(parseRuleBased('Korzinka 50 ming', { today: '2026-10-01' }).items[0]!.tx.counterparty).toBeNull();
  });
});
