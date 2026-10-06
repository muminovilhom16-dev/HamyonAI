// Renders the how-to video (guide.html) to an MP4 (see ../lib/render.mjs).
// Run capture.mjs first: the video uses the real bot texts and web screenshots.
//
//   node marketing/guide/render.mjs [--fps 30] [--out file.mp4] [--no-sfx]
//   node marketing/guide/render.mjs --stills 2,7,15,24,30,38,42,46,49,54,59   # PNG previews
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderVideo } from '../lib/render.mjs';
import { writeSfx } from './sfx.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
if (!existsSync(here('./assets/bot.js'))) {
  console.error('assets/ is missing — run: node marketing/guide/capture.mjs');
  process.exit(1);
}

await renderVideo({ page: here('./guide.html'), out: here('./hamyon-guide-9x16.mp4'), writeSfx });
