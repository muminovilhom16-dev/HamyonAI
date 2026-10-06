// Renders an animation page to an MP4: every frame is drawn by the page's
// window.render(t) in headless Chromium and piped as JPEG to ffmpeg (no frame
// files on disk). The page sets window.DURATION (seconds).
//
// Soundtrack: `writeSfx(path)` (synthesized effects) plus, when `voice` exists,
// a voice-over; under the voice the effects are lowered and ducked so every
// word stays clear. CLI flags handled here: --fps, --out, --stills (with --dir),
// --no-sfx, --no-voice.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

export const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const flag = (name) => process.argv.includes(`--${name}`);

/**
 * @param {{ page: string, query?: Record<string,string>, out: string, writeSfx?: (path: string) => string, voice?: string }} o
 */
export async function renderVideo(o) {
  const dir = dirname(o.page);
  const fps = Number(arg('fps', '30'));
  const out = resolve(arg('out', o.out));
  const stills = arg('stills', null);

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const url = pathToFileURL(o.page);
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v);
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready);
  // Let every <img> decode before the first frame.
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  const duration = await page.evaluate(() => window.DURATION);

  if (stills) {
    const sdir = resolve(arg('dir', `${dir}/stills`));
    mkdirSync(sdir, { recursive: true });
    for (const t of stills.split(',').map(Number)) {
      await page.evaluate((x) => window.render(x), t);
      await page.screenshot({ path: `${sdir}/t${String(t).replace('.', '_')}.png` });
    }
    console.log(`stills → ${sdir}`);
  } else {
    const audio = mixAudio(dir, o);
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
}

/** Returns the soundtrack WAV path, or null for a silent video. */
function mixAudio(dir, o) {
  const sfx = flag('no-sfx') || !o.writeSfx ? null : o.writeSfx(`${dir}/sfx.wav`);
  const voice = flag('no-voice') || !o.voice || !existsSync(o.voice) ? null : o.voice;
  if (!sfx || !voice) return sfx ?? voice;
  const mixed = `${dir}/audio.wav`;
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
