import type { Api, RawApi } from 'grammy';

/**
 * Bot messages use Telegram HTML. Every value that comes from the user
 * (notes, names, transcripts, custom categories) must pass through esc().
 */
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const b = (html: string): string => `<b>${html}</b>`;
export const i = (html: string): string => `<i>${html}</i>`;

/** What the user sees: tags removed, entities decoded. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** "▰▰▰▱▱" — share of a total as a 5-cell bar (rounded, at least one cell when > 0). */
export function bar(fraction: number, cells = 5): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const filled = f === 0 ? 0 : Math.max(1, Math.round(f * cells));
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled);
}

const HTML_METHODS = new Set(['sendMessage', 'editMessageText']);

/**
 * Defaults text messages to HTML. If Telegram still rejects the markup (a
 * value that escaped esc()), the message is re-sent as plain text instead
 * of being lost.
 */
export function useHtmlParseMode(api: Api<RawApi>): void {
  api.config.use(async (prev, method, payload, signal) => {
    if (!HTML_METHODS.has(method)) return prev(method, payload, signal);
    const p = payload as { text?: string; parse_mode?: string };
    if (p.parse_mode !== undefined || typeof p.text !== 'string') return prev(method, payload, signal);
    const res = await prev(method, { ...payload, parse_mode: 'HTML' } as typeof payload, signal);
    if (!res.ok && res.error_code === 400 && /can't parse entities/i.test(res.description ?? '')) {
      return prev(method, { ...payload, text: htmlToPlain(p.text) } as typeof payload, signal);
    }
    return res;
  });
}
