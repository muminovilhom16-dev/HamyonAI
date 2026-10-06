// Synthesized sound effects and a tiny stereo mixer for the marketing videos.
// No samples and no licences: every sound is generated from sines and noise,
// with a seeded random source so a render always sounds the same.
import { writeFileSync } from 'node:fs';

export const SR = 48000;
const TAU = Math.PI * 2;

// Deterministic noise so every render sounds the same.
const SEED = 0x9e3779b9;
let seed = SEED;
export const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;
export const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
const expEnv = (i, tau) => Math.exp(-i / (tau * SR));

/** Chamberlin state-variable filter; cutoff(i) may change per sample. */
export function svf(input, cutoff, q = 0.7, mode = 'band') {
  const out = new Float32Array(input.length);
  let low = 0, band = 0;
  for (let i = 0; i < input.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(cutoff(i), SR / 6) / SR);
    low += f * band;
    const high = input[i] - low - q * band;
    band += f * high;
    out[i] = mode === 'low' ? low : mode === 'high' ? high : band;
  }
  return out;
}

// ── Sound generators (mono) ─────────────────────────────────────────────────

/** Air whoosh: band-passed noise sweeping f0 → f1 with a swelling envelope. */
export function whoosh(dur, f0, f1, peak = 0.6) {
  const n = buf(dur);
  for (let i = 0; i < n.length; i++) n[i] = noise();
  const out = svf(n, (i) => f0 * Math.pow(f1 / f0, i / n.length), 0.9);
  for (let i = 0; i < out.length; i++) {
    const x = i / out.length;
    const env = x < peak ? Math.sin((Math.PI / 2) * (x / peak)) ** 2 : Math.cos((Math.PI / 2) * ((x - peak) / (1 - peak))) ** 2;
    out[i] *= env * 2.2;
  }
  return out;
}

/** Bubbly UI pop: sine with a fast downward pitch glide. */
export function pop(freq = 520, dur = 0.14) {
  const out = buf(dur);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const f = freq * (1 + 0.9 * expEnv(i, 0.012));
    ph += (TAU * f) / SR;
    out[i] = Math.sin(ph) * expEnv(i, 0.035) * Math.min(1, i / 48);
  }
  return out;
}

/** Keyboard tap. */
export function key(bright = 1) {
  const out = buf(0.04);
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const w = noise();
    out[i] = (w - prev) * 0.5 * expEnv(i, 0.004) * bright + Math.sin((TAU * 1800 * i) / SR) * 0.25 * expEnv(i, 0.003);
    prev = w;
  }
  return out;
}

/** Struck bell from inharmonic partials: coins, notifications, chimes. */
export function bell(freq, dur = 0.9, partials = [[1, 1, 1], [2.0, 0.35, 0.6], [3.01, 0.18, 0.4], [4.2, 0.08, 0.25]]) {
  const out = buf(dur);
  for (const [ratio, amp, decay] of partials) {
    const f = freq * ratio;
    if (f > SR / 2.2) continue;
    for (let i = 0; i < out.length; i++) out[i] += Math.sin((TAU * f * i) / SR) * amp * expEnv(i, (decay * dur) / 3) * Math.min(1, i / 24);
  }
  return out;
}
export const coin = (freq = 2100) => bell(freq, 0.5, [[1, 1, 0.8], [2.76, 0.5, 0.5], [5.4, 0.25, 0.3], [8.93, 0.12, 0.2]]);

/** Low cinematic hit for logo reveals. */
export function impact(dur = 1.1) {
  const out = buf(dur);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const f = 38 + 90 * expEnv(i, 0.06);
    ph += (TAU * f) / SR;
    out[i] = Math.sin(ph) * expEnv(i, 0.28) * Math.min(1, i / 96);
  }
  const n = buf(0.4);
  for (let i = 0; i < n.length; i++) n[i] = noise() * expEnv(i, 0.05);
  const lp = svf(n, () => 900, 1, 'low');
  for (let i = 0; i < lp.length; i++) out[i] += lp[i] * 0.6;
  return out;
}

/** Marker strike-through: scratchy band-passed noise. */
export function strike(dur = 0.32) {
  const n = buf(dur);
  for (let i = 0; i < n.length; i++) n[i] = noise() * (0.6 + 0.4 * Math.sin((TAU * 38 * i) / SR + rnd() * 0.4));
  const out = svf(n, (i) => 1800 + 2200 * (i / n.length), 0.5);
  for (let i = 0; i < out.length; i++) {
    const x = i / out.length;
    out[i] *= Math.sin(Math.PI * Math.min(1, x * 1.3)) * 1.5;
  }
  return out;
}

