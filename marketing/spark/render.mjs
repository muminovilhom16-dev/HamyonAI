// Renders spark.html to an MP4 (see ../lib/render.mjs).
//
//   node marketing/spark/render.mjs [--bot hamyonchai_bot] [--fps 30] [--out file.mp4] [--no-sfx]
//   node marketing/spark/render.mjs --stills 2.6,4.9,6.4,9.2,11.8,14.5   # PNG previews
import { fileURLToPath } from 'node:url';
import { arg, renderVideo } from '../lib/render.mjs';
import { writeSfx } from './sfx.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

await renderVideo({
  page: here('./spark.html'),
  query: { bot: arg('bot', process.env.BOT_USERNAME ?? 'hamyonchai_bot') },
  out: here('./hamyon-spark-9x16.mp4'),
  writeSfx,
});
