import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { schema, type Database } from '@hamyon/db';
import { addDays } from './time';

/** Source of official daily rates (Central Bank of Uzbekistan by default). */
export interface ExchangeRateProvider {
  readonly name: string;
  /** UZS per 1 unit as an exact decimal string, e.g. "12650.25". */
  fetchRate(currency: 'USD', date: string): Promise<string>;
}

export class RateUnavailableError extends Error {
  constructor() {
    super('exchange rate unavailable');
    this.name = 'RateUnavailableError';
  }
}

/** https://cbu.uz JSON archive API. */
export class CbuRateProvider implements ExchangeRateProvider {
  readonly name = 'cbu';
  constructor(private readonly timeoutMs = 5000) {}

  async fetchRate(currency: 'USD', date: string): Promise<string> {
    const res = await fetch(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/${currency}/${date}/`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new RateUnavailableError();
    const body = (await res.json()) as Array<{ Ccy?: string; Rate?: string }>;
    const rate = body.find((r) => r.Ccy === currency)?.Rate;
    if (!rate || !/^\d+(\.\d{1,2})?$/.test(rate)) throw new RateUnavailableError();
    return rate;
  }
}

/** Normalizes "12650.3" → "12650.30" (scale 2). */
function normalizeRate(rate: string): string {
  const [i, f = ''] = rate.split('.');
  return `${i}.${f.padEnd(2, '0').slice(0, 2)}`;
}

/**
 * Rate for `date`: stored rate, else fetched and stored, else the most recent
 * stored rate from the previous 7 days (weekends/holidays/outage).
 */
export async function getRate(
  db: Database,
  provider: ExchangeRateProvider | null,
  currency: 'USD',
  date: string,
): Promise<string> {
  const { exchangeRates } = schema;
  const [stored] = await db
    .select({ rate: exchangeRates.rateUzs })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), eq(exchangeRates.rateDate, date)));
  if (stored) return stored.rate;

  if (provider) {
    try {
      const rate = normalizeRate(await provider.fetchRate(currency, date));
      await db
        .insert(exchangeRates)
        .values({ currency, rateDate: date, rateUzs: rate, source: provider.name })
        .onConflictDoNothing();
      return rate;
    } catch {
      // fall through to the latest stored rate
    }
  }

  const [recent] = await db
    .select({ rate: exchangeRates.rateUzs })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.currency, currency), lte(exchangeRates.rateDate, date), gte(exchangeRates.rateDate, addDays(date, -7))))
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);
  if (recent) return recent.rate;
  throw new RateUnavailableError();
}

/** amount × rate, rounded half-up to whole so'm, in exact integer arithmetic. */
export function convertToUzs(amount: number, rate: string): number {
  const [i, f = ''] = rate.split('.');
  const rateHundredths = BigInt(i!) * 100n + BigInt(f.padEnd(2, '0').slice(0, 2));
  const result = (BigInt(amount) * rateHundredths + 50n) / 100n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('amount too large');
  return Number(result);
}
