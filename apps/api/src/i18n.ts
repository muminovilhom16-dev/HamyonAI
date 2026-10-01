import type { Language } from '@hamyon/core';

type Msgs = Record<string, Record<Language, string>>;

const messages = {
  // ─── Onboarding ───
  welcome: {
    uz_latn: "Assalomu alaykum! Men Hamyon AI — Telegramdagi o'zbekcha aqlli hamyonman.\n\nTilni tanlang:",
    uz_cyrl: 'Ассалому алайкум! Мен Hamyon AI — Телеграмдаги ўзбекча ақлли ҳамёнман.\n\nТилни танланг:',
    ru: 'Здравствуйте! Я Hamyon AI — умный кошелёк в Telegram.\n\nВыберите язык:',
  },
  welcomeBack: {
    uz_latn: "Xarajat yoki daromadni oddiy yozing, masalan: «taksi 25 ming».\n/yordam — barcha buyruqlar.",
    uz_cyrl: 'Харажат ёки даромадни оддий ёзинг, масалан: «такси 25 минг».\n/yordam — барча буйруқлар.',
    ru: 'Просто напишите расход или доход, например: «такси 25 тысяч».\n/yordam — все команды.',
  },
  askCurrency: {
    uz_latn: 'Asosiy valyutani tanlang:',
    uz_cyrl: 'Асосий валютани танланг:',
    ru: 'Выберите основную валюту:',
  },
  currencyUzs: { uz_latn: "So'm (UZS)", uz_cyrl: 'Сўм (UZS)', ru: 'Сум (UZS)' },
  currencyUsd: { uz_latn: 'Dollar (USD)', uz_cyrl: 'Доллар (USD)', ru: 'Доллар (USD)' },
  askFirstTx: {
    uz_latn: "Tayyor! Endi birinchi xarajatingizni yozing.\nMasalan: «taksi 25 ming» yoki «non 5 ming, sut 12 ming».",
    uz_cyrl: 'Тайёр! Энди биринчи харажатингизни ёзинг.\nМасалан: «такси 25 минг» ёки «нон 5 минг, сут 12 минг».',
    ru: 'Готово! Теперь напишите первый расход.\nНапример: «такси 25 тысяч» или «хлеб 5к, молоко 12к».',
  },
  askReminder: {
    uz_latn: 'Har kuni soat nechada eslatay? (faqat o\'sha kuni hech narsa yozmagan bo\'lsangiz)',
    uz_cyrl: 'Ҳар куни соат нечада эслатай? (фақат ўша куни ҳеч нарса ёзмаган бўлсангиз)',
    ru: 'Во сколько напоминать каждый день? (только если за день ничего не записано)',
  },
  reminderOff: { uz_latn: 'Kerak emas', uz_cyrl: 'Керак эмас', ru: 'Не нужно' },
  onboardingDone: {
    uz_latn: "Hammasi tayyor! Endi har bir xarajatni bitta xabar bilan yozing.\n/bugun, /hafta, /oy — hisobotlar, /yordam — yordam.",
    uz_cyrl: 'Ҳаммаси тайёр! Энди ҳар бир харажатни битта хабар билан ёзинг.\n/bugun, /hafta, /oy — ҳисоботлар, /yordam — ёрдам.',
    ru: 'Всё готово! Записывайте каждый расход одним сообщением.\n/bugun, /hafta, /oy — отчёты, /yordam — помощь.',
  },

  // ─── Cards ───
  categoryPending: { uz_latn: 'Kategoriya: aniqlanmagan', uz_cyrl: 'Категория: аниқланмаган', ru: 'Категория: не определена' },
  income: { uz_latn: 'Daromad', uz_cyrl: 'Даромад', ru: 'Доход' },
  delete: { uz_latn: "🗑 O'chirish", uz_cyrl: '🗑 Ўчириш', ru: '🗑 Удалить' },
  deleted: { uz_latn: "🗑 O'chirildi", uz_cyrl: '🗑 Ўчирилди', ru: '🗑 Удалено' },
  undo: { uz_latn: '↩️ Qaytarish', uz_cyrl: '↩️ Қайтариш', ru: '↩️ Вернуть' },
  undoExpired: { uz_latn: "Qaytarish muddati o'tdi", uz_cyrl: 'Қайтариш муддати ўтди', ru: 'Время для отмены истекло' },
  restored: { uz_latn: 'Qaytarildi', uz_cyrl: 'Қайтарилди', ru: 'Восстановлено' },
  confirmAmountQ: { uz_latn: "Summa to'g'rimi?", uz_cyrl: 'Сумма тўғрими?', ru: 'Сумма верна?' },
  otherAmount: { uz_latn: '✏️ Boshqa summa', uz_cyrl: '✏️ Бошқа сумма', ru: '✏️ Другая сумма' },
  pickCategory: { uz_latn: 'Kategoriyani tanlang:', uz_cyrl: 'Категорияни танланг:', ru: 'Выберите категорию:' },
  personKindQ: { uz_latn: 'Bu qarzmi yoki xarajatmi?', uz_cyrl: 'Бу қарзми ёки харажатми?', ru: 'Это долг или расход?' },
  debtGiven: { uz_latn: 'Qarz berdim', uz_cyrl: 'Қарз бердим', ru: 'Дал в долг' },
  expense: { uz_latn: 'Xarajat', uz_cyrl: 'Харажат', ru: 'Расход' },
  enterAmount: {
    uz_latn: 'Yangi summani yozing, masalan: «45 ming».',
    uz_cyrl: 'Янги суммани ёзинг, масалан: «45 минг».',
    ru: 'Напишите новую сумму, например: «45 тысяч».',
  },
  askAmount: {
    uz_latn: "Summani aniqlay olmadim. Qancha bo'ldi? Masalan: «50 ming».",
    uz_cyrl: 'Суммани аниқлай олмадим. Қанча бўлди? Масалан: «50 минг».',
    ru: 'Не понял сумму. Сколько? Например: «50 тысяч».',
  },
  amountNotUnderstood: {
    uz_latn: 'Summani aniqlay olmadim. Masalan: «taksi 25 ming».',
    uz_cyrl: 'Суммани аниқлай олмадим. Масалан: «такси 25 минг».',
    ru: 'Не удалось определить сумму. Например: «такси 25 тысяч».',
  },
  pickDate: { uz_latn: 'Sanani tanlang:', uz_cyrl: 'Санани танланг:', ru: 'Выберите дату:' },
  dayBefore: { uz_latn: "O'tgan kuni", uz_cyrl: 'Ўтган куни', ru: 'Позавчера' },
  back: { uz_latn: '⬅️ Orqaga', uz_cyrl: '⬅️ Орқага', ru: '⬅️ Назад' },
  expired: {
    uz_latn: "Bu so'rov eskirgan. Qaytadan yozing.",
    uz_cyrl: 'Бу сўров эскирган. Қайтадан ёзинг.',
    ru: 'Запрос устарел. Напишите заново.',
  },
  debtComingSoon: {
    uz_latn: "Bu qarz sifatida tanildi va xarajatga yozilmadi. Qarzlar moduli keyingi bosqichda ulanadi.",
    uz_cyrl: 'Бу қарз сифатида танилди ва харажатга ёзилмади. Қарзлар модули кейинги босқичда уланади.',
    ru: 'Это распознано как долг и не записано в расходы. Модуль долгов подключается на следующем этапе.',
  },
  rateUnavailable: {
    uz_latn: "Dollar kursini hozir olib bo'lmadi. Birozdan so'ng qayta yuboring.",
    uz_cyrl: 'Доллар курсини ҳозир олиб бўлмади. Бироздан сўнг қайта юборинг.',
    ru: 'Не удалось получить курс доллара. Отправьте чуть позже.',
  },

  // ─── Reports / lists ───
  reportDay: { uz_latn: '📊 Bugungi hisobot', uz_cyrl: '📊 Бугунги ҳисобот', ru: '📊 Отчёт за сегодня' },
  reportWeek: { uz_latn: '📊 Haftalik hisobot', uz_cyrl: '📊 Ҳафталик ҳисобот', ru: '📊 Отчёт за неделю' },
  reportMonth: { uz_latn: '📊 Oylik hisobot', uz_cyrl: '📊 Ойлик ҳисобот', ru: '📊 Отчёт за месяц' },
  expenseLabel: { uz_latn: 'Xarajat', uz_cyrl: 'Харажат', ru: 'Расходы' },
  incomeLabel: { uz_latn: 'Daromad', uz_cyrl: 'Даромад', ru: 'Доходы' },
  topCategory: { uz_latn: 'Eng katta kategoriya', uz_cyrl: 'Энг катта категория', ru: 'Крупнейшая категория' },
  noRecords: {
    uz_latn: "Bu davrda hali yozuv yo'q. Masalan: «taksi 25 ming».",
    uz_cyrl: 'Бу даврда ҳали ёзув йўқ. Масалан: «такси 25 минг».',
    ru: 'За этот период записей нет. Например: «такси 25 тысяч».',
  },
  recentTitle: { uz_latn: '🧾 Oxirgi yozuvlar', uz_cyrl: '🧾 Охирги ёзувлар', ru: '🧾 Последние записи' },
  uncategorized: { uz_latn: 'Kategoriyasiz', uz_cyrl: 'Категориясиз', ru: 'Без категории' },
  help: {
    uz_latn:
      "Xarajatni oddiy yozing: «taksi 25 ming», «non 5 ming, sut 12 ming», «50$ kurtka».\nDaromad: «oylik tushdi 6 mln», «+500 ming».\n\n/bugun — bugungi hisobot\n/hafta — haftalik\n/oy — oylik\n/oxirgi — oxirgi 20 ta yozuv\n/web — web panel\n/yordam — yordam",
    uz_cyrl:
      'Харажатни оддий ёзинг: «такси 25 минг», «нон 5 минг, сут 12 минг», «50$ куртка».\nДаромад: «ойлик тушди 6 млн», «+500 минг».\n\n/bugun — бугунги ҳисобот\n/hafta — ҳафталик\n/oy — ойлик\n/oxirgi — охирги 20 та ёзув\n/web — веб панел\n/yordam — ёрдам',
    ru:
      'Просто пишите расход: «такси 25 тысяч», «хлеб 5к, молоко 12к», «50$ куртка».\nДоход: «зарплата 6 млн», «+500 тысяч».\n\n/bugun — отчёт за сегодня\n/hafta — за неделю\n/oy — за месяц\n/oxirgi — последние 20 записей\n/web — веб-панель\n/yordam — помощь',
  },

  // ─── Errors / web ───
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
  webUnavailable: { uz_latn: 'Web panel hozircha mavjud emas.', uz_cyrl: 'Веб панел ҳозирча мавжуд эмас.', ru: 'Веб-панель пока недоступна.' },
  linkExpiredTitle: { uz_latn: 'Havola muddati tugadi.', uz_cyrl: 'Ҳавола муддати тугади.', ru: 'Срок действия ссылки истёк.' },
  linkExpiredHint: { uz_latn: 'Botda /web deb yozing.', uz_cyrl: 'Ботда /web деб ёзинг.', ru: 'Напишите боту /web.' },
  openBot: { uz_latn: 'Telegram botni ochish', uz_cyrl: 'Телеграм ботни очиш', ru: 'Открыть Telegram-бот' },
} as const satisfies Msgs;

export type MessageKey = keyof typeof messages;

export const t = (lang: Language, key: MessageKey): string => messages[key][lang];

export function languageFromAcceptHeader(header: string | undefined): Language {
  return header?.toLowerCase().startsWith('ru') ? 'ru' : 'uz_latn';
}
