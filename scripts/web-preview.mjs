// Visual check of the web panel: boots the built server with the built web
// panel, seeds data through the real webhook (fake Telegram API), logs in via
// a /web link and takes screenshots at phone and desktop sizes, light + dark.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
// Bring the local database up to date first (same as the container's start command).
{
  const { execFileSync } = await import('node:child_process');
  execFileSync('node', ['apps/api/dist/migrate.js'], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://hamyon:hamyon@localhost:5432/hamyon' },
    stdio: 'inherit',
  });
}
const server = spawn('node', ['apps/api/dist/server.js'], {
  env: {
    ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'warn', PORT: String(PORT),
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://hamyon:hamyon@localhost:5432/hamyon',
    TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_API_ROOT: `http://127.0.0.1:${tg.address().port}`, AUTH_TOKEN_SECRET: 'a'.repeat(40),
    PUBLIC_BASE_URL: base, WEB_BASE_URL: `${base}/app`, WEB_STATIC_DIR: 'apps/web/dist', COOKIE_SECURE: 'false',
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
  '/start', '/byudjet oziq-ovqat 300 ming', '/byudjet umumiy 1,5 mln', 'Korzinka 230 ming', 'taksi 25 ming', 'kecha taksi 18 ming', "o'tgan kuni kafe 120 ming", 'svet 120 ming',
  'internet 99 ming', 'kecha dorixona 45 ming', 'kino 60 ming', 'kurtka 450 ming', 'non 5 ming, sut 12 ming',
  'Murod akaga 300 ming qarz berdim', 'Murod aka 100 ming qaytardi', 'Sardordan 1 mln qarz oldim',
  'oylik tushdi 6 mln', '/bugun', '/oy', '/oxirgi', '/qarzlar', '/sozlamalar', '/yordam', '/web',
]) await say(m);

// Bot messages rendered like a Telegram chat (HTML parse mode + inline keyboards).
const chat = sent
  .filter((s) => s.method === 'sendMessage' && s.body.chat_id === user)
  .map(({ body }) => {
    const text = body.parse_mode === 'HTML' ? body.text.replace(/\n/g, '<br>') : body.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\n/g, '<br>');
    const kb = (typeof body.reply_markup === 'string' ? JSON.parse(body.reply_markup) : body.reply_markup)?.inline_keyboard ?? [];
    const rows = kb.map((r) => `<div class="kr">${r.map((b) => `<span>${b.text.replace(/[&<>]/g, '')}</span>`).join('')}</div>`).join('');
    return `<div class="msg"><div class="bubble">${text}</div>${rows ? `<div class="kb">${rows}</div>` : ''}</div>`;
  });
const botHtml = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#8fb7a5 linear-gradient(160deg,#a8c9b3,#7fae9c);font:15px/1.4 -apple-system,'Segoe UI',Roboto,sans-serif;padding:12px}
.msg{max-width:340px;margin:0 0 10px}.bubble{overflow-wrap:anywhere;background:#fff;border-radius:14px 14px 14px 4px;padding:8px 11px;box-shadow:0 1px 1px rgba(0,0,0,.12)}
.kb{margin-top:3px}.kr{display:flex;gap:3px;margin-top:3px}.kr span{flex:1;text-align:center;background:rgba(40,70,60,.35);color:#fff;border-radius:8px;padding:7px 4px;font-size:13px;font-weight:500}
s{opacity:.55}</style>${chat.join('')}`;
mkdirSync(OUT, { recursive: true });
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/bot-chat.html`, botHtml);
const link = sent.filter((s) => s.method === 'sendMessage').map((s) => s.body.text).reverse().find((t) => t?.includes('/auth/web?token='));
const url = /(http\S+token=\S+)/.exec(link)[1]; // consumed below to show the expired page

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', timeout: 30_000 });
const errors = [];
const shots = async (name, opts, link) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && !/telegram\.org|ERR_TUNNEL|ERR_NAME/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(link);
  await page.waitForSelector('.hero-value');
  await page.waitForSelector('.legend li');
  await page.screenshot({ path: `${OUT}/${name}-dashboard.png`, fullPage: true });
  await page.click('nav button:nth-of-type(2)');
  await page.waitForSelector('.tx');
  await page.screenshot({ path: `${OUT}/${name}-records.png`, fullPage: true });
  await page.click('.tx');
  await page.waitForSelector('.sheet');
  await page.screenshot({ path: `${OUT}/${name}-edit.png` });
  await page.click('.sheet .btn:not(.primary):not(.danger)');
  await page.click('nav button:nth-of-type(3)');
  await page.waitForSelector('.debt');
  await page.screenshot({ path: `${OUT}/${name}-debts.png`, fullPage: true });
  await page.click('.fab');
  await page.waitForSelector('.sheet #duser');
  await page.screenshot({ path: `${OUT}/${name}-debt-add.png` });
  await page.click('.sheet .icon-btn');
  await page.click('nav button:nth-of-type(4)');
  await page.waitForSelector('.group');
  await page.screenshot({ path: `${OUT}/${name}-settings.png`, fullPage: true });
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

// Landing + auth pages (signed out)
for (const [name, opts] of [
  ['landing-phone', { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 }],
  ['landing-desktop', { viewport: { width: 1280, height: 860 } }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}/`);
  await page.waitForSelector('.lp-hero h1');
  await page.screenshot({ path: `${OUT}/${name}-hero.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  await page.click('.lp-header .lp-btn.outline');
  await page.waitForSelector('.lp-auth-card');
  await page.screenshot({ path: `${OUT}/${name}-signup.png` });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`${name}: horizontal overflow`);
  await page.goto(`${base}/`);
  await page.waitForSelector('.lp-hero h1');
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('.lp-header *, .lp-hero-text *, .lp-btn, .lp-card')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); })
      .map((el) => el.className || el.tagName));
  if (clipped.length) errors.push(`${name}: clipped ${[...new Set(clipped)].slice(0, 5).join(', ')}`);
  await ctx.close();
}

// Bot chat preview
{
  const ctx = await browser.newContext({ viewport: { width: 380, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`file://${resolve(OUT, "bot-chat.html")}`);
  await page.screenshot({ path: `${OUT}/bot-chat.png`, fullPage: true });
  await ctx.close();
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
