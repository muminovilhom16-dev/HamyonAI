import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKeepAlive } from '../src/keep-alive';
import { msUntilNextSlot } from '../src/notifications';

describe('keep-alive', () => {
  afterEach(() => vi.useRealTimers());

  it('pings /health on the interval, logs failures, and stops', async () => {
    vi.useFakeTimers();
    const urls: string[] = [];
    let fail = false;
    const fetch = (async (url: string) => {
      urls.push(url);
      if (fail) throw new Error('down');
      return { ok: true, status: 200 };
    }) as unknown as typeof globalThis.fetch;
    const warn = vi.fn();
    const stop = startKeepAlive({ baseUrl: 'https://hamyon.onrender.com/', log: { warn } as never, intervalMs: 1000, fetch });

    await vi.advanceTimersByTimeAsync(1000);
    expect(urls).toEqual(['https://hamyon.onrender.com/health']);
    expect(warn).not.toHaveBeenCalled();

    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(warn).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(urls).toHaveLength(2);
  });
});

describe('msUntilNextSlot', () => {
  const at = (iso: string) => new Date(iso);
  it('waits for the next quarter hour plus the offset', () => {
    expect(msUntilNextSlot(at('2026-10-04T10:00:00Z'))).toBe(5_000);
    expect(msUntilNextSlot(at('2026-10-04T10:00:05Z'))).toBe(15 * 60_000);
    expect(msUntilNextSlot(at('2026-10-04T10:07:30Z'))).toBe(7.5 * 60_000 + 5_000);
    expect(msUntilNextSlot(at('2026-10-04T10:59:59Z'))).toBe(6_000);
    expect(msUntilNextSlot(at('2026-10-04T23:50:00Z'))).toBe(10 * 60_000 + 5_000);
  });
});
