import { describe, expect, it } from 'vitest';
import { parseRuleBased } from '../src/parser/rule-parser';

/**
 * Real-world-like corpus (first part of the Phase 7 set). Each row:
 * [message, expected amounts, expected type, expected category | null].
 * `null` category = the rule parser should NOT claim one (AI/user decides).
 * Measures the deterministic layer alone, i.e. the AI-outage worst case.
 */
type Row = [string, number[], string, string | null];

const CORPUS: Row[] = [
  // Uzbek Latin
  ['taksi 25 ming', [25000], 'expense', 'transport'],
  ['taksiga 18 ming berdim', [18000], 'expense', 'transport'],
  ['Yandex taxi 32k', [32000], 'expense', 'transport'],
  ['metro 2 ming', [2000], 'expense', 'transport'],
  ['benzin 150 ming', [150000], 'expense', 'transport'],
  ['zapravka 200k', [200000], 'expense', 'transport'],
  ['avtobus 1500', [1500], 'expense', 'transport'],
  ['Korzinkadan 230 ming', [230000], 'expense', 'food'],
  ['makroda 345 000', [345000], 'expense', 'food'],
  ['bozordan meva 80 ming', [80000], 'expense', 'food'],
  ["go'sht 1 kilo 95 ming", [95000], 'expense', 'food'],
  ['non 4 ming', [4000], 'expense', 'food'],
  ['tuxum 18 ming', [18000], 'expense', 'food'],
  ['kartoshka va piyoz 35 ming', [35000], 'expense', 'food'],
  ['kafe 120 ming', [120000], 'expense', 'cafe'],
  ['tushlik 45 ming', [45000], 'expense', 'cafe'],
  ['Evosdan lavash 32 ming', [32000], 'expense', 'cafe'],
  ['kofe 25 ming', [25000], 'expense', 'cafe'],
  ['choyxonada osh 90 ming', [90000], 'expense', 'cafe'],
  ['gaz puli 85 ming', [85000], 'expense', 'utilities'],
  ['svet 120 ming tooladim', [120000], 'expense', 'utilities'],
  ['suv uchun 30 ming', [30000], 'expense', 'utilities'],
  ['kvartira ijarasi 3 mln', [3000000], 'expense', 'housing'],
  ['internet 99 ming', [99000], 'expense', 'telecom'],
  ['Ucell 50 ming', [50000], 'expense', 'telecom'],
  ['telefonga paynet 20 ming', [20000], 'expense', 'telecom'],
  ["kompyuterga windows o'rnatish 70 ming", [70000], 'expense', 'tech_services'],
  ['noutbuk remont 250 ming', [250000], 'expense', 'tech_services'],
  ['printer 1.2 mln', [1200000], 'expense', 'tech_services'],
  ['dorixona 45 ming', [45000], 'expense', 'health'],
  ['stomatologga 300 ming', [300000], 'expense', 'health'],
  ['dori 67 500', [67500], 'expense', 'health'],
  ['kurtka 450 ming', [450000], 'expense', 'clothing'],
  ['krossovka 600k', [600000], 'expense', 'clothing'],
  ['kiyim-kechak 1 mln', [1000000], 'expense', 'clothing'],
  ['ingliz tili kursi 400 ming', [400000], 'expense', 'education'],
  ['kitob 85 ming', [85000], 'expense', 'education'],
  ["bog'cha 900 ming", [900000], 'expense', 'kids'],
  ['pampers 150 ming', [150000], 'expense', 'kids'],
  ["to'yga 500 ming", [500000], 'expense', 'celebrations'],
  ["tug'ilgan kun sovg'a 200 ming", [200000], 'expense', 'celebrations'],
  ['kredit 1.5 mln', [1500000], 'expense', 'loans'],
  ['uzum nasiya 420 ming', [420000], 'expense', 'loans'],
  ['kino 60 ming', [60000], 'expense', 'entertainment'],
  ['netflix 10$', [10], 'expense', 'entertainment'],
  // Number words
  ['taksi yigirma besh ming', [25000], 'expense', 'transport'],
  ["bozordan go'sht oldim yuz ellik ming", [150000], 'expense', 'food'],
  ['non ikki ming', [2000], 'expense', 'food'],
  ['kafe bir yarim yuz ming', [150000], 'expense', 'cafe'],
  ['ijara ikki yarim million', [2500000], 'expense', 'housing'],
  // Uzbek Cyrillic
  ['такси 25 минг', [25000], 'expense', 'transport'],
  ['бозордан гўшт 120 минг', [120000], 'expense', 'food'],
  ['нон 5 минг', [5000], 'expense', 'food'],
  ['дорихона 40 минг', [40000], 'expense', 'health'],
  ['ойлик тушди 7 млн', [7000000], 'income', 'salary'],
  ['йигирма беш минг такси', [25000], 'expense', 'transport'],
  // Russian
  ['такси 15к', [15000], 'expense', 'transport'],
  ['такси 20 тысяч', [20000], 'expense', 'transport'],
  ['продукты 230 тыс', [230000], 'expense', 'food'],
  ['хлеб и молоко 17к', [17000], 'expense', 'food'],
  ['обед 50 тысяч', [50000], 'expense', 'cafe'],
  ['кофе 25к', [25000], 'expense', 'cafe'],
  ['бензин 200 тыс', [200000], 'expense', 'transport'],
  ['коммуналка 450 тысяч', [450000], 'expense', 'utilities'],
  ['интернет 99к', [99000], 'expense', 'telecom'],
  ['аптека 35 тысяч', [35000], 'expense', 'health'],
  ['куртка 50$', [50], 'expense', 'clothing'],
  ['кроссовки 120 долларов', [120], 'expense', 'clothing'],
  ['аренда квартиры 400$', [400], 'expense', 'housing'],
  ['двадцать пять тысяч такси', [25000], 'expense', 'transport'],
  ['полтора миллиона кредит', [1500000], 'expense', 'loans'],
  ['зарплата 8 млн', [8000000], 'income', 'salary'],
  ['получил премию 2 млн', [2000000], 'income', 'other_income'],
  // Mixed scripts / slang / typos
  ['тaкси 20к', [20000], 'expense', 'transport'],
  ['taksi 20к', [20000], 'expense', 'transport'],
  ['такси 20k', [20000], 'expense', 'transport'],
  ['taxi 30ming', [30000], 'expense', 'transport'],
  ['taksi 25 mng', [25000], 'expense', 'transport'],
  ['taksi 1,5 mln', [1500000], 'expense', 'transport'],
  ['benzin 150.000', [150000], 'expense', 'transport'],
  ['benzin 150,000', [150000], 'expense', 'transport'],
  ['Korzinka 1 250 000', [1250000], 'expense', 'food'],
  ['50$ kurtka', [50], 'expense', 'clothing'],
  ['$15 spotify', [15], 'expense', 'entertainment'],
  // Income
  ['oylik tushdi 6 mln', [6000000], 'income', 'salary'],
  ['maosh 5.5 mln', [5500000], 'income', 'salary'],
  ['+500 ming', [500000], 'income', 'other_income'],
  ['avans keldi 2 mln', [2000000], 'income', 'salary'],
  ['bonus 1 mln', [1000000], 'income', 'other_income'],
  // Multiple
  ['non 5 ming, sut 12 ming', [5000, 12000], 'expense', 'food'],
  ['taksi 20 ming, kofe 25 ming', [20000, 25000], 'expense', null],
  ['хлеб 5к; молоко 12к', [5000, 12000], 'expense', 'food'],
  // Debts
  ['Murod akaga 300 ming qarz berdim', [300000], 'debt_given', null],
  ['Sardordan 1 mln qarz oldim', [1000000], 'debt_taken', null],
  ['Murod aka 100 ming qaytardi', [100000], 'debt_return', null],
  ['akamga 200 ming qarzni qaytardim', [200000], 'debt_return', null],
  ['дал в долг Саше 100к', [100000], 'debt_given', null],
  ['взял в долг 500 тысяч', [500000], 'debt_taken', null],
  // Dates
  ['kecha taksi 20 ming', [20000], 'expense', 'transport'],
  ['вчера кофе 25к', [25000], 'expense', 'cafe'],
  // Unknown category — must not be claimed
  ['qwerty 40 ming', [40000], 'expense', null],
  ['xyz 10k', [10000], 'expense', null],
  // No amount
  ['bugun bozorga bordim', [], 'expense', null],
  ['salom', [], 'expense', null],
  ['2 ta non', [], 'expense', null],
];

