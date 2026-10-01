import { describe, expect, it } from 'vitest';
import { extractAmounts } from '../src/parser/amount';
import { tokenize } from '../src/parser/normalize';

const amounts = (s: string) => extractAmounts(tokenize(s)).map((a) => [a.value, a.currency]);
const one = (s: string) => {
  const a = extractAmounts(tokenize(s));
  expect(a, s).toHaveLength(1);
  return a[0]!;
};

describe('amount normalization (TZ §8)', () => {
  it.each([
    ['20 ming', 20_000],
    ['20к', 20_000],
    ['20k', 20_000],
    ['20 000', 20_000],
    ['1.5 mln', 1_500_000],
    ['1,5 млн', 1_500_000],
    ['bir yarim million', 1_500_000],
    ['yigirma besh ming', 25_000],
    ['двадцать пять тысяч', 25_000],
    ['такси 15к', 15_000],
    ['тaкси 20к', 20_000],
    ['taksi 25 ming', 25_000],
    ["bozordan go'sht oldim yuz ellik ming", 150_000],
    ['oylik tushdi 6 mln', 6_000_000],
    ['+500 ming', 500_000],
    ['1 500 000', 1_500_000],
    ['1 mln 200 ming', 1_200_000],
    ['ikki yuz ming', 200_000],
    ['полтора миллиона', 1_500_000],
    ['25000', 25_000],
    ['20.000', 20_000],
    ['1.5m', 1_500_000],
    ['25ming', 25_000],
    ['3 mlrd', 3_000_000_000],
    ["150 000 so'm", 150_000],
    ['Тўрт юз минг', 400_000],
    ['йигирма беш минг', 25_000],
    ['ellik ming', 50_000],
    ['20 тыс', 20_000],
    ['20 тысяч', 20_000],
    ['20 mingga', 20_000],
  ])('%s → %d UZS', (input, expected) => {
    const a = one(input);
    expect(a.value).toBe(expected);
    expect(a.currency).toBe('UZS');
    expect(a.assumedThousands).toBe(false);
  });

  it.each([
    ['50$ kurtka', 50],
    ['$50', 50],
    ['50 dollar', 50],
    ['50 долларов', 50],
    ['100 usd', 100],
  ])('%s → %d USD', (input, expected) => {
    const a = one(input);
    expect(a).toMatchObject({ value: expected, currency: 'USD', explicitCurrency: true, assumedThousands: false });
  });

  it('bare small number is assumed thousands and flagged (taksi 20)', () => {
    expect(one('taksi 20')).toMatchObject({ value: 20_000, assumedThousands: true });
  });

  it('explicit so\'m keeps small literal amount', () => {
    expect(one("500 so'm")).toMatchObject({ value: 500, assumedThousands: false });
  });

  it('separates multiple amounts', () => {
    expect(amounts('non 5 ming, sut 12 ming')).toEqual([[5_000, 'UZS'], [12_000, 'UZS']]);
    expect(amounts('non 5 ming sut 12 ming')).toEqual([[5_000, 'UZS'], [12_000, 'UZS']]);
  });

  it.each([
    'bugun bozorga bordim',
    '2 ta non',
    '3 kg olma',
    'bir kilo',
    'tel +998901234567',
    'soat 10:30 da',
    '15-sentabr',
    'ming rahmat',
    'summa',
  ])('finds no amount in %s', (input) => {
    expect(amounts(input)).toEqual([]);
  });

  it('ignores quantities but keeps the price', () => {
    expect(amounts('2 ta non 10 ming')).toEqual([[10_000, 'UZS']]);
  });

  it('never produces fractional so\'m', () => {
    expect(amounts('1.55 ming')).toEqual([[1_550, 'UZS']]);
    expect(amounts('0.5')).toEqual([]);
  });
});
