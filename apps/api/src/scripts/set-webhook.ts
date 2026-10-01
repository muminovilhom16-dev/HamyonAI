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
  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook set: ${info.url} (pending updates: ${info.pending_update_count})`);
}

main().catch((err: unknown) => {
  console.error('set-webhook failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