describe('corpus', () => {
  const results = CORPUS.map(([text, amounts, type, category]) => {
    const r = parseRuleBased(text, { today: '2026-10-01' });
    const got = r.items.map((i) => i.tx.amount);
    const amountOk = JSON.stringify(got) === JSON.stringify(amounts);
    const typeOk = r.items.every((i) => i.tx.type === type);
    const cats = r.items.map((i) => i.tx.category_id);
    const categoryOk =
      amounts.length === 0 ? true : category === null
        ? text.includes(',') ? true : cats.every((c) => c === null)
        : cats.every((c) => c === category);
    return { text, amountOk, typeOk, categoryOk, got, cats, types: r.items.map((i) => i.tx.type) };
  });

  const pct = (k: 'amountOk' | 'typeOk' | 'categoryOk') => results.filter((r) => r[k]).length / results.length;

  it(`has ${CORPUS.length} cases`, () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(100);
  });

  it('amount accuracy ≥ 98% (TZ §60)', () => {
    const bad = results.filter((r) => !r.amountOk).map((r) => `${r.text} → ${JSON.stringify(r.got)}`);
    expect(pct('amountOk'), bad.join('\n')).toBeGreaterThanOrEqual(0.98);
  });

  it('type accuracy ≥ 98%', () => {
    const bad = results.filter((r) => !r.typeOk).map((r) => `${r.text} → ${r.types.join(',')}`);
    expect(pct('typeOk'), bad.join('\n')).toBeGreaterThanOrEqual(0.98);
  });

  it('category accuracy ≥ 90% even without AI (TZ §60)', () => {
    const bad = results.filter((r) => !r.categoryOk).map((r) => `${r.text} → ${r.cats.join(',')}`);
    expect(pct('categoryOk'), bad.join('\n')).toBeGreaterThanOrEqual(0.9);
  });
});
