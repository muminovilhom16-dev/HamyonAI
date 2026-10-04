import type { FastifyBaseLogger } from 'fastify';

/**
 * Free PaaS instances (Render) spin down after 15 minutes without inbound
 * traffic; the next Telegram update then waits for a cold boot. Pinging our own
 * public /health keeps the instance up. /health does not touch the database,
 * so the (separately billed) database can still sleep.
 */
export function startKeepAlive(opts: {
  baseUrl: string;
  log: Pick<FastifyBaseLogger, 'warn'>;
  intervalMs?: number;
  fetch?: typeof fetch;
}): () => void {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/health`;
  const doFetch = opts.fetch ?? fetch;
  const ping = async () => {
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) opts.log.warn({ status: res.status }, 'keep-alive ping failed');
    } catch (err) {
      opts.log.warn({ err: err instanceof Error ? err.message : 'error' }, 'keep-alive ping failed');
    }
  };
  const timer = setInterval(() => void ping(), opts.intervalMs ?? 10 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
