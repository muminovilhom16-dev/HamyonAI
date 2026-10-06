// Sound effects for the how-to video, generated from the same timeline as the
// picture (timeline.js), so every click, tap and message lands on its frame.
//
//   node marketing/guide/sfx.mjs [out.wav]
import { fileURLToPath } from 'node:url';
import { bell, coin, createMix, impact, key, pop, shimmer, whoosh } from '../lib/sound.mjs';
import './timeline.js';

const TL = globalThis.TL;

export function writeSfx(path) {
  const mix = createMix(TL.duration);
  const { place, typeClicks } = mix;
  const ding = (t, hi = 1) => {
    place(t, bell(1568 * hi, 0.6), 0.2, -0.1, 0.25);
    place(t + 0.05, bell(2093 * hi, 0.6), 0.14, -0.1, 0.25);
  };

  for (const e of TL.events) {
    switch (e.type) {
      case 'intro':
        place(e.t, whoosh(0.7, 300, 2400, 0.7), 0.35, 0, 0.3);
        place(e.t + 0.12, impact(1.1), 0.75, 0, 0.4);
        place(e.t + 0.2, shimmer(0.8), 0.5, -0.2, 0.5);
        for (let i = 0; i < TL.steps.length; i++) place(1.0 + i * 0.2 + 0.08, pop(460 + i * 80), 0.32, -0.4 + i * 0.2);
        place(2.8, whoosh(0.6, 2500, 400, 0.6), 0.35, 0, 0.3);
        break;
      case 'phone':
        if (e.mode === 'start') place(e.t, whoosh(0.8, 200, 1800, 0.5), 0.45, 0, 0.2);
        if (e.mode === 'web') place(e.t, whoosh(0.6, 400, 2600, 0.5), 0.4, 0.2, 0.25);
        break;
      case 'caption':
        if (e.step) {
          place(e.t, bell(1046.5, 1.0), 0.12, -0.2, 0.4);
          place(e.t + 0.09, bell(1568, 1.0), 0.1, 0.2, 0.4);
        } else place(e.t, pop(820, 0.08), 0.12, 0.3);
        break;
      case 'type':
        typeClicks(e.text, e.t, e.end);
        break;
      case 'send':
        place(e.t - 0.03, whoosh(0.22, 1800, 6000, 0.3), 0.25, 0.3);
        break;
      case 'bot':
        ding(e.t);
        break;
      case 'edit':
        place(e.t, pop(700, 0.1), 0.25, -0.1);
        break;
      case 'kb':
        place(e.t, whoosh(0.45, e.show ? 400 : 1600, e.show ? 1600 : 400, 0.4), 0.18, 0);
        break;
      case 'tap':
        place(e.t, pop(320, 0.1), 0.45);
        place(e.t + 0.01, key(1.2), 0.35);
        break;
      case 'hl':
        place(e.t, bell(2349, 0.4), 0.07, 0.3, 0.3);
        break;
      case 'scroll':
      case 'wscroll':
        place(e.t, whoosh(Math.max(0.3, e.end - e.t), 900, 2000, 0.5), 0.12, 0.1);
        break;
      case 'page':
        place(e.t, whoosh(0.3, 1200, 3000, 0.35), 0.18, 0.2);
        break;
      case 'sheet':
        place(e.t, whoosh(0.35, e.page ? 500 : 1800, e.page ? 1800 : 500, 0.4), 0.2, 0);
        break;
      case 'tips':
        place(e.t - 0.4, whoosh(0.6, 1600, 250, 0.4), 0.4, 0, 0.2);
        [0.4, 0.95, 1.5].forEach((d, i) => {
          place(e.t + d, whoosh(0.3, 700, 2400, 0.35), 0.15, [-0.5, 0.5, -0.5][i]);
          place(e.t + d + 0.12, pop(500 + i * 90), 0.38, [-0.5, 0.5, -0.5][i]);
        });
        break;
      case 'outro':
        place(e.t, impact(1.3), 0.8, 0, 0.45);
        place(e.t + 0.1, shimmer(1.0), 0.5, 0, 0.5);
        [784, 987.8, 1174.7, 1568].forEach((f, i) => place(e.t + 0.6 + i * 0.1, bell(f, 1.8), 0.13, -0.3 + i * 0.2, 0.5));
        place(e.t + 1.2, shimmer(0.9, 22), 0.6, 0.1, 0.5);
        place(e.t + 0.9, coin(2350), 0.15, 0.2, 0.3);
        break;
    }
  }
  return mix.write(path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = writeSfx(process.argv[2] ?? fileURLToPath(new URL('./sfx.wav', import.meta.url)));
  console.log(`sfx → ${out}`);
}
