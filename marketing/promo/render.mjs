// Renders promo.html to an MP4: every frame is drawn by window.render(t) in
// headless Chromium and piped as JPEG to ffmpeg (no frame files on disk).
//
//   node marketing/promo/render.mjs [--bot hamyonchai_bot] [--fps 30] [--out file.mp4]
//   node marketing/promo/render.mjs --stills 1,4,8.6,10,14,17.8,20.8,24   # PNG previews
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

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
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
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
