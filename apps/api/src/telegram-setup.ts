import type { Api, RawApi } from 'grammy';
import type { Env } from '@hamyon/config';

/**
 * Registers the webhook (with the secret token) and clears the "/" command list.
 * Idempotent: safe on every startup.
 */
export async function setupTelegram(api: Api<RawApi>, env: Pick<Env, 'PUBLIC_BASE_URL' | 'TELEGRAM_WEBHOOK_PATH' | 'TELEGRAM_WEBHOOK_SECRET'>): Promise<string> {
  if (!env.PUBLIC_BASE_URL?.startsWith('https://')) {
    throw new Error('PUBLIC_BASE_URL must be an https URL to register a Telegram webhook');
  }
  const url = `${env.PUBLIC_BASE_URL}${env.TELEGRAM_WEBHOOK_PATH}`;
  await api.setWebhook(url, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    max_connections: 40,
  });
  // The bot is driven by the reply-keyboard menu (bot/menu.ts), so the "/" command
  // list is removed; typed commands still work.
  await api.deleteMyCommands();
  await api.deleteMyCommands({ language_code: 'ru' });
  return url;
}
