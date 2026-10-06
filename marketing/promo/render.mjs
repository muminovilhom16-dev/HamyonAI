// Renders promo.html to an MP4 (see ../lib/render.mjs).
//
//   node marketing/promo/render.mjs [--bot hamyonchai_bot] [--fps 30] [--out file.mp4] [--no-sfx] [--no-voice]
//   node marketing/promo/render.mjs --stills 1,4,8.6,10,14,17.8,20.8,24   # PNG previews
import { fileURLToPath } from 'node:url';
import { arg, renderVideo } from '../lib/render.mjs';
import { writeSfx } from './sfx.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

await renderVideo({
  page: here('./promo.html'),
  query: { bot: arg('bot', process.env.BOT_USERNAME ?? 'hamyonchai_bot') },
  out: here('./hamyon-promo-9x16.mp4'),
  writeSfx,
  voice: here('./narration.wav'),
});
