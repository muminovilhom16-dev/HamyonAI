import { EnvValidationError, loadEnv } from '@hamyon/config';
import { createDb } from '@hamyon/db';
import { buildApp } from './app';
import { scheduleMaintenance } from './maintenance';

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
  const stopMaintenance = scheduleMaintenance(dbHandle.db, app.log);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      stopMaintenance();
      await app.close();
      await dbHandle.close();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err instanceof Error ? err.message : 'unknown');
  process.exit(1);
});
