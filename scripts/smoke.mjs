// End-to-end smoke test: boots the real server process against a fake
// Telegram Bot API, sends a webhook update, and checks the reply was sent.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createHash } from 'node:crypto';

// SMOKE_MODE=paas: Render-like env (RENDER_EXTERNAL_URL, generated secret, auto webhook).
const PAAS = process.env.SMOKE_MODE === 'paas';

const sent = [];
const tg = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    res.setHeader('content-type', 'application/json');
    if (method === 'getMe') {
      return res.end(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, first_name: 'Hamyon AI', username: 'HamyonSmokeBot' } }));
    }
    // File uploads (sendVideo) arrive as multipart; only JSON bodies are parsed.
    const json = (req.headers['content-type'] ?? '').includes('json');
    sent.push({ method, body: json ? JSON.parse(body || '{}') : { multipart: true, chat_id: Number(/name="chat_id"\r\n\r\n(\d+)/.exec(body)?.[1]) } });
    res.end(JSON.stringify({ ok: true, result: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } } }));
  });
});
await new Promise((r) => tg.listen(0, r));
const tgPort = tg.address().port;

const PORT = 3999;
const AUTH = 'Zm9vYmFy+/=' + 'a'.repeat(40);
const SECRET = PAAS ? createHash('sha256').update(`${AUTH}:telegram-webhook`).digest('hex') : 's'.repeat(40);
const DB_URL = process.env.DATABASE_URL ?? 'postgres://hamyon:hamyon@localhost:5432/hamyon';
// Same order as the container: migrations, then the server.
{
  const { execFileSync } = await import('node:child_process');
  execFileSync('node', ['apps/api/dist/migrate.js'], { env: { ...process.env, DATABASE_URL: DB_URL }, stdio: 'ignore' });
}
const server = spawn('node', ['apps/api/dist/server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    LOG_LEVEL: 'info',
    DATABASE_URL: DB_URL,
    TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    TELEGRAM_API_ROOT: `http://127.0.0.1:${tgPort}`,
    ...(PAAS
      ? { AUTH_TOKEN_SECRET: AUTH, RENDER_EXTERNAL_URL: 'https://hamyon-ai.onrender.com', AUTO_SET_WEBHOOK: 'true', TRUST_PROXY: 'true' }
      : { TELEGRAM_WEBHOOK_SECRET: SECRET, AUTH_TOKEN_SECRET: 'a'.repeat(40), PUBLIC_BASE_URL: 'https://api.example.uz', WEB_BASE_URL: 'https://app.example.uz' }),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));

const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}\n--- server logs ---\n${logs}`);
  server.kill();
  tg.close();
  process.exit(1);
};

const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${base}/health`)).ok) break;
  } catch {}
  if (i > 50) fail('server did not start');
  await new Promise((r) => setTimeout(r, 200));
}

const ready = await fetch(`${base}/ready`);
if (ready.status !== 200) fail(`/ready returned ${ready.status}`);

const update = {
  update_id: Date.now(),
  message: {
    message_id: 1, date: Math.floor(Date.now() / 1000), text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    chat: { id: 900000001, type: 'private' }, from: { id: 900000001, is_bot: false, first_name: 'Smoke' },
  },
};
const res = await fetch(`${base}/telegram/webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
  body: JSON.stringify(update),
});
if (res.status !== 200) fail(`webhook returned ${res.status}`);
if (!sent.some((s) => s.method === 'sendMessage' && s.body.chat_id === 900000001)) fail(`no sendMessage to Telegram; got ${JSON.stringify(sent.map((s) => s.method))}`);
if (!sent.some((s) => s.method === 'sendVideo' && s.body.chat_id === 900000001)) fail('how-to video not sent on /start');

const unauth = await fetch(`${base}/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (unauth.status !== 401) fail(`unauthenticated webhook returned ${unauth.status}`);

const expired = await fetch(`${base}/auth/web?token=SMOKE_TOKEN_SHOULD_NOT_BE_LOGGED`, { redirect: 'manual' });
if (expired.status !== 410 || !(await expired.text()).includes('Havola muddati tugadi')) fail('expired link page');
await new Promise((r) => setTimeout(r, 100));
if (logs.includes('SMOKE_TOKEN_SHOULD_NOT_BE_LOGGED')) fail('login token leaked into logs');

if (logs.includes(SECRET) || logs.includes('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')) fail('secret leaked into logs');

if (PAAS) {
  const hook = sent.find((x) => x.method === 'setWebhook');
  if (!hook) fail('webhook was not auto-registered');
  if (hook.body.url !== 'https://hamyon-ai.onrender.com/telegram/webhook') fail(`wrong webhook url ${hook.body.url}`);
  if (hook.body.secret_token !== SECRET) fail('webhook secret mismatch');
  if (!sent.some((x) => x.method === 'deleteMyCommands')) fail('command list not cleared');
}

server.kill('SIGTERM');
await new Promise((r) => server.on('exit', r));
tg.close();
console.log(`SMOKE OK${PAAS ? ' (paas)' : ''}: server started, /ready ok, webhook processed /start, expired /web page ok, secrets and tokens not logged, graceful shutdown`);
