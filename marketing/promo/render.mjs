// Renders promo.html to an MP4: every frame is drawn by window.render(t) in
// headless Chromium and piped as JPEG to ffmpeg (no frame files on disk).
//
//   node marketing/promo/render.mjs [--bot hamyonchai_bot] [--fps 30] [--out file.mp4] [--no-sfx] [--no-voice]
//   node marketing/promo/render.mjs --stills 1,4,8.6,10,14,17.8,20.8,24   # PNG previews
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { writeSfx } from './sfx.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const fps = Number(arg('fps', '30'));
const bot = arg('bot', process.env.BOT_USERNAME ?? 'hamyonchai_bot');
const out = resolve(arg('out', `${here}/hamyon-promo-9x16.mp4`));
const stills = arg('stills', null);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(`file://${here}/promo.html?bot=${encodeURIComponent(bot)}`);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);

if (stills) {
  const dir = resolve(arg('dir', `${here}/stills`));
  mkdirSync(dir, { recursive: true });
  for (const t of stills.split(',').map(Number)) {
    await page.evaluate((x) => window.render(x), t);
    await page.screenshot({ path: `${dir}/t${String(t).replace('.', '_')}.png` });
  }
  console.log(`stills → ${dir}`);
} else {
  const audio = mixAudio();
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    ...(audio ? ['-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-r', String(fps), out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(duration * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((x) => window.render(x), f / fps);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ffmpeg.stdin.write(jpg)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((res, rej) => ffmpeg.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)))));
  console.log(`video → ${out}`);
}
await browser.close();

/**
 * Soundtrack: synthesized effects (sfx.mjs) plus, when narration.wav exists
 * (narration.py), the voice-over. Under the voice the effects are lowered and
 * ducked further so every word stays clear. Returns the WAV path, or null.
 */
function mixAudio() {
  const sfx = process.argv.includes('--no-sfx') ? null : writeSfx(`${here}/sfx.wav`);
  const voice = process.argv.includes('--no-voice') || !existsSync(`${here}/narration.wav`) ? null : `${here}/narration.wav`;
  if (!sfx || !voice) return sfx ?? voice;
  const mixed = `${here}/audio.wav`;
  const graph = [
    '[1:a]asplit[key][vox]',
    '[0:a]volume=0.35[fx]',
    '[fx][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[duck]',
    '[duck][vox]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]',
  ].join(';');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sfx, '-i', voice, '-filter_complex', graph, '-map', '[a]', '-c:a', 'pcm_s16le', mixed], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('audio mix failed');
  console.log('audio: effects + narration');
  return mixed;
}
