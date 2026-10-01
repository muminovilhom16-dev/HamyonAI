import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Source layout: packages/db/migrations. Bundled layout: dist/migrations. */
export const migrationsFolder =
  process.env.MIGRATIONS_DIR ??
  [path.resolve(here, '../migrations'), path.resolve(here, 'migrations')].find((p) =>
    existsSync(path.join(p, 'meta', '_journal.json')),
  ) ??
  path.resolve(here, '../migrations');

export async function runMigrations(url: string): Promise<void> {
  const handle = createDb(url, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}
