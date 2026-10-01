import { Bot } from 'grammy';
import { loadEnv } from '@hamyon/config';
import { setupTelegram } from '../telegram-setup';

/** Registers the webhook with Telegram. Run once per deploy: `pnpm --filter @hamyon/api set-webhook`. */
async function main(): Promise<void> {
  const env = loadEnv();
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_ROOT ? { client: { apiRoot: env.TELEGRAM_API_ROOT } } : {});
  await setupTelegram(bot.api, env);
  const info = await bot.api.getWebhookInfo();
  console.log(`Webhook set: ${info.url} (pending updates: ${info.pending_update_count})`);
}

main().catch((err: unknown) => {
  console.error('set-webhook failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
