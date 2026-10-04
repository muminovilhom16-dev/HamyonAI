import { EnvValidationError, loadEnv } from '@hamyon/config';
import { createDb } from '@hamyon/db';
import { buildApp } from './app';
import { startKeepAlive } from './keep-alive';
import { scheduleMaintenance } from './maintenance';
import { runProactiveTick, scheduleNotifications } from './notifications';
import { startWorkers } from './queue';
import { setupTelegram } from './telegram-setup';

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    // Key names only; values are never printed.
    console.error(err instanceof EnvValidationError ? err.message : 'Failed to load configuration');
    process.exit(1);
  }

  const dbHandle = createDb(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX });
  const app = await buildApp({ env, dbHandle });
  const stopMaintenance = scheduleMaintenance(dbHandle.db, app.log, env.ACCOUNT_DELETION_GRACE_DAYS);
  const notifyDeps = {
    db: dbHandle.db,
    api: app.bot.api,
    log: app.log,
    maxPerDay: env.MAX_PROACTIVE_MESSAGES_PER_DAY,
    weeklyReportTime: env.WEEKLY_REPORT_TIME,
    monthlyReportTime: env.MONTHLY_REPORT_TIME,
  };
  let stopReminders: () => void | Promise<void> = () => {};
  if (env.RUN_WORKERS && app.queues) {
    // Redis: workers + a single cluster-wide scheduler.
    const workers = await startWorkers({ queues: app.queues, bot: app.bot, log: app.log, tick: () => runProactiveTick(notifyDeps) });
    stopReminders = () => workers.close();
  } else if (env.RUN_WORKERS) {
    // No Redis: in-process scheduler (single instance only).
    stopReminders = scheduleNotifications(notifyDeps);
  }

  let stopKeepAlive = () => {};
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      stopKeepAlive();
      stopMaintenance();
      await stopReminders();
      await app.close();
      await dbHandle.close();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: env.HOST, port: env.PORT });

  if (env.KEEP_ALIVE && env.PUBLIC_BASE_URL?.startsWith('https://')) {
    stopKeepAlive = startKeepAlive({ baseUrl: env.PUBLIC_BASE_URL, log: app.log });
  }

  // PaaS without a shell (e.g. Render free): register the webhook ourselves.
  if (env.AUTO_SET_WEBHOOK) {
    setupTelegram(app.bot.api, env)
      .then((url) => app.log.info({ url }, 'telegram webhook registered'))
      .catch((err: unknown) => app.log.error({ err: err instanceof Error ? err.message : 'failed' }, 'telegram webhook registration failed'));
  }
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err instanceof Error ? err.message : 'unknown');
  process.exit(1);
});
