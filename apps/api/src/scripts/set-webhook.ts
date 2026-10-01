import { Bot } from 'grammy';
import { loadEnv } from '@hamyon/config';

/** Registers the webhook with Telegram. Run once per deploy: `pnpm --filter @hamyon/api set-webhook`. */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.PUBLIC_BASE_URL?.startsWith('https://')) {
    throw new Error('PUBLIC_BASE_URL must be an https URL to register a Telegram webhook');
  }
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const url = `${env.PUBLIC_BASE_URL}${env.TELEGRAM_WEBHOOK_PATH}`;
  await bot.api.setWebhook(url, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    max_connections: 40,
  });
  // Command menu: Uzbek by default, Russian for Russian-language clients.
  const commands = (labels: string[]) =>
    ['bugun', 'hafta', 'oy', 'oxirgi', 'qarzlar', 'eksport', 'sozlamalar', 'web', 'yordam'].map((command, i) => ({ command, description: labels[i]! }));
  await bot.api.setMyCommands(
    commands(['Bugungi hisobot', 'Haftalik hisobot', 'Oylik hisobot', 'Oxirgi yozuvlar', 'Qarzlar', 'Eksport (Excel/CSV)', 'Sozlamalar', 'Web panel', 'Yordam']),
  );
  await bot.api.setMyCommands(
    commands(['Отчёт за сегодня', 'Отчёт за неделю', 'Отчёт за месяц', 'Последние записи', 'Долги', 'Экспорт (Excel/CSV)', 'Настройки', 'Веб-панель', 'Помощь']),
    { language_code: 'ru' },
  );
  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook set: ${info.url} (pending updates: ${info.pending_update_count})`);
}

main().catch((err: unknown) => {
  console.error('set-webhook failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
