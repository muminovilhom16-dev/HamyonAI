import type { Api, RawApi } from 'grammy';
import type { Env } from '@hamyon/config';

/** Command menu: [command, uz label, ru label]. */
const COMMANDS: Array<[string, string, string]> = [
  ['bugun', 'Bugungi hisobot', 'Отчёт за сегодня'],
  ['hafta', 'Haftalik hisobot', 'Отчёт за неделю'],
  ['oy', 'Oylik hisobot', 'Отчёт за месяц'],
  ['oxirgi', 'Oxirgi yozuvlar', 'Последние записи'],
  ['ochir', "Oxirgi yozuvni o'chirish", 'Удалить последнюю запись'],
  ['qarzlar', 'Qarzlar', 'Долги'],
  ['byudjet', 'Oylik limitlar', 'Месячные лимиты'],
  ['obunalar', "Doimiy to'lovlar", 'Регулярные платежи'],
  ['maqsad', "Jamg'arma maqsadlari", 'Цели накоплений'],
  ['eksport', 'Eksport (Excel/CSV)', 'Экспорт (Excel/CSV)'],
  ['sozlamalar', 'Sozlamalar', 'Настройки'],
  ['web', 'Web panel', 'Веб-панель'],
  ['yordam', 'Yordam', 'Помощь'],
];

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
  await api.setMyCommands(COMMANDS.map(([command, uz]) => ({ command, description: uz })));
  await api.setMyCommands(COMMANDS.map(([command, , ru]) => ({ command, description: ru })), { language_code: 'ru' });
  return url;
}
