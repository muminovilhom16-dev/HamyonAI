import type { Api, RawApi } from 'grammy';
import type { Env } from '@hamyon/config';

const COMMANDS = ['bugun', 'hafta', 'oy', 'oxirgi', 'qarzlar', 'eksport', 'sozlamalar', 'web', 'yordam'];
const LABELS = {
  uz: ['Bugungi hisobot', 'Haftalik hisobot', 'Oylik hisobot', 'Oxirgi yozuvlar', 'Qarzlar', 'Eksport (Excel/CSV)', 'Sozlamalar', 'Web panel', 'Yordam'],
  ru: ['Отчёт за сегодня', 'Отчёт за неделю', 'Отчёт за месяц', 'Последние записи', 'Долги', 'Экспорт (Excel/CSV)', 'Настройки', 'Веб-панель', 'Помощь'],
};

/**
 * Registers the webhook (with the secret token) and the command menu.
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
  const commands = (labels: string[]) => COMMANDS.map((command, i) => ({ command, description: labels[i]! }));
  await api.setMyCommands(commands(LABELS.uz));
  await api.setMyCommands(commands(LABELS.ru), { language_code: 'ru' });
  return url;
}
