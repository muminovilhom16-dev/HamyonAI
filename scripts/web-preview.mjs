// Visual check of the web panel: boots the built server with the built web
// panel, seeds data through the real webhook (fake Telegram API), logs in via
// a /web link and takes screenshots at phone and desktop sizes, light + dark.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? 'web-preview';
mkdirSync(OUT, { recursive: true });
const sent = [];
const tg = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    res.setHeader('content-type', 'application/json');
    if (method === 'getMe') return res.end(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, first_name: 'Hamyon AI', username: 'HamyonPreviewBot' } }));
    sent.push({ method, body: JSON.parse(body || '{}') });
    res.end(JSON.stringify({ ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } }));
  });
});
await new Promise((r) => tg.listen(0, r));

const PORT = 3997;
const base = `http://127.0.0.1:${PORT}`;
const SECRET = 's'.repeat(40);
const server = spawn('node', ['apps/api/dist/server.js'], {
  env: {
    ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'warn', PORT: String(PORT),
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://hamyon:hamyon@localhost:5432/hamyon',
    TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_API_ROOT: `http://127.0.0.1:${tg.address().port}`, AUTH_TOKEN_SECRET: 'a'.repeat(40),
    PUBLIC_BASE_URL: base, WEB_BASE_URL: `${base}/`, WEB_STATIC_DIR: 'apps/web/dist', COOKIE_SECURE: 'false',
    AI_PROVIDER: 'none', STT_PROVIDER: 'none',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (i > 50) throw new Error('server did not start');
  await new Promise((r) => setTimeout(r, 200));
}

const user = 800000000 + Math.floor(Math.random() * 1e6);
let uid = Date.now();
const say = (text) =>
  fetch(`${base}/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ update_id: uid++, message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, chat: { id: user, type: 'private' }, from: { id: user, is_bot: false, first_name: 'Ilhom', language_code: 'uz' },
      ...(text.startsWith('/') && { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] }) } }),
  });
for (const m of [
  '/start', 'Korzinka 230 ming', 'taksi 25 ming', 'kecha taksi 18 ming', "o'tgan kuni kafe 120 ming", 'svet 120 ming',
  'internet 99 ming', 'kecha dorixona 45 ming', 'kino 60 ming', 'kurtka 450 ming', 'non 5 ming, sut 12 ming',
  'Murod akaga 300 ming qarz berdim', 'Murod aka 100 ming qaytardi', 'Sardordan 1 mln qarz oldim', '/web',
]) await say(m);
const link = sent.filter((s) => s.method === 'sendMessage').map((s) => s.body.text).reverse().find((t) => t?.includes('/auth/web?token='));
const url = /(http\S+token=\S+)/.exec(link)[1]; // consumed below to show the expired page

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', timeout: 30_000 });
const errors = [];
const shots = async (name, opts, link) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(link);
  await page.waitForSelector('.kpi-value');
  await page.screenshot({ path: `${OUT}/${name}-dashboard.png`, fullPage: true });
  await page.click('nav button:nth-child(2)');
  await page.waitForSelector('.tx');
  await page.screenshot({ path: `${OUT}/${name}-records.png`, fullPage: true });
  await page.click('.tx');
  await page.waitForSelector('.sheet');
  await page.screenshot({ path: `${OUT}/${name}-edit.png` });
  await page.click('.sheet .btn:not(.primary):not(.danger)');
  await page.click('nav button:nth-child(3)');
  await page.waitForSelector('.debt');
  await page.screenshot({ path: `${OUT}/${name}-debts.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) errors.push(`${name}: horizontal overflow`);
  await ctx.close();
};
// The one-time link is consumed by the first context; reissue per context.
const fresh = async () => {
  await say('/web');
  const t = sent.filter((s) => s.method === 'sendMessage').map((s) => s.body.text).reverse().find((x) => x?.includes('/auth/web?token='));
  return /(http\S+token=\S+)/.exec(t)[1];
};
for (const [name, opts] of [
  ['phone-light', { viewport: { width: 360, height: 780 }, colorScheme: 'light', deviceScaleFactor: 2 }],
  ['phone-dark', { viewport: { width: 360, height: 780 }, colorScheme: 'dark', deviceScaleFactor: 2 }],
  ['desktop-light', { viewport: { width: 1280, height: 900 }, colorScheme: 'light' }],
]) {
  await shots(name, opts, await fresh()).catch((e) => errors.push(`${name}: ${e.message}`));
}

// Expired link page
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
const p = await ctx.newPage();
await p.goto(url); // first link: reused → expired page
await p.goto(url);
await p.screenshot({ path: `${OUT}/expired-link.png` });
await browser.close();
server.kill('SIGTERM');
tg.close();
console.log(errors.length ? `ISSUES:\n${errors.join('\n')}` : 'PREVIEW OK (no console errors, no horizontal overflow)');
