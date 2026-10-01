import { runMigrations } from './migrate';

// CLI entry: `pnpm db:migrate` (source) or `node dist/migrate.js` (bundled).
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log('Migrations applied'))
  .catch((err: unknown) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
