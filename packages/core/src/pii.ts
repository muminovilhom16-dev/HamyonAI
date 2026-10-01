/**
 * Masks card numbers (13–19 digits, optionally grouped by spaces/dashes) to
 * `****1234`. Must run on any user text before it is persisted or sent to an
 * AI provider (TZ §20, §39). Already-masked forms like `8600 **** **** 1234`
 * contain no full number and are left as is.
 */
const CARD_RE = /(?<![\d*])(?:\d[ -]?){12,18}\d(?![\d*])/g;

export function maskCardNumbers(text: string): string {
  return text.replace(CARD_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return match;
    return `****${digits.slice(-4)}`;
  });
}
