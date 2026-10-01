import type { Language } from '@hamyon/core';

const messages = {
  welcome: {
    uz_latn: "Assalomu alaykum! Men Hamyon AI — Telegramdagi o'zbekcha aqlli hamyonman.\n\nXarajatni oddiy yozing, masalan: «taksi 25 ming».",
    uz_cyrl: 'Ассалому алайкум! Мен Hamyon AI — Телеграмдаги ўзбекча ақлли ҳамёнман.\n\nХаражатни оддий ёзинг, масалан: «такси 25 минг».',
    ru: 'Здравствуйте! Я Hamyon AI — умный кошелёк в Telegram.\n\nПросто напишите расход, например: «такси 25 тысяч».',
  },
  genericError: {
    uz_latn: "Kechirasiz, xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
    uz_cyrl: 'Кечирасиз, хатолик юз берди. Бироздан сўнг қайта уриниб кўринг.',
    ru: 'Извините, произошла ошибка. Попробуйте ещё раз чуть позже.',
  },
  webLink: {
    uz_latn: 'Web panelga kirish havolasi (15 daqiqa amal qiladi, bir marta ishlaydi):',
    uz_cyrl: 'Веб панелга кириш ҳаволаси (15 дақиқа амал қилади, бир марта ишлайди):',
    ru: 'Ссылка для входа в веб-панель (действует 15 минут, одноразовая):',
  },
  webLinkButton: { uz_latn: 'Web panelni ochish', uz_cyrl: 'Веб панелни очиш', ru: 'Открыть веб-панель' },
  webUnavailable: {
    uz_latn: "Web panel hozircha mavjud emas.",
    uz_cyrl: 'Веб панел ҳозирча мавжуд эмас.',
    ru: 'Веб-панель пока недоступна.',
  },
  linkExpiredTitle: { uz_latn: 'Havola muddati tugadi.', uz_cyrl: 'Ҳавола муддати тугади.', ru: 'Срок действия ссылки истёк.' },
  linkExpiredHint: { uz_latn: 'Botda /web deb yozing.', uz_cyrl: 'Ботда /web деб ёзинг.', ru: 'Напишите боту /web.' },
  openBot: { uz_latn: 'Telegram botni ochish', uz_cyrl: 'Телеграм ботни очиш', ru: 'Открыть Telegram-бот' },
} as const satisfies Record<string, Record<Language, string>>;

export type MessageKey = keyof typeof messages;

export const t = (lang: Language, key: MessageKey): string => messages[key][lang];

export function languageFromAcceptHeader(header: string | undefined): Language {
  return header?.toLowerCase().startsWith('ru') ? 'ru' : 'uz_latn';
}
