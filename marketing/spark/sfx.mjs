// Sound-effect cue list for spark.html, timed to its GSAP timeline. The sounds
// and the mixer live in ../lib/sound.mjs.
//
//   node marketing/spark/sfx.mjs [out.wav]      # standalone
//   import { writeSfx } from './sfx.mjs'         # used by render.mjs
import { fileURLToPath } from 'node:url';
import { bell, coin, createMix, impact, pop, riser, shimmer, whoosh } from '../lib/sound.mjs';

export function writeSfx(path) {
  const mix = createMix(15);
  const { place, expoTicks } = mix;
  // S1 — words + spark pill + cursor click (0–3.3)
  place(0.1, whoosh(0.7, 300, 2000, 0.5), 0.3, 0, 0.3);
  place(0.8, whoosh(0.4, 1200, 4500, 0.4), 0.2, 0.2);
  place(1.0, shimmer(0.7, 12), 0.4, 0.3, 0.4);
  place(2.3, pop(380, 0.1), 0.55, 0.3);
  place(2.38, bell(1568, 0.7), 0.18, 0.3, 0.35);
  place(2.95, whoosh(0.5, 2400, 400, 0.5), 0.3, 0, 0.3);
  // S2 — rings + word swap (3.4–5.6)
  place(3.35, riser(1.0, 220, 440), 0.08, 0, 0.4);
  place(4.45, whoosh(0.3, 3000, 800, 0.4), 0.25);
  place(4.6, pop(620), 0.45);
  place(4.7, bell(1318.5, 1.0), 0.16, -0.2, 0.4);
  place(5.0, riser(0.6, 400, 1600), 0.12);
  // S3 — flash into light + GROWTH (5.5–7.4)
  place(5.55, impact(1.1), 0.75, 0, 0.45);
  place(5.65, shimmer(0.9), 0.5, 0, 0.5);
  place(6.75, pop(260, 0.12), 0.6);
  place(7.1, whoosh(0.5, 2000, 300, 0.45), 0.3, 0, 0.3);
  // S5 — ribbon + card (7.5–10.3)
  place(7.55, whoosh(1.4, 250, 2600, 0.45), 0.35, -0.3, 0.3);
  expoTicks(7.9, 1.4, 14).forEach((tt, i) => place(tt, pop(900 + i * 45, 0.05), 0.15, -0.2));
  place(8.9, coin(2350), 0.2, -0.2, 0.3);
  [8.2, 8.32, 8.44, 8.56].forEach((tt, i) => place(tt, pop(480 + i * 80, 0.08), 0.25, -0.4 + i * 0.25));
  place(9.95, whoosh(0.5, 2200, 300, 0.45), 0.3, 0, 0.3);
  // S4 — stacked lines (10.3–12.8)
  [10.35, 10.51, 10.67, 10.83, 10.99, 11.15].forEach((tt, i) => place(tt + 0.05, pop(420 + i * 60, 0.07), 0.25, -0.3 + i * 0.12));
  place(11.25, bell(1046.5, 1.2), 0.18, 0.2, 0.45);
  place(12.55, whoosh(0.5, 2000, 400, 0.45), 0.3, 0, 0.3);
  // S6 — CTA (12.8–15)
  place(12.9, impact(1.2), 0.55, 0, 0.45);
  place(13.0, shimmer(1.0, 20), 0.55, 0, 0.5);
  [784, 987.8, 1174.7, 1568].forEach((f, i) => place(13.4 + i * 0.1, bell(f, 1.6), 0.13, -0.3 + i * 0.2, 0.5));
  return mix.write(path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = writeSfx(process.argv[2] ?? fileURLToPath(new URL('./sfx.wav', import.meta.url)));
  console.log(`sfx → ${out}`);
}
