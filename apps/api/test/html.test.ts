import { describe, expect, it } from 'vitest';
import { Api } from 'grammy';
import { bar, esc, htmlToPlain, useHtmlParseMode } from '../src/bot/html';
import { tf } from '../src/i18n';

describe('bot HTML helpers', () => {
  it('escapes user text so it cannot inject markup', () => {
    expect(esc('<b>Ali & Vali</b>')).toBe('&lt;b&gt;Ali &amp; Vali&lt;/b&gt;');
    expect(htmlToPlain(`<b>${esc('a < b & c')}</b>`)).toBe('a < b & c');
  });

  it('tf() escapes its params', () => {
    expect(tf('uz_latn', 'noDebtFound', { name: '<i>Murod</i>' })).toBe('&lt;i&gt;Murod&lt;/i&gt; bilan ochiq qarz topilmadi.');
  });

  it('bar() shows a share in 5 cells, at least one when non-zero', () => {
    expect(bar(0)).toBe('▱▱▱▱▱');
    expect(bar(0.01)).toBe('▰▱▱▱▱');
    expect(bar(0.5)).toBe('▰▰▰▱▱');
    expect(bar(1)).toBe('▰▰▰▰▰');
    expect(bar(Number.NaN)).toBe('▱▱▱▱▱');
  });
});

describe('useHtmlParseMode', () => {
  it('sends HTML, and falls back to plain text if Telegram rejects the markup', async () => {
    const api = new Api('123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const seen: Array<Record<string, unknown>> = [];
    api.config.use(async (_prev, _method, payload) => {
      const p = payload as Record<string, unknown>;
      seen.push(p);
      if (p.parse_mode === 'HTML' && String(p.text).includes('<broken')) {
        return { ok: false, error_code: 400, description: "Bad Request: can't parse entities" } as never;
      }
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } } as never;
    });
    useHtmlParseMode(api);

    await api.sendMessage(1, '<b>ok</b>');
    expect(seen.at(-1)).toMatchObject({ text: '<b>ok</b>', parse_mode: 'HTML' });

    await api.sendMessage(1, '<b>x</b> <broken');
    expect(seen.at(-1)).toMatchObject({ text: 'x <broken' });
    expect(seen.at(-1)!.parse_mode).toBeUndefined();

    await api.sendMessage(1, 'plain', { parse_mode: 'MarkdownV2' });
    expect(seen.at(-1)).toMatchObject({ parse_mode: 'MarkdownV2' });
  });
});
