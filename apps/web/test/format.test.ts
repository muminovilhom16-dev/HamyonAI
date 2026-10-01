import { describe, expect, it } from 'vitest';
import { toSlices } from '../src/components/Donut';
import { compact, day, dayTime, money, parseAmountInput, percent } from '../src/format';

describe('format', () => {
  it('money (TZ §30)', () => {
    expect(money(1_250_000, 'UZS', 'uz_latn')).toBe("1 250 000 so'm");
    expect(money(1_250_000, 'UZS', 'ru')).toBe('1 250 000 сум');
    expect(money(50, 'USD', 'uz_latn')).toBe('$50');
    expect(money(-5000, 'UZS', 'uz_latn')).toBe("−5 000 so'm");
  });

  it('compact chart labels', () => {
    expect(compact(1_250_000, 'uz_latn')).toBe('1,3 mln');
    expect(compact(1_200_000, 'uz_latn')).toBe('1,2 mln');
    expect(compact(850_000, 'ru')).toBe('850 тыс');
    expect(compact(0, 'uz_latn')).toBe('0');
  });

  it('dates never look like "M09 01" (TZ §29)', () => {
    expect(day('2026-09-01', 'uz_latn')).toBe('1-sentabr');
    expect(day('2026-09-01', 'uz_cyrl')).toBe('1-сентябр');
    expect(day('2026-09-01', 'ru')).toBe('1 сентября');
    expect(day('2025-09-01', 'uz_latn', '2026')).toBe('1-sentabr 2025');
    expect(dayTime('2026-09-01', '10:58', 'uz_latn')).toBe('1-sentabr, 10:58');
  });

  it('percent', () => {
    expect(percent(345)).toBe('34,5%');
    expect(percent(1000)).toBe('100,0%');
  });

  it('amount input is integer-only', () => {
    expect(parseAmountInput('45 000')).toBe(45_000);
    expect(parseAmountInput('45.5')).toBeNull();
    expect(parseAmountInput('0')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
  });
});

describe('donut slices', () => {
  const row = (i: number, tenths: number) => ({ categoryId: `c${i}`, name: `C${i}`, icon: null, totalUzs: tenths * 100, percentTenths: tenths });
  it('folds beyond 6 into "Others" and keeps 100%', () => {
    const rows = [300, 200, 150, 100, 100, 50, 50, 30, 20].map((p, i) => row(i, p));
    const s = toSlices(rows, 'uz_latn');
    expect(s).toHaveLength(6);
    expect(s.at(-1)).toMatchObject({ key: 'others', name: 'Boshqalar', percentTenths: 150, color: 'var(--neutral-fill)' });
    expect(s.reduce((a, x) => a + x.percentTenths, 0)).toBe(1000);
  });
  it('no fold when ≤ 6', () => {
    expect(toSlices([row(0, 600), row(1, 400)], 'uz_latn').map((s) => s.color)).toEqual(['var(--series-1)', 'var(--series-2)']);
  });
});
