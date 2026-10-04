import { Keyboard, type Bot } from 'grammy';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import type { Language } from '@hamyon/core';
import type { BotContext, BotServices } from './context';

/** Bump when the layout changes: every user is re-sent the keyboard once. */
export const MENU_VERSION = 1;

type Item = { command: string; label: Record<Language, string> };

/** Reply-keyboard rows (buttons under the message box). Each button runs an existing command. */
const ROWS: Item[][] = [
  [
    { command: 'bugun', label: { uz_latn: '📊 Bugun', uz_cyrl: '📊 Бугун', ru: '📊 Сегодня' } },
    { command: 'hafta', label: { uz_latn: '📅 Hafta', uz_cyrl: '📅 Ҳафта', ru: '📅 Неделя' } },
    { command: 'oy', label: { uz_latn: '🗓 Oy', uz_cyrl: '🗓 Ой', ru: '🗓 Месяц' } },
  ],
  [
    { command: 'oxirgi', label: { uz_latn: '🧾 Oxirgi yozuvlar', uz_cyrl: '🧾 Охирги ёзувлар', ru: '🧾 Последние записи' } },
    { command: 'qarzlar', label: { uz_latn: '🤝 Qarzlar', uz_cyrl: '🤝 Қарзлар', ru: '🤝 Долги' } },
  ],
  [
    { command: 'byudjet', label: { uz_latn: '🎯 Limitlar', uz_cyrl: '🎯 Лимитлар', ru: '🎯 Лимиты' } },
    { command: 'obunalar', label: { uz_latn: "🔁 To'lovlar", uz_cyrl: '🔁 Тўловлар', ru: '🔁 Платежи' } },
    { command: 'maqsad', label: { uz_latn: '🏦 Maqsadlar', uz_cyrl: '🏦 Мақсадлар', ru: '🏦 Цели' } },
  ],
  [
    { command: 'hisoblar', label: { uz_latn: '💳 Hisoblar', uz_cyrl: '💳 Ҳисоблар', ru: '💳 Счета' } },
    { command: 'web', label: { uz_latn: '🌐 Web panel', uz_cyrl: '🌐 Веб панел', ru: '🌐 Веб-панель' } },
    { command: 'sozlamalar', label: { uz_latn: '⚙️ Sozlamalar', uz_cyrl: '⚙️ Созламалар', ru: '⚙️ Настройки' } },
  ],
  [{ command: 'yordam', label: { uz_latn: '❓ Yordam', uz_cyrl: '❓ Ёрдам', ru: '❓ Помощь' } }],
];

const PLACEHOLDER: Record<Language, string> = {
  uz_latn: 'Masalan: taksi 25 ming',
  uz_cyrl: 'Масалан: такси 25 минг',
  ru: 'Например: такси 25 тысяч',
};

/** Label (any language) → command. */
const BY_LABEL = new Map<string, string>(
  ROWS.flat().flatMap((item) => Object.values(item.label).map((l) => [l, item.command] as const)),
);

export function commandForLabel(text: string): string | null {
  return BY_LABEL.get(text.trim()) ?? null;
}

export function mainKeyboard(lang: Language): Keyboard {
  const kb = new Keyboard();
  ROWS.forEach((row, i) => {
    for (const item of row) kb.text(item.label[lang]);
    if (i < ROWS.length - 1) kb.row();
  });
  return kb.resized().persistent().placeholder(PLACEHOLDER[lang]);
}

const MENU_HINT: Record<Language, string> = {
  uz_latn: '👇 Menyu pastda: kerakli bo‘limni tugma orqali oching. Xarajatni esa odatdagidek yozavering.',
  uz_cyrl: '👇 Меню пастда: керакли бўлимни тугма орқали очинг. Харажатни эса одатдагидек ёзаверинг.',
  ru: '👇 Меню внизу: открывайте разделы кнопками. Расходы пишите как обычно.',
};

/** Sends the keyboard (with a one-line hint) and records that this user has it. */
export async function sendMenu(ctx: BotContext, s: BotServices, text?: string): Promise<void> {
  const user = ctx.user!;
  await ctx.reply(text ?? MENU_HINT[user.language], { reply_markup: mainKeyboard(user.language) });
  if (user.menuVersion !== MENU_VERSION) {
    await s.db.update(schema.users).set({ menuVersion: MENU_VERSION }).where(eq(schema.users.id, user.id));
    ctx.user = { ...user, menuVersion: MENU_VERSION };
  }
}

/**
 * 1) Button presses become their command (so every bot.command handler runs
 *    unchanged and the text never reaches the expense parser).
 * 2) After handling, users who finished onboarding but have not got the
 *    current keyboard yet receive it once.
 */
export function registerMenu(bot: Bot<BotContext>, s: BotServices): void {
  bot.use(async (ctx, next) => {
    const msg = ctx.message;
    if (msg?.text && !msg.text.startsWith('/')) {
      const command = commandForLabel(msg.text);
      if (command) {
        msg.text = `/${command}`;
        msg.entities = [{ type: 'bot_command', offset: 0, length: command.length + 1 }];
      }
    }
    await next();
    const user = ctx.user;
    if (user && ctx.chat && user.onboardingCompletedAt && !user.deletionRequestedAt && user.menuVersion < MENU_VERSION) {
      await sendMenu(ctx, s);
    }
  });
}