/** Soft rising tone (progress bars filling). */
export function riser(dur, f0, f1) {
  const out = buf(dur);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const x = i / out.length;
    ph += (TAU * f0 * Math.pow(f1 / f0, x)) / SR;
    out[i] = (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * Math.sin(Math.PI * x) ** 0.6 * (0.8 + 0.2 * Math.sin(TAU * 9 * x * dur));
  }
  return out;
}

/** Gentle two-pulse warning. */
export function warn() {
  const out = buf(0.36);
  for (let i = 0; i < out.length; i++) {
    const tt = i / SR, local = tt < 0.16 ? tt : tt - 0.19;
    if (local < 0 || local > 0.14) continue;
    const env = Math.sin((Math.PI * local) / 0.14);
    out[i] = (Math.sin(TAU * 440 * tt) + 0.4 * Math.sin(TAU * 660 * tt)) * env;
  }
  return out;
}

/** Sparkle: scattered high bell grains. */
export function shimmer(dur = 0.9, count = 18) {
  const out = buf(dur + 0.4);
  for (let k = 0; k < count; k++) {
    const g = bell(3000 + rnd() * 4000, 0.25, [[1, 1, 1]]);
    const at = Math.round(((k / count) * dur + rnd() * 0.05) * SR);
    const amp = 0.25 * Math.sin((Math.PI * (k + 0.5)) / count);
    for (let i = 0; i < g.length && at + i < out.length; i++) out[at + i] += g[i] * amp;
  }
  return out;
}


/**
 * Stereo mix bus of `duration` seconds. Resets the random seed, so a cue
 * list always produces the same file.
 */
export function createMix(duration) {
  seed = SEED;
  const L = buf(duration), R = buf(duration);
  const rvbSend = buf(duration);

  /** Places a sound at `t` seconds; pan -1..1; rvb = reverb send. */
  function place(t, sound, gain = 1, pan = 0, rvb = 0.15) {
    const at = Math.round(t * SR);
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < sound.length && at + i < L.length; i++) {
      if (at + i < 0) continue;
      L[at + i] += sound[i] * gl;
      R[at + i] += sound[i] * gr;
      rvbSend[at + i] += sound[i] * gain * rvb;
    }
  }

  /** Times at which easeOutExpo(prog(t, start, dur)) crosses k/n (count-up ticks). */
  function expoTicks(start, dur, n) {
    const out = [];
    for (let k = 1; k < n; k++) {
      const p = -Math.log2(1 - k / n) / 10;
      if (p <= 1) out.push(start + p * dur);
    }
    return out;
  }

  /** Typing clicks matching promo.html's typed(): char k shows at a + (b-a)(k-0.5)/len. */
  function typeClicks(text, a, b) {
    [...text].forEach((ch, k) => {
      const tt = a + ((b - a) * (k + 0.5)) / text.length;
      place(tt, key(ch === ' ' ? 0.5 : 0.9 + rnd() * 0.2), 0.45, 0.1, 0.05);
    });
  }

  /** Small Schroeder reverb on the send bus. */
  function reverb() {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, b: new Float32Array(d), i: 0, fb: 0.78 }));
    const aps = [225, 556].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
    for (let n = 0; n < rvbSend.length; n++) {
      let s = 0;
      for (const c of combs) {
        const y = c.b[c.i];
        c.b[c.i] = rvbSend[n] + y * c.fb;
        c.i = (c.i + 1) % c.d;
        s += y;
      }
      s *= 0.25;
      for (const a of aps) {
        const y = a.b[a.i];
        a.b[a.i] = s + y * 0.5;
        a.i = (a.i + 1) % a.d;
        s = y - s * 0.5;
      }
      L[n] += s * 0.9;
      R[(n + 240) % R.length] += s * 0.9; // decorrelate the channels
    }
  }

  function toWav() {
    let peak = 1e-9;
    for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const gain = 1.6 / peak; // drive into a soft limiter, final peak ≈ -1 dBFS
    const fadeOut = Math.round(0.6 * SR);
    const data = Buffer.alloc(L.length * 4);
    for (let i = 0; i < L.length; i++) {
      const fade = Math.min(1, (L.length - i) / fadeOut);
      for (const [ch, v] of [[0, L[i]], [1, R[i]]]) {
        const s = 0.89 * Math.tanh(v * gain) * fade;
        data.writeInt16LE(Math.round(s * 32767), i * 4 + ch * 2);
      }
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
    h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
  }


  return {
    place,
    expoTicks,
    typeClicks,
    write(path) {
      reverb();
      writeFileSync(path, toWav());
      return path;
    },
  };
}
