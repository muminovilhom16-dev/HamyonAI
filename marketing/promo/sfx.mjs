// Sound-effect cue list for promo.html, timed to its timeline. The sounds and
// the mixer live in ../lib/sound.mjs.
//
//   node marketing/promo/sfx.mjs [out.wav]      # standalone
//   import { writeSfx } from './sfx.mjs'         # used by render.mjs
import { fileURLToPath } from 'node:url';
import { bell, coin, createMix, impact, key, pop, riser, shimmer, strike, warn, whoosh } from '../lib/sound.mjs';

export function writeSfx(path) {
  const mix = createMix(25);
  const { place, expoTicks, typeClicks } = mix;
  // 1. Hook (0–2.6)
  place(0.0, whoosh(0.7, 300, 2400, 0.7), 0.35, 0, 0.3);
  [0.15, 0.43, 0.71].forEach((tt, i) => place(tt + 0.08, pop(420 + i * 90), 0.5, [-0.3, 0, 0.3][i]));
  [0.1, 0.22, 0.34, 0.46, 0.58].forEach((tt, i) => place(tt + 0.25, coin(1900 + i * 230), 0.12, [-0.7, 0.7, -0.6, 0.6, 0][i], 0.3));
  place(1.1, whoosh(0.45, 1200, 5000, 0.4), 0.22, 0);
  place(2.05, whoosh(0.6, 2500, 400, 0.6), 0.4, 0, 0.3);

  // 2. Pain (2.5–5.1)
  place(2.5, whoosh(0.9, 500, 3500, 0.25), 0.4, 0, 0.3);
  [2.6, 2.9, 3.2].forEach((tt) => place(tt, whoosh(0.3, 900, 2600, 0.4), 0.2, -0.4));
  [3.3, 3.55, 3.8].forEach((tt, i) => place(tt, strike(), 0.35, [-0.2, 0, 0.2][i], 0.1));
  place(4.15, pop(700), 0.5);
  place(4.18, bell(1318.5, 0.8), 0.18, 0, 0.35);

  // 3. Brand (5–7.1)
  place(4.7, whoosh(0.45, 300, 4000, 0.95), 0.3, 0, 0.2);
  place(5.1, impact(), 0.9, 0, 0.4);
  place(5.2, shimmer(0.8), 0.6, -0.2, 0.5);
  place(5.5, whoosh(0.5, 1500, 600, 0.3), 0.25, 0.2);
  place(5.6, bell(987.8, 1.4), 0.14, -0.2, 0.5);
  place(5.75, bell(1318.5, 1.4), 0.12, 0.2, 0.5);

  // 4–5. Chat (7–15.6)
  place(6.9, whoosh(0.8, 200, 1800, 0.5), 0.45, 0, 0.2);
  place(7.35, pop(560), 0.3);
  typeClicks('taksi 25 ming', 7.7, 8.4);
  place(8.52, whoosh(0.22, 1800, 6000, 0.3), 0.25, 0.3);
  place(9.02, bell(1568, 0.6), 0.22, -0.1, 0.25);
  place(9.07, bell(2093, 0.6), 0.16, -0.1, 0.25);
  typeClicks('non 5 ming, sut 12 ming', 9.3, 9.85);
  place(9.92, whoosh(0.22, 1800, 6000, 0.3), 0.25, 0.3);
  place(10.42, pop(640), 0.38, -0.2);
  place(10.77, pop(760), 0.38, -0.1);
  place(11.55, whoosh(0.5, 400, 1600, 0.4), 0.25, 0);
  place(12.35, pop(300, 0.1), 0.5);
  place(12.36, key(1.2), 0.4);
  place(12.75, whoosh(0.22, 1800, 6000, 0.3), 0.22, 0.3);
  place(13.07, bell(1568, 0.6), 0.22, -0.1, 0.25);
  place(13.12, bell(2093, 0.6), 0.16, -0.1, 0.25);
  expoTicks(13.3, 1.0, 14).forEach((tt, i) => place(tt, pop(900 + i * 45, 0.05), 0.16, -0.2));
  place(14.25, coin(2350), 0.2, -0.2, 0.3);
  place(15.05, whoosh(0.6, 1600, 250, 0.4), 0.45, 0, 0.2);

  // 6. Features (15.5–19.6)
  place(15.6, pop(600), 0.25);
  [15.75, 15.95, 16.15, 16.35].forEach((tt, i) => {
    place(tt, whoosh(0.3, 700, 2400, 0.35), 0.15, [-0.5, 0.5, -0.5, 0.5][i]);
    place(tt + 0.12, pop(480 + i * 70), 0.4, [-0.5, 0.5, -0.5, 0.5][i]);
  });
  place(16.4, riser(1.1, 300, 620), 0.1, -0.4);
  place(17.5, warn(), 0.16, -0.4, 0.2);
  for (let k = 0; k < 6; k++) place(16.65 + k * 0.22, bell(1760 + (k % 2) * 220, 0.35), 0.08 * (1 - k / 7), 0.45, 0.3);
  place(16.8, riser(1.3, 400, 800), 0.08, 0.4);
  place(17.6, pop(340, 0.1), 0.5, -0.4);
  [1046.5, 1318.5, 1568].forEach((f, i) => place(17.7 + i * 0.09, bell(f, 1.0), 0.16, -0.3, 0.35));
  place(19.1, whoosh(0.55, 1800, 300, 0.4), 0.4, 0, 0.2);

  // 7. Web panel (19.5–22.1)
  place(19.5, whoosh(0.8, 250, 2200, 0.45), 0.45, 0, 0.25);
  expoTicks(20.0, 1.2, 16).forEach((tt, i) => place(tt, pop(800 + i * 40, 0.05), 0.14, 0.2));
  for (let i = 0; i < 7; i++) place(20.3 + i * 0.07, pop(500 + i * 60, 0.08), 0.18, -0.6 + i * 0.2);
  place(21.0, coin(2500), 0.18, 0.2, 0.3);
  place(21.95, whoosh(0.5, 2000, 300, 0.5), 0.35, 0, 0.3);

  // 8. CTA (22–25)
  place(22.1, impact(1.3), 0.8, 0, 0.45);
  place(22.2, shimmer(1.0), 0.5, 0, 0.5);
  [22.4, 22.65, 22.95, 23.2].forEach((tt, i) => place(tt + 0.08, pop(440 + i * 110), 0.35, [-0.2, 0.2, 0, 0][i]));
  [784, 987.8, 1174.7, 1568].forEach((f, i) => place(23.0 + i * 0.1, bell(f, 1.8), 0.13, -0.3 + i * 0.2, 0.5));
  place(23.6, shimmer(0.9, 22), 0.7, 0.1, 0.5);
  return mix.write(path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = writeSfx(process.argv[2] ?? fileURLToPath(new URL('./sfx.wav', import.meta.url)));
  console.log(`sfx → ${out}`);
}
