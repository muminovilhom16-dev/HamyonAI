import { esc } from './bot/html';
import type { Language } from '@hamyon/core';

type Msgs = Record<string, Record<Language, string>>;

const messages = {
  // ─── Onboarding ───
  welcome: {
    uz_latn: "👋 Assalomu alaykum! Men <b>Hamyon AI</b> — Telegramdagi o'zbekcha aqlli hamyonman.\n\nTilni tanlang:",
    uz_cyrl: '👋 Ассалому алайкум! Мен <b>Hamyon AI</b> — Телеграмдаги ўзбекча ақлли ҳамёнман.\n\nТилни танланг:',
    ru: '👋 Здравствуйте! Я <b>Hamyon AI</b> — умный кошелёк в Telegram.\n\nВыберите язык:',
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
    uz_latn: "✍️ Tayyor! Endi birinchi xarajatingizni yozing.\nMasalan: «taksi 25 ming» yoki «non 5 ming, sut 12 ming».",
    uz_cyrl: '✍️ Тайёр! Энди биринчи харажатингизни ёзинг.\nМасалан: «такси 25 минг» ёки «нон 5 минг, сут 12 минг».',
    ru: '✍️ Готово! Теперь напишите первый расход.\nНапример: «такси 25 тысяч» или «хлеб 5к, молоко 12к».',
  },
  askReminder: {
    uz_latn: 'Har kuni soat nechada eslatay? (faqat o\'sha kuni hech narsa yozmagan bo\'lsangiz)',
    uz_cyrl: 'Ҳар куни соат нечада эслатай? (фақат ўша куни ҳеч нарса ёзмаган бўлсангиз)',
    ru: 'Во сколько напоминать каждый день? (только если за день ничего не записано)',
  },
  reminderOff: { uz_latn: 'Kerak emas', uz_cyrl: 'Керак эмас', ru: 'Не нужно' },
  onboardingDone: {
    uz_latn: "🎉 Hammasi tayyor! Endi har bir xarajatni bitta xabar bilan yozing.\n/bugun, /hafta, /oy — hisobotlar, /yordam — yordam.",
    uz_cyrl: '🎉 Ҳаммаси тайёр! Энди ҳар бир харажатни битта хабар билан ёзинг.\n/bugun, /hafta, /oy — ҳисоботлар, /yordam — ёрдам.',
    ru: '🎉 Всё готово! Записывайте каждый расход одним сообщением.\n/bugun, /hafta, /oy — отчёты, /yordam — помощь.',
  },

  // ─── Cards ───
  categoryPending: { uz_latn: 'Kategoriya: aniqlanmagan', uz_cyrl: 'Категория: аниқланмаган', ru: 'Категория: не определена' },
  categoryShort: { uz_latn: 'Kategoriya', uz_cyrl: 'Категория', ru: 'Категория' },
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
  balanceLabel: { uz_latn: 'Qoldiq', uz_cyrl: 'Қолдиқ', ru: 'Остаток' },
  topCategories: { uz_latn: 'Eng katta xarajatlar', uz_cyrl: 'Энг катта харажатлар', ru: 'Основные расходы' },
  recordsCount: { uz_latn: '{count} ta yozuv', uz_cyrl: '{count} та ёзув', ru: 'записей: {count}' },
  noRecords: {
    uz_latn: "Bu davrda hali yozuv yo'q. Masalan: «taksi 25 ming».",
    uz_cyrl: 'Бу даврда ҳали ёзув йўқ. Масалан: «такси 25 минг».',
    ru: 'За этот период записей нет. Например: «такси 25 тысяч».',
  },
  recentTitle: { uz_latn: '🧾 Oxirgi yozuvlar', uz_cyrl: '🧾 Охирги ёзувлар', ru: '🧾 Последние записи' },
  uncategorized: { uz_latn: 'Kategoriyasiz', uz_cyrl: 'Категориясиз', ru: 'Без категории' },
  help: {
    uz_latn:
      "<b>📖 Qanday yozish kerak</b>\n\n💸 Xarajat: «taksi 25 ming», «non 5 ming, sut 12 ming», «telefon 2kk», «50$ kurtka»\n💰 Daromad: «oylik tushdi 6 mln», «+500 ming»\n🤝 Qarz: «Murod akaga 300 ming qarz berdim», «Murod aka 100 ming qaytardi»\n\n<b>📊 Hisobotlar</b>\n/bugun — bugungi hisobot\n/hafta — haftalik\n/oy — oylik\n/oxirgi — oxirgi 20 ta yozuv\n/ochir — oxirgi yozuvni o'chirish\n/qarzlar — qarzlar\n/byudjet — oylik limitlar\n/obunalar — doimiy to'lovlar\n/maqsad — jamg'arma maqsadlari («maqsadga 200 ming»)\n\n<b>⚙️ Boshqa</b>\n/web — web panel\n/sozlamalar — sozlamalar\n/yordam — yordam",
    uz_cyrl:
      '<b>📖 Қандай ёзиш керак</b>\n\n💸 Харажат: «такси 25 минг», «нон 5 минг, сут 12 минг», «50$ куртка»\n💰 Даромад: «ойлик тушди 6 млн», «+500 минг»\n🤝 Қарз: «Мурод акага 300 минг қарз бердим», «Мурод ака 100 минг қайтарди»\n\n<b>📊 Ҳисоботлар</b>\n/bugun — бугунги ҳисобот\n/hafta — ҳафталик\n/oy — ойлик\n/oxirgi — охирги 20 та ёзув\n/ochir — охирги ёзувни ўчириш\n/qarzlar — қарзлар\n/byudjet — ойлик лимитлар\n/obunalar — доимий тўловлар\n/maqsad — жамғарма мақсадлари («мақсадга 200 минг»)\n\n<b>⚙️ Бошқа</b>\n/web — веб панел\n/sozlamalar — созламалар\n/yordam — ёрдам',
    ru:
      '<b>📖 Как записывать</b>\n\n💸 Расход: «такси 25 тысяч», «хлеб 5к, молоко 12к», «50$ куртка»\n💰 Доход: «зарплата 6 млн», «+500 тысяч»\n🤝 Долг: «дал в долг Мурод ака 300к», «Мурод ака вернул 100к»\n\n<b>📊 Отчёты</b>\n/bugun — за сегодня\n/hafta — за неделю\n/oy — за месяц\n/oxirgi — последние 20 записей\n/ochir — удалить последнюю запись\n/qarzlar — долги\n/byudjet — месячные лимиты\n/obunalar — регулярные платежи\n/maqsad — цели накоплений («на цель 200 тысяч»)\n\n<b>⚙️ Другое</b>\n/web — веб-панель\n/sozlamalar — настройки\n/yordam — помощь',
  },

  // ─── Debts ───
  debtGivenTitle: { uz_latn: '🤝 Qarz berdim', uz_cyrl: '🤝 Қарз бердим', ru: '🤝 Дал в долг' },
  debtTakenTitle: { uz_latn: '🤝 Qarz oldim', uz_cyrl: '🤝 Қарз олдим', ru: '🤝 Взял в долг' },
  debtReturnTitle: { uz_latn: '↩️ Qarz qaytarildi', uz_cyrl: '↩️ Қарз қайтарилди', ru: '↩️ Возврат долга' },
  remainingLabel: { uz_latn: 'Qoldiq', uz_cyrl: 'Қолдиқ', ru: 'Остаток' },
  debtClosed: { uz_latn: "✅ Qarz to'liq yopildi", uz_cyrl: '✅ Қарз тўлиқ ёпилди', ru: '✅ Долг полностью погашен' },
  dueLabel: { uz_latn: 'Muddat', uz_cyrl: 'Муддат', ru: 'Срок' },
  setDue: { uz_latn: '📅 Muddat', uz_cyrl: '📅 Муддат', ru: '📅 Срок' },
  dueWeek: { uz_latn: '1 hafta', uz_cyrl: '1 ҳафта', ru: '1 неделя' },
  due2Weeks: { uz_latn: '2 hafta', uz_cyrl: '2 ҳафта', ru: '2 недели' },
  dueMonth: { uz_latn: '1 oy', uz_cyrl: '1 ой', ru: '1 месяц' },
  dueNone: { uz_latn: 'Muddatsiz', uz_cyrl: 'Муддатсиз', ru: 'Без срока' },
  pickDue: { uz_latn: 'Qaytarish muddatini tanlang:', uz_cyrl: 'Қайтариш муддатини танланг:', ru: 'Выберите срок возврата:' },
  askCounterparty: {
    uz_latn: 'Kim bilan? Ismini yozing, masalan: «Murod aka».',
    uz_cyrl: 'Ким билан? Исмини ёзинг, масалан: «Мурод ака».',
    ru: 'С кем? Напишите имя, например: «Мурод ака».',
  },
  askDebtDirection: { uz_latn: 'Qarz berdingizmi yoki oldingizmi?', uz_cyrl: 'Қарз бердингизми ёки олдингизми?', ru: 'Вы дали в долг или взяли?' },
  debtTaken: { uz_latn: 'Qarz oldim', uz_cyrl: 'Қарз олдим', ru: 'Взял в долг' },
  askReturnDirection: { uz_latn: 'Kim qaytardi?', uz_cyrl: 'Ким қайтарди?', ru: 'Кто вернул?' },
  returnToMe: { uz_latn: 'Menga qaytarildi', uz_cyrl: 'Менга қайтарилди', ru: 'Мне вернули' },
  returnByMe: { uz_latn: 'Men qaytardim', uz_cyrl: 'Мен қайтардим', ru: 'Я вернул' },
  noDebtFound: { uz_latn: '{name} bilan ochiq qarz topilmadi.', uz_cyrl: '{name} билан очиқ қарз топилмади.', ru: 'Открытых долгов с «{name}» нет.' },
  ambiguousPerson: {
    uz_latn: "Bir nechta odam topildi: {names}. To'liq ismini yozib qayta yuboring.",
    uz_cyrl: 'Бир нечта одам топилди: {names}. Тўлиқ исмини ёзиб қайта юборинг.',
    ru: 'Найдено несколько человек: {names}. Напишите полное имя и отправьте снова.',
  },
  debtCurrencyMismatch: {
    uz_latn: 'Bu qarz {currency} da. Summani shu valyutada yozing.',
    uz_cyrl: 'Бу қарз {currency} да. Суммани шу валютада ёзинг.',
    ru: 'Этот долг в {currency}. Укажите сумму в этой валюте.',
  },
  overpayment: {
    uz_latn: "Qoldiq {remaining}, siz {amount} yozdingiz. Tekshirib qayta yuboring.",
    uz_cyrl: 'Қолдиқ {remaining}, сиз {amount} ёздингиз. Текшириб қайта юборинг.',
    ru: 'Остаток {remaining}, а вы указали {amount}. Проверьте и отправьте снова.',
  },
  debtHasPayments: {
    uz_latn: "Bu qarz bo'yicha to'lovlar bor, uni o'chirib bo'lmaydi.",
    uz_cyrl: 'Бу қарз бўйича тўловлар бор, уни ўчириб бўлмайди.',
    ru: 'По этому долгу уже есть платежи, удалить нельзя.',
  },
  debtsTitle: { uz_latn: '🤝 Qarzlar', uz_cyrl: '🤝 Қарзлар', ru: '🤝 Долги' },
  owedToMe: { uz_latn: 'Sizga qarzdor:', uz_cyrl: 'Сизга қарздор:', ru: 'Вам должны:' },
  iOwe: { uz_latn: 'Siz qarzdorsiz:', uz_cyrl: 'Сиз қарздорсиз:', ru: 'Вы должны:' },
  noDebts: { uz_latn: "Ochiq qarzlar yo'q.", uz_cyrl: 'Очиқ қарзлар йўқ.', ru: 'Открытых долгов нет.' },
  debtLabel: { uz_latn: 'Qarz', uz_cyrl: 'Қарз', ru: 'Долг' },
  reminderDueSoonGiven: {
    uz_latn: '⏰ Eslatma: {name} <b>{amount}</b> qarzni {date} gacha qaytarishi kerak.',
    uz_cyrl: '⏰ Эслатма: {name} <b>{amount}</b> қарзни {date} гача қайтариши керак.',
    ru: '⏰ Напоминание: {name} должен вернуть <b>{amount}</b> до {date}.',
  },
  reminderDueSoonTaken: {
    uz_latn: '⏰ Eslatma: {name}ga <b>{amount}</b> qarzni {date} gacha qaytarishingiz kerak.',
    uz_cyrl: '⏰ Эслатма: {name}га <b>{amount}</b> қарзни {date} гача қайтаришингиз керак.',
    ru: '⏰ Напоминание: вернуть {name} <b>{amount}</b> до {date}.',
  },
  reminderDueTodayGiven: {
    uz_latn: '⏰ Bugun {name} <b>{amount}</b> qarzni qaytarish muddati.',
    uz_cyrl: '⏰ Бугун {name} <b>{amount}</b> қарзни қайтариш муддати.',
    ru: '⏰ Сегодня {name} должен вернуть <b>{amount}</b>.',
  },
  reminderDueTodayTaken: {
    uz_latn: '⏰ Bugun {name}ga <b>{amount}</b> qarzni qaytarish muddati.',
    uz_cyrl: '⏰ Бугун {name}га <b>{amount}</b> қарзни қайтариш муддати.',
    ru: '⏰ Сегодня срок вернуть {name} <b>{amount}</b>.',
  },

  // ─── Budgets ───
  budgetTitle: { uz_latn: '🎯 Byudjet', uz_cyrl: '🎯 Бюджет', ru: '🎯 Бюджет' },
  budgetTotal: { uz_latn: 'Umumiy xarajat', uz_cyrl: 'Умумий харажат', ru: 'Все расходы' },
  budgetEmpty: {
    uz_latn: "Hali limit qo'yilmagan. Masalan: /byudjet oziq-ovqat 2 mln",
    uz_cyrl: 'Ҳали лимит қўйилмаган. Масалан: /byudjet озиқ-овқат 2 млн',
    ru: 'Лимитов пока нет. Например: /byudjet продукты 2 млн',
  },
  budgetAdd: { uz_latn: "➕ Limit qo'shish", uz_cyrl: '➕ Лимит қўшиш', ru: '➕ Добавить лимит' },
  budgetPick: { uz_latn: 'Qaysi kategoriya uchun oylik limit?', uz_cyrl: 'Қайси категория учун ойлик лимит?', ru: 'Для какой категории месячный лимит?' },
  budgetAskAmount: {
    uz_latn: '{name} uchun oylik limitni yozing, masalan: «2 mln».',
    uz_cyrl: '{name} учун ойлик лимитни ёзинг, масалан: «2 млн».',
    ru: 'Напишите месячный лимит для «{name}», например: «2 млн».',
  },
  budgetPlanLimit: {
    uz_latn: "Limitlar soni tarif bo'yicha chegaraga yetdi. Keraksizini o'chirib, yangisini qo'shing.",
    uz_cyrl: 'Лимитлар сони тариф бўйича чегарага етди. Кераксизини ўчириб, янгисини қўшинг.',
    ru: 'Достигнуто максимальное число лимитов по тарифу. Удалите ненужный и добавьте новый.',
  },
  budgetAlert80: {
    uz_latn: '⚠️ {name}: limitning {pct}% ishlatildi ({spent} / {limit})',
    uz_cyrl: '⚠️ {name}: лимитнинг {pct}% ишлатилди ({spent} / {limit})',
    ru: '⚠️ {name}: израсходовано {pct}% лимита ({spent} / {limit})',
  },
  budgetAlert100: {
    uz_latn: '🔴 {name}: oylik limit tugadi ({spent} / {limit})',
    uz_cyrl: '🔴 {name}: ойлик лимит тугади ({spent} / {limit})',
    ru: '🔴 {name}: месячный лимит исчерпан ({spent} / {limit})',
  },
  budgetLeft: { uz_latn: 'qoldi', uz_cyrl: 'қолди', ru: 'осталось' },
  budgetOver: { uz_latn: 'oshib ketdi', uz_cyrl: 'ошиб кетди', ru: 'перерасход' },

  // ─── Recurring payments ───
  recurringTitle: { uz_latn: '🔁 Doimiy to‘lovlar', uz_cyrl: '🔁 Доимий тўловлар', ru: '🔁 Регулярные платежи' },
  recurringEmpty: {
    uz_latn: "Hali yo'q. Internet, kommunal, kredit kabi har oylik to'lovlarni qo'shing — to'lov kuni bot eslatadi va bir bosishda yozib qo'yadi.",
    uz_cyrl: 'Ҳали йўқ. Интернет, коммунал, кредит каби ҳар ойлик тўловларни қўшинг — тўлов куни бот эслатади ва бир босишда ёзиб қўяди.',
    ru: 'Пока нет. Добавьте ежемесячные платежи — интернет, коммуналка, кредит: в день оплаты бот напомнит и запишет в одно касание.',
  },
  recurringAdd: { uz_latn: "➕ Qo'shish", uz_cyrl: '➕ Қўшиш', ru: '➕ Добавить' },
  recurringAskText: {
    uz_latn: "To'lovni yozing, masalan: «internet 99 ming» yoki «kredit 1,2 mln».",
    uz_cyrl: 'Тўловни ёзинг, масалан: «интернет 99 минг» ёки «кредит 1,2 млн».',
    ru: 'Напишите платёж, например: «интернет 99 тысяч» или «кредит 1,2 млн».',
  },
  recurringAskDay: { uz_latn: '{name} — har oyning nechanchi sanasida?', uz_cyrl: '{name} — ҳар ойнинг нечанчи санасида?', ru: '{name} — какого числа каждого месяца?' },
  recurringDay: { uz_latn: 'har oy {day}-sana', uz_cyrl: 'ҳар ой {day}-сана', ru: 'каждое {day}-е число' },
  recurringNext: { uz_latn: 'keyingisi', uz_cyrl: 'кейингиси', ru: 'следующий' },
  recurringDue: {
    uz_latn: "🔁 Bugun to'lov kuni: {name} — <b>{amount}</b>",
    uz_cyrl: '🔁 Бугун тўлов куни: {name} — <b>{amount}</b>',
    ru: '🔁 Сегодня день оплаты: {name} — <b>{amount}</b>',
  },
  recurringPaid: { uz_latn: "✅ To'landi", uz_cyrl: '✅ Тўланди', ru: '✅ Оплачено' },
  recurringSkip: { uz_latn: '⏭ Bu oy emas', uz_cyrl: '⏭ Бу ой эмас', ru: '⏭ Не в этом месяце' },
  recurringSkipped: { uz_latn: "⏭ Bu oy o'tkazib yuborildi.", uz_cyrl: '⏭ Бу ой ўтказиб юборилди.', ru: '⏭ В этом месяце пропущено.' },
  recurringAlready: { uz_latn: 'Bu oy allaqachon belgilangan', uz_cyrl: 'Бу ой аллақачон белгиланган', ru: 'Этот месяц уже отмечен' },
  recurringNotUnderstood: {
    uz_latn: "Nomi va summasini tushunmadim. Masalan: «internet 99 ming».",
    uz_cyrl: 'Номи ва суммасини тушунмадим. Масалан: «интернет 99 минг».',
    ru: 'Не понял название и сумму. Например: «интернет 99 тысяч».',
  },
  recurringTooMany: { uz_latn: "Doimiy to'lovlar soni chegaraga yetdi (30).", uz_cyrl: 'Доимий тўловлар сони чегарага етди (30).', ru: 'Достигнут предел регулярных платежей (30).' },

  // ─── Savings goals ───
  goalsTitle: { uz_latn: '🎯 Maqsadlar', uz_cyrl: '🎯 Мақсадлар', ru: '🎯 Цели' },
  goalsEmpty: {
    uz_latn: "Hali maqsad yo'q. Masalan: telefon uchun 5 mln yig'ish. Jamg'arma xarajat hisoblanmaydi.",
    uz_cyrl: 'Ҳали мақсад йўқ. Масалан: телефон учун 5 млн йиғиш. Жамғарма харажат ҳисобланмайди.',
    ru: 'Целей пока нет. Например: накопить 5 млн на телефон. Накопления не считаются расходами.',
  },
  goalNew: { uz_latn: '➕ Yangi maqsad', uz_cyrl: '➕ Янги мақсад', ru: '➕ Новая цель' },
  goalAskText: {
    uz_latn: "Maqsad va summani yozing, masalan: «telefon 5 mln».",
    uz_cyrl: 'Мақсад ва суммани ёзинг, масалан: «телефон 5 млн».',
    ru: 'Напишите цель и сумму, например: «телефон 5 млн».',
  },
  goalAskAmount: {
    uz_latn: "«{name}» uchun qancha qo'yasiz? Masalan: «200 ming». Olish uchun minus bilan: «-100 ming».",
    uz_cyrl: '«{name}» учун қанча қўясиз? Масалан: «200 минг». Олиш учун минус билан: «-100 минг».',
    ru: 'Сколько отложить на «{name}»? Например: «200 тысяч». Чтобы снять — с минусом: «-100 тысяч».',
  },
  goalPick: { uz_latn: 'Qaysi maqsadga?', uz_cyrl: 'Қайси мақсадга?', ru: 'На какую цель?' },
  goalNotUnderstood: {
    uz_latn: "Maqsad nomi va summasini tushunmadim. Masalan: «telefon 5 mln».",
    uz_cyrl: 'Мақсад номи ва суммасини тушунмадим. Масалан: «телефон 5 млн».',
    ru: 'Не понял название и сумму цели. Например: «телефон 5 млн».',
  },
  goalSaved: { uz_latn: "💰 {name}: +{amount} qo'yildi", uz_cyrl: '💰 {name}: +{amount} қўйилди', ru: '💰 {name}: отложено +{amount}' },
  goalWithdrawn: { uz_latn: '💸 {name}: {amount} olindi', uz_cyrl: '💸 {name}: {amount} олинди', ru: '💸 {name}: снято {amount}' },
  goalDone: { uz_latn: '🎉 Tabriklaymiz! «{name}» maqsadiga yetdingiz!', uz_cyrl: '🎉 Табриклаймиз! «{name}» мақсадига етдингиз!', ru: '🎉 Поздравляем! Цель «{name}» достигнута!' },
  goalPerMonth: { uz_latn: 'oyiga {amount} kerak', uz_cyrl: 'ойига {amount} керак', ru: 'нужно {amount} в месяц' },
  goalTooMuch: { uz_latn: "Maqsadda buncha pul yo'q.", uz_cyrl: 'Мақсадда бунча пул йўқ.', ru: 'В цели нет столько денег.' },
  goalAddMoney: { uz_latn: "💰 {name}", uz_cyrl: '💰 {name}', ru: '💰 {name}' },

  // ─── Insights ───
  insightAvg: { uz_latn: '📅 Kuniga ~{amount}', uz_cyrl: '📅 Кунига ~{amount}', ru: '📅 В день ~{amount}' },
  insightForecast: { uz_latn: 'oy oxiriga ~{amount}', uz_cyrl: 'ой охирига ~{amount}', ru: 'к концу месяца ~{amount}' },
  insightChange: { uz_latn: "o'tgan oyga nisbatan {pct}", uz_cyrl: 'ўтган ойга нисбатан {pct}', ru: '{pct} к прошлому месяцу' },

  // ─── Proactive (TZ §32-33: short, never shaming) ───
  dailyReminder: {
    uz_latn: "Bugun hali yozuv yo'q. Xarajat bo'lgan bo'lsa, bitta xabar bilan yozing: «taksi 25 ming».",
    uz_cyrl: 'Бугун ҳали ёзув йўқ. Харажат бўлган бўлса, битта хабар билан ёзинг: «такси 25 минг».',
    ru: 'Сегодня записей пока нет. Если были расходы, напишите одним сообщением: «такси 25 тысяч».',
  },
  noSpendButton: { uz_latn: "Bugun xarajat yo'q", uz_cyrl: 'Бугун харажат йўқ', ru: 'Сегодня расходов нет' },
  noSpendDone: { uz_latn: '✅ Belgilandi. Ertaga ko‘rishamiz!', uz_cyrl: '✅ Белгиланди. Эртага кўришамиз!', ru: '✅ Отмечено. До завтра!' },
  reactivation3: {
    uz_latn: "Salom! Bir necha kundan beri yozuv yo'q. Qachon qulay bo'lsa, «non 5 ming» kabi yozing — qolganini o'zim hisoblayman.",
    uz_cyrl: 'Салом! Бир неча кундан бери ёзув йўқ. Қачон қулай бўлса, «нон 5 минг» каби ёзинг — қолганини ўзим ҳисоблайман.',
    ru: 'Привет! Несколько дней не было записей. Когда будет удобно, напишите что-нибудь вроде «хлеб 5к» — остальное посчитаю сам.',
  },
  reactivation7: {
    uz_latn: "Hamyon AI shu yerda 🙂 Xohlagan paytda «taksi 25 ming» deb yozing — davom etamiz.",
    uz_cyrl: 'Hamyon AI шу ерда 🙂 Хоҳлаган пайтда «такси 25 минг» деб ёзинг — давом этамиз.',
    ru: 'Hamyon AI на месте 🙂 Напишите «такси 25к» в любой момент — продолжим.',
  },
  weeklyTitle: { uz_latn: '📊 Haftalik hisobot', uz_cyrl: '📊 Ҳафталик ҳисобот', ru: '📊 Отчёт за неделю' },
  monthlyTitle: { uz_latn: '📊 Oylik hisobot', uz_cyrl: '📊 Ойлик ҳисобот', ru: '📊 Отчёт за месяц' },
  compareUpWeek: {
    uz_latn: "💡 {category} xarajati o'tgan haftaga nisbatan {pct}% yuqori.",
    uz_cyrl: '💡 {category} харажати ўтган ҳафтага нисбатан {pct}% юқори.',
    ru: '💡 Расходы на «{category}» на {pct}% выше, чем на прошлой неделе.',
  },
  compareDownWeek: {
    uz_latn: "💡 {category} xarajati o'tgan haftaga nisbatan {pct}% past.",
    uz_cyrl: '💡 {category} харажати ўтган ҳафтага нисбатан {pct}% паст.',
    ru: '💡 Расходы на «{category}» на {pct}% ниже, чем на прошлой неделе.',
  },
  compareUpMonth: {
    uz_latn: "💡 {category} xarajati o'tgan oyga nisbatan {pct}% yuqori.",
    uz_cyrl: '💡 {category} харажати ўтган ойга нисбатан {pct}% юқори.',
    ru: '💡 Расходы на «{category}» на {pct}% выше, чем в прошлом месяце.',
  },
  compareDownMonth: {
    uz_latn: "💡 {category} xarajati o'tgan oyga nisbatan {pct}% past.",
    uz_cyrl: '💡 {category} харажати ўтган ойга нисбатан {pct}% паст.',
    ru: '💡 Расходы на «{category}» на {pct}% ниже, чем в прошлом месяце.',
  },

  // ─── Settings, export, account deletion (TZ §31, §40) ───
  settingsTitle: { uz_latn: '⚙️ Sozlamalar', uz_cyrl: '⚙️ Созламалар', ru: '⚙️ Настройки' },
  settingsLanguage: { uz_latn: 'Til', uz_cyrl: 'Тил', ru: 'Язык' },
  settingsReminder: { uz_latn: 'Kunlik eslatma', uz_cyrl: 'Кунлик эслатма', ru: 'Ежедневное напоминание' },
  settingsCurrency: { uz_latn: 'Valyuta', uz_cyrl: 'Валюта', ru: 'Валюта' },
  off: { uz_latn: "o'chiq", uz_cyrl: 'ўчиқ', ru: 'выкл.' },
  btnLanguage: { uz_latn: '🌐 Til', uz_cyrl: '🌐 Тил', ru: '🌐 Язык' },
  btnReminder: { uz_latn: '⏰ Eslatma', uz_cyrl: '⏰ Эслатма', ru: '⏰ Напоминание' },
  btnExport: { uz_latn: '📤 Eksport', uz_cyrl: '📤 Экспорт', ru: '📤 Экспорт' },
  btnDeleteAccount: { uz_latn: "🗑 Akkauntni o'chirish", uz_cyrl: '🗑 Аккаунтни ўчириш', ru: '🗑 Удалить аккаунт' },
  settingsSaved: { uz_latn: '✅ Saqlandi.', uz_cyrl: '✅ Сақланди.', ru: '✅ Сохранено.' },
  exportPickRange: { uz_latn: 'Qaysi davr uchun?', uz_cyrl: 'Қайси давр учун?', ru: 'За какой период?' },
  exportPickFormat: { uz_latn: 'Qaysi formatda?', uz_cyrl: 'Қайси форматда?', ru: 'В каком формате?' },
  rangeThisMonth: { uz_latn: 'Bu oy', uz_cyrl: 'Бу ой', ru: 'Этот месяц' },
  rangePrevMonth: { uz_latn: "O'tgan oy", uz_cyrl: 'Ўтган ой', ru: 'Прошлый месяц' },
  rangeAll: { uz_latn: 'Hammasi', uz_cyrl: 'Ҳаммаси', ru: 'Всё время' },
  exportEmpty: { uz_latn: "Bu davrda yozuv yo'q.", uz_cyrl: 'Бу даврда ёзув йўқ.', ru: 'За этот период записей нет.' },
  exportCaption: { uz_latn: 'Hamyon AI eksport: {count} ta yozuv', uz_cyrl: 'Hamyon AI экспорт: {count} та ёзув', ru: 'Экспорт Hamyon AI: записей — {count}' },
  deleteConfirm: {
    uz_latn: "Akkauntni o'chirasizmi? Barcha yozuvlar, qarzlar va sozlamalar {days} kundan keyin butunlay o'chiriladi. Bu muddat ichida bekor qilish mumkin.\n\nAvval /eksport bilan nusxa olishingiz mumkin.",
    uz_cyrl: 'Аккаунтни ўчирасизми? Барча ёзувлар, қарзлар ва созламалар {days} кундан кейин бутунлай ўчирилади. Бу муддат ичида бекор қилиш мумкин.\n\nАввал /eksport билан нусха олишингиз мумкин.',
    ru: 'Удалить аккаунт? Все записи, долги и настройки будут удалены безвозвратно через {days} дн. До этого удаление можно отменить.\n\nСначала можно сохранить копию через /eksport.',
  },
  deleteYes: { uz_latn: "Ha, o'chirish", uz_cyrl: 'Ҳа, ўчириш', ru: 'Да, удалить' },
  deleteNo: { uz_latn: "Yo'q", uz_cyrl: 'Йўқ', ru: 'Нет' },
  deleteScheduled: {
    uz_latn: "Akkaunt {date} kuni butunlay o'chiriladi. Web paneldan chiqarildingiz.",
    uz_cyrl: 'Аккаунт {date} куни бутунлай ўчирилади. Веб панелдан чиқарилдингиз.',
    ru: 'Аккаунт будет удалён безвозвратно {date}. Вы вышли из веб-панели.',
  },
  deletePending: {
    uz_latn: "Akkauntingiz {date} kuni o'chirilishi rejalashtirilgan. Davom etish uchun o'chirishni bekor qiling.",
    uz_cyrl: 'Аккаунтингиз {date} куни ўчирилиши режалаштирилган. Давом этиш учун ўчиришни бекор қилинг.',
    ru: 'Удаление аккаунта запланировано на {date}. Чтобы продолжить, отмените удаление.',
  },
  deleteCancel: { uz_latn: 'Bekor qilish', uz_cyrl: 'Бекор қилиш', ru: 'Отменить удаление' },
  deleteCancelled: { uz_latn: '✅ Akkaunt saqlab qolindi.', uz_cyrl: '✅ Аккаунт сақлаб қолинди.', ru: '✅ Аккаунт сохранён.' },
  deleteAborted: { uz_latn: 'Bekor qilindi.', uz_cyrl: 'Бекор қилинди.', ru: 'Отменено.' },

  // ─── Voice ───
  voiceUnavailable: {
    uz_latn: 'Ovozli xabarlar hozircha ishlamayapti. Matn bilan yozing, masalan: «taksi 25 ming».',
    uz_cyrl: 'Овозли хабарлар ҳозирча ишламаяпти. Матн билан ёзинг, масалан: «такси 25 минг».',
    ru: 'Голосовые сообщения пока недоступны. Напишите текстом, например: «такси 25 тысяч».',
  },
  voiceReceived: { uz_latn: '🎙 Qabul qilindi, eshityapman…', uz_cyrl: '🎙 Қабул қилинди, эшитяпман…', ru: '🎙 Принято, слушаю…' },
  voiceTooLong: {
    uz_latn: "Ovozli xabar {max} soniyadan uzun. Qisqaroq ayting yoki matn bilan yozing.",
    uz_cyrl: 'Овозли хабар {max} сониядан узун. Қисқароқ айтинг ёки матн билан ёзинг.',
    ru: 'Голосовое длиннее {max} секунд. Скажите короче или напишите текстом.',
  },
  voiceLimitReached: {
    uz_latn: "Bu oy uchun ovozli xabarlar limiti ({limit} ta) tugadi. Matn bilan yozishda davom eting — u cheklanmagan. Cheklovsiz ovoz Pro tarifda bo'ladi.",
    uz_cyrl: 'Бу ой учун овозли хабарлар лимити ({limit} та) тугади. Матн билан ёзишда давом этинг — у чекланмаган. Чекловсиз овоз Pro тарифда бўлади.',
    ru: 'Лимит голосовых сообщений на этот месяц ({limit}) исчерпан. Пишите текстом — он не ограничен. Безлимитный голос будет в тарифе Pro.',
  },
  voiceFailed: {
    uz_latn: "Ovozni hozir qayta ishlab bo'lmadi. Birozdan so'ng qayta yuboring yoki matn bilan yozing.",
    uz_cyrl: 'Овозни ҳозир қайта ишлаб бўлмади. Бироздан сўнг қайта юборинг ёки матн билан ёзинг.',
    ru: 'Не удалось обработать голос. Отправьте ещё раз чуть позже или напишите текстом.',
  },
  voiceNotUnderstood: {
    uz_latn: 'Ovozni aniq tushuna olmadim. Qaytadan ayting yoki matn bilan yozing.',
    uz_cyrl: 'Овозни аниқ тушуна олмадим. Қайтадан айтинг ёки матн билан ёзинг.',
    ru: 'Не удалось разобрать голос. Повторите или напишите текстом.',
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

/** Message with `{param}` placeholders filled in. Params are HTML-escaped: bot messages are sent with parse_mode HTML. */
export function tf(lang: Language, key: MessageKey, params: Record<string, string>): string {
  return t(lang, key).replace(/\{(\w+)\}/g, (_, k: string) => esc(params[k] ?? ''));
}

export function languageFromAcceptHeader(header: string | undefined): Language {
  return header?.toLowerCase().startsWith('ru') ? 'ru' : 'uz_latn';
}
