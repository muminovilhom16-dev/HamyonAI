import { describe, expect, it } from 'vitest';
import { maskCardNumbers } from '../src/pii';

describe('maskCardNumbers', () => {
  it.each([
    ['Karta 8600123456781234 dan 25000 UZS', 'Karta ****1234 dan 25000 UZS'],
    ['HUMO 9860 1234 5678 4321 списание', 'HUMO ****4321 списание'],
    ['card 4111-1111-1111-1111', 'card ****1111'],
  ])('masks %s', (input, expected) => {
    expect(maskCardNumbers(input)).toBe(expected);
  });

  it.each([
    'taksi 25 ming',
    '1 500 000 so\'m',
    'tel +998 90 123 45 67',
    'Karta: 8600 **** **** 1234',
    'Summa: 15 000 000 000',
  ])('leaves %s untouched', (input) => {
    expect(maskCardNumbers(input)).toBe(input);
  });
});
