// Bundles workspace code (@hamyon/*) into dist; third-party deps stay external
// and are installed from package.json in the runtime image.
import { build } from 'esbuild';
import { cp, readFile, rm } from 'node:fs/promises';

const pkgs = ['apps/api', 'packages/ai', 'packages/config', 'packages/core', 'packages/db'];
const external = new Set();
for (const p of pkgs) {
  const json = JSON.parse(await readFile(new URL(`../../${p}/package.json`, import.meta.url), 'utf8'));
  for (const dep of Object.keys(json.dependencies ?? {})) if (!dep.startsWith('@hamyon/')) external.add(dep);
}

await rm(new URL('./dist', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/server.ts', 'set-webhook': 'src/scripts/set-webhook.ts', migrate: '../../packages/db/src/migrate-cli.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: 'dist',
  sourcemap: true,
  external: [...external],
  logLevel: 'warning',
});
await cp(new URL('../../packages/db/migrations', import.meta.url), new URL('./dist/migrations', import.meta.url), { recursive: true });
console.log('built apps/api/dist');
