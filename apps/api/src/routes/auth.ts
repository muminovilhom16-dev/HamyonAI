import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  AppError,
  ensureUser,
  verifyTelegramLogin,
  consumeLoginToken,
  createSession,
  resolveSession,
  revokeSession,
  type AuthConfig,
  type Language,
} from '@hamyon/core';
import { schema, type Database } from '@hamyon/db';
import { languageFromAcceptHeader, t } from '../i18n';

export const SESSION_COOKIE = 'hamyon_session';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { userId: string; sessionId: string };
  }
}

export interface AuthRouteOptions {
  db: Database;
  auth: AuthConfig;
  cookieSecure: boolean;
  /** Where to send the user after successful login. */
  webBaseUrl?: string;
  botUsername?: string;
  /** Needed to verify Telegram Login Widget signatures. */
  botToken: string;
  userDefaults?: { currency?: 'UZS' | 'USD'; timezone?: string; reminderTime?: string };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function expiredLinkPage(lang: Language, botUsername?: string): string {
  const button = botUsername
    ? `<a class="btn" href="https://t.me/${escapeHtml(botUsername)}">${escapeHtml(t(lang, 'openBot'))}</a>`
    : '';
  return `<!doctype html><html lang="${lang === 'ru' ? 'ru' : 'uz'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hamyon AI</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f6f7f9;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
main{background:#fff;border-radius:12px;padding:32px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px}p{color:#555;margin:0 0 24px}.btn{display:inline-block;background:#229ed9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px}
@media (prefers-color-scheme:dark){body{background:#0f1115;color:#eee}main{background:#1a1d23}p{color:#aaa}}</style></head>
<body><main><h1>${escapeHtml(t(lang, 'linkExpiredTitle'))}</h1><p>${escapeHtml(t(lang, 'linkExpiredHint'))}</p>${button}</main></body></html>`;
}

export function authRoutes(app: FastifyInstance, opts: AuthRouteOptions): void {
  // One-time /web link (TZ §26). Valid 15 min, single use, then a 30-day session.
  app.get<{ Querystring: { token?: string } }>(
    '/auth/web',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const result = await consumeLoginToken(opts.db, opts.auth, request.query.token ?? '');
      if (!result.ok) {
        const lang = languageFromAcceptHeader(request.headers['accept-language']);
        return reply
          .status(410)
          .header('cache-control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(expiredLinkPage(lang, opts.botUsername));
      }
      const session = await createSession(opts.db, opts.auth, result.userId);
      await opts.db.insert(schema.analyticsEvents).values({ userId: result.userId, name: 'web_opened' });
      reply.setCookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        secure: opts.cookieSecure,
        sameSite: 'lax',
        path: '/',
        expires: session.expiresAt,
      });
      return reply.header('cache-control', 'no-store').redirect(opts.webBaseUrl ?? '/', 303);
    },
  );

  // Telegram Login Widget: one-tap sign-up / login on the website.
  // No phone or email is ever requested (TZ §14).
  app.post('/auth/telegram', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (request.headers['x-hamyon-csrf'] !== '1') throw new AppError('forbidden');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const data = verifyTelegramLogin(opts.botToken, body);
    if (!data) throw new AppError('unauthorized');
    const { user, created } = await ensureUser(
      opts.db,
      {
        telegramId: data.id,
        displayName: [data.first_name, data.last_name].filter(Boolean).join(' ') || null,
        languageCode: languageFromAcceptHeader(request.headers['accept-language']) === 'ru' ? 'ru' : 'uz',
      },
      opts.userDefaults,
    );
    if (created) await opts.db.insert(schema.analyticsEvents).values({ userId: user.id, name: 'start', props: { channel: 'web' } });
    const session = await createSession(opts.db, opts.auth, user.id);
    await opts.db.insert(schema.analyticsEvents).values({ userId: user.id, name: 'web_opened', props: { via: 'telegram_widget' } });
    reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: opts.cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
    return { ok: true, isNew: created };
  });

  app.post('/auth/logout', async (request, reply) => {
    const session = await resolveSession(opts.db, opts.auth, request.cookies[SESSION_COOKIE]);
    if (session) await revokeSession(opts.db, session.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });

  app.get('/api/me', { preHandler: requireSession(opts) }, async (request) => {
    const [user] = await opts.db
      .select({
        language: schema.users.language,
        currency: schema.users.currency,
        timezone: schema.users.timezone,
        displayName: schema.users.displayName,
      })
      .from(schema.users)
      .where(eq(schema.users.id, request.auth!.userId));
    if (!user) throw new AppError('unauthorized');
    // Internal ids and telegram_id are intentionally not exposed.
    return user;
  });
}

/** preHandler that resolves the session cookie into `request.auth`. */
export function requireSession(opts: Pick<AuthRouteOptions, 'db' | 'auth'>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const session = await resolveSession(opts.db, opts.auth, request.cookies[SESSION_COOKIE]);
    if (!session) throw new AppError('unauthorized');
    request.auth = session;
  };
}
