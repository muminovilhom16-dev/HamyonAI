import pg from 'pg';
import { runMigrations } from './migrate';

/** Drops and re-creates the schema, then applies all migrations. Test-only. */
export async function resetTestDatabase(url: string): Promise<void> {
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error('resetTestDatabase refuses to run against a non-test database');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  } finally {
    await client.end();
  }
  await runMigrations(url);
}

export const testDatabaseUrl = (): string =>
  process.env.TEST_DATABASE_URL ?? 'postgres://hamyon:hamyon@localhost:5432/hamyon_test';
