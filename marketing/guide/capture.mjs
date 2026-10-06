// Captures REAL content for the how-to video: boots the built server against
// the local database with a fake Telegram API, talks to the bot through the
// real webhook, and screenshots the real web panel.
//
//   pnpm --filter @hamyon/api build && pnpm --filter @hamyon/web build
//   node marketing/guide/capture.mjs        # → marketing/guide/assets/
//
// assets/bot.json      every bot reply (HTML text + buttons) for the scripted chat
// assets/*.png         phone screenshots of the web panel (390×844 @3x, light)
// assets/targets.json  tap targets on those screenshots, as fractions of the page
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const OUT = fileURLToPath(new URL('./assets/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const DB = process.env.DATABASE_URL ?? 'postgres://hamyon:hamyon@localhost:5432/hamyon';

// ── Fake Telegram API: records what the bot sends ──────────────────────────
const sent = [];
const tg = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    res.setHeader('content-type', 'application/json');
    if (method === 'getMe') return res.end(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, first_name: 'Hamyon AI', username: 'hamyonchai_bot' } }));
    sent.push({ method, body: JSON.parse(body || '{}') });
    res.end(JSON.stringify({ ok: true, result: { message_id: sent.length, date: 0, chat: { id: 1, type: 'private' } } }));
  });
});
await new Promise((r) => tg.listen(0, r));

const PORT = 3996;
const base = `http://127.0.0.1:${PORT}`;
const SECRET = 's'.repeat(40);
execFileSync('node', ['apps/api/dist/migrate.js'], { env: { ...process.env, DATABASE_URL: DB }, stdio: 'inherit' });
const server = spawn('node', ['apps/api/dist/server.js'], {
  env: {
    ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'warn', PORT: String(PORT), DATABASE_URL: DB,
    TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_API_ROOT: `http://127.0.0.1:${tg.address().port}`, AUTH_TOKEN_SECRET: 'a'.repeat(40),
    PUBLIC_BASE_URL: base, WEB_BASE_URL: `${base}/app`, WEB_STATIC_DIR: 'apps/web/dist', COOKIE_SECURE: 'false',
    AI_PROVIDER: 'none', STT_PROVIDER: 'none', RUN_WORKERS: 'false', KEEP_ALIVE: 'false',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (i > 50) throw new Error('server did not start');
  await new Promise((r) => setTimeout(r, 200));
}

// ── A fresh user talking to the bot ────────────────────────────────────────
const user = 700000000 + Math.floor(Math.random() * 1e8);
const from = { id: user, is_bot: false, first_name: 'Aziz', username: `aziz${user}`, language_code: 'uz' };
let uid = Date.now();
const post = (update) =>
  fetch(`${base}/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
    body: JSON.stringify({ update_id: uid++, ...update }),
  });
const say = (text) =>
  post({ message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, chat: { id: user, type: 'private' }, from,
    ...(text.startsWith('/') && { entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] }) } });
const tap = (data) =>
  post({ callback_query: { id: `cq${uid}`, from, chat_instance: 'ci', data,
    message: { message_id: 99, date: 0, chat: { id: user, type: 'private' }, text: 'card' } } });

const markup = (b) => (typeof b.reply_markup === 'string' ? JSON.parse(b.reply_markup) : b.reply_markup) ?? {};
const LINK = /https?:\/\/\S+token=\S+/g;
/** Bot output since index `i`, link tokens removed. */
const repliesSince = (i) =>
  sent.slice(i)
    .filter((s) => (s.method === 'sendMessage' || s.method === 'editMessageText') && s.body.chat_id === user)
    .map(({ method, body }) => {
      const m = markup(body);
      return {
        method,
        text: (body.text ?? '').replace(LINK, 'hamyon-ai.onrender.com/auth/web?token=…'),
        inline: (m.inline_keyboard ?? []).map((r) => r.map((b) => ({ text: b.text, data: b.callback_data ?? null, url: b.url ? 'link' : null }))),
        keyboard: (m.keyboard ?? []).map((r) => r.map((b) => (typeof b === 'string' ? b : b.text))),
      };
    });

const steps = [];
const step = async (name, input, act) => {
  const i = sent.length;
  await act();
  steps.push({ name, input, replies: repliesSince(i) });
  return steps.at(-1);
};

await step('start', '/start', () => say('/start'));
await step('lang', "O'zbekcha", () => tap('ob:l:uz_latn'));
await step('currency', "So'm (UZS)", () => tap('ob:c:UZS'));
// Real onboarding order: the first expense, then the reminder-time question.
const taxi = await step('taxi', 'taksi 25 ming', () => say('taksi 25 ming'));
const catBtn = taxi.replies[0].inline.flat().find((b) => b.data?.startsWith('cat:'));
await step('reminder', '21:00', () => tap('ob:r:2100'));
// The card's category button → category picker.
await step('category', catBtn.text, () => tap(catBtn.data));
await step('multi', 'non 5 ming, sut 12 ming', () => say('non 5 ming, sut 12 ming'));
await step('income', 'oylik 6 mln', () => say('oylik tushdi 6 mln'));
await step('debt', 'Alisherga 200 ming qarz berdim', () => say('Alisherga 200 ming qarz berdim'));
await step('today', '📊 Bugun', () => say('📊 Bugun'));
await step('web', '🌐 Web panel', () => say('🌐 Web panel'));
writeFileSync(`${OUT}/bot.json`, JSON.stringify(steps, null, 2));
// Same data as a classic script: file:// pages cannot fetch JSON.
writeFileSync(`${OUT}/bot.js`, `globalThis.BOT = ${JSON.stringify(steps)};\n`);

// ── More history so the dashboard has something to show ────────────────────
for (const m of [
  '/byudjet oziq-ovqat 1,5 mln', 'Korzinka 230 ming', 'kecha taksi 18 ming', "o'tgan kuni kafe 120 ming",
  'svet 120 ming', 'internet 99 ming', 'kecha dorixona 45 ming', 'kino 60 ming', 'kurtka 450 ming',
  'kecha Makro 310 ming', "o'tgan kuni benzin 200 ming", 'Sardordan 1 mln qarz oldim',
]) await say(m);

// ── Web panel screenshots ─────────────────────────────────────────────────
const freshLink = async () => {
  const i = sent.length;
  await say('/web');
  const text = sent.slice(i).map((s) => s.body.text).find((t) => t?.includes('/auth/web?token='));
  return /(http\S+token=\S+)/.exec(text)[1];
};
const VW = 390, VH = 844;
// ru-RU gives dd.mm.yyyy date inputs, as most users in Uzbekistan see them.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--lang=ru-RU'], env: { ...process.env, LANG: 'ru_RU.UTF-8', LANGUAGE: 'ru' } });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 3, colorScheme: 'light', locale: 'ru-RU' });
const page = await ctx.newPage();
const targets = {};
let hideNav = null;
/** The bottom nav as the user sees it with tab `n` active. */
const navShot = (n) => page.locator('nav.nav').screenshot({ path: `${OUT}/nav-${n}.png` });
/** Records an element's centre as fractions of the full page (x of width, y in CSS px). */
const target = async (name, selector) => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no target ${name}: ${selector}`);
  const scrollY = await page.evaluate(() => window.scrollY);
  targets[name] = { x: (box.x + box.width / 2) / VW, y: box.y + scrollY + box.height / 2, w: box.width / VW, h: box.height };
};
/**
 * Page screenshots leave out the fixed bottom nav (the video draws it on top,
 * from nav-N.png); sheet screenshots keep everything as the user sees it.
 */
const shot = async (name, fullPage = false, withNav = false) => {
  await page.waitForTimeout(400); // animations settle
  if (!withNav) await page.addStyleTag({ content: 'nav.nav{visibility:hidden}' }).then((h) => (hideNav = h));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  if (hideNav) await hideNav.evaluate((el) => el.remove()), (hideNav = null);
  targets[`${name}:size`] = await page.evaluate((fp) => ({ h: fp ? document.documentElement.scrollHeight : window.innerHeight }), fullPage);
};

await page.goto(await freshLink());
await page.waitForSelector('.hero-value');
await page.waitForSelector('.legend li');
for (let i = 1; i <= 4; i++) await target(`nav${i}`, `nav button:nth-of-type(${i})`);
await target('navBar', 'nav.nav');
await navShot(1);
await shot('dashboard', true);

await page.click('nav button:nth-of-type(2)');
await page.waitForSelector('.tx');
await target('search', 'input[type=search]');
await target('fab', '.fab');
await navShot(2);
await shot('records');
await page.click('.fab');
await page.waitForSelector('.sheet');
await page.locator('.sheet #amt').fill('85 000');
const note = page.locator('.sheet textarea, .sheet input#note, .sheet input[id*=note]').first();
if (await note.count()) await note.fill('Kafe');
const cat = page.locator('.sheet select').first();
const cafe = await cat.locator('option').evaluateAll((os) => os.find((o) => /Kafe/.test(o.textContent))?.value);
if (cafe) await cat.selectOption(cafe);
await shot('record-add', false, true);
await page.keyboard.press('Escape');
await page.locator('.sheet .icon-btn').first().click().catch(() => {});

await page.click('nav button:nth-of-type(3)');
await page.waitForSelector('.debt');
await target('fabDebt', '.fab');
await navShot(3);
await shot('debts');
await page.click('.fab');
await page.waitForSelector('.sheet #duser');
await page.locator('.sheet #dname').fill('Alisher');
await page.locator('.sheet #damt').fill('200 000');
const due = page.locator('.sheet input[type=date]').last(); // «Qaytarish muddati»
if (await due.count()) await due.fill('2026-10-20');
await page.locator('.sheet #duser').fill('@alisher_uz');
await target('duser', '.sheet #duser');
await shot('debt-add', false, true);
await page.locator('.sheet .icon-btn').first().click();

await page.click('nav button:nth-of-type(4)');
await page.waitForSelector('.group');
await navShot(4);
await shot('settings', true);

writeFileSync(`${OUT}/targets.json`, JSON.stringify(targets, null, 2));
writeFileSync(`${OUT}/targets.js`, `globalThis.TARGETS = ${JSON.stringify(targets)};\n`);
await browser.close();
server.kill('SIGTERM');
tg.close();
console.log(`captured ${steps.length} chat steps and ${Object.keys(targets).length} targets → ${OUT}`);
