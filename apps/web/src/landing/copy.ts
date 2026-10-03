import type { Lang } from '../api';

/** Landing copy. Only real, shipped capabilities — no invented stats (TZ §34: prices are hypotheses). */
export interface Copy {
  nav: { features: string; how: string; pricing: string; faq: string; login: string; signup: string; cabinet: string };
  hero: { kicker: string; title: string; text: string; primary: string; secondary: string };
  steps: Array<{ n: string; title: string; text: string }>;
  badge: string;
  stat: { value: string; label: string };
  chat: { you: string[]; bot: Array<{ amount: string; category: string; note: string }>; reply: string; buttons: string[] };
  how: { title: string; text: string; items: Array<{ title: string; text: string; example: string }> };
  features: { title: string; items: Array<{ icon: string; title: string; text: string }> };
  pricing: {
    title: string;
    text: string;
    free: { name: string; price: string; items: string[]; cta: string };
    pro: { name: string; price: string; items: string[]; note: string };
  };
  faq: { title: string; items: Array<{ q: string; a: string }> };
  cta: { title: string; text: string; button: string };
  footer: { tagline: string; contact: string };
  auth: {
    loginTitle: string;
    signupTitle: string;
    loginText: string;
    signupText: string;
    widgetHint: string;
    or: string;
    botLogin: string;
    botSignup: string;
    botLoginSteps: string[];
    botSignupSteps: string[];
    openBot: string;
    haveAccount: string;
    noAccount: string;
    back: string;
    failed: string;
    noPhone: string;
  };
}

const uz_latn: Copy = {
  nav: { features: 'Imkoniyatlar', how: 'Qanday ishlaydi', pricing: 'Narxlar', faq: 'Savollar', login: 'Kirish', signup: "Ro'yxatdan o'tish", cabinet: 'Kabinet' },
  hero: {
    kicker: "Telegramdagi o'zbekcha aqlli hamyon",
    title: 'Pulingiz qayerga ketayotganini aniq biling',
    text: 'Odatdagidek yozing yoki forward qiling — Hamyon AI qolganini avtomatik hisobga oladi. Jadval yo‘q, formalar yo‘q: bitta xabar yetarli.',
    primary: 'Telegramda boshlash',
    secondary: 'Qanday ishlaydi',
  },
  steps: [
    { n: '01', title: 'Bitta xabar', text: '«taksi 25 ming» — summa, kategoriya va sana o‘zi aniqlanadi' },
    { n: '02', title: 'Limit nazorati', text: 'Kategoriya limitiga yaqinlashsangiz, bot darhol ogohlantiradi' },
  ],
  badge: "TELEGRAMDAGI O'ZBEKCHA AQLLI HAMYON • ",
  stat: { value: '3 soniya', label: 'bitta yozuvga ketadigan vaqt' },
  chat: {
    you: ['taksi 25 ming', 'non 5 ming, sut 12 ming'],
    bot: [
      { amount: "25 000 so'm", category: 'Transport', note: 'Taksi · Bugun' },
      { amount: "12 000 so'm", category: 'Oziq-ovqat', note: 'Sut · Bugun' },
    ],
    reply: "Murod aka 100 ming qaytardi",
    buttons: ['Transport', '25 000', 'Bugun', "🗑 O'chirish"],
  },
  how: {
    title: 'Qanday ishlaydi',
    text: 'Hamyon AI odatdagidek yozganingizni tushunadi: lotin, kirill, rus tili, xatolar va qisqartmalar bilan.',
    items: [
      { title: 'Yozing', text: 'Xarajat, daromad yoki qarzni oddiy so‘z bilan yuboring.', example: '«bozordan go‘sht oldim yuz ellik ming»' },
      { title: 'Kartochkani tekshiring', text: 'Summa, kategoriya va sana ko‘rsatiladi. Noto‘g‘ri bo‘lsa — bir bosishda tuzating.', example: '150 000 so‘m · Oziq-ovqat · Bugun' },
      { title: 'Natijani ko‘ring', text: '/bugun, /hafta, /oy hisobotlari va web paneldagi grafiklar.', example: '📊 Xarajat: 185 000 so‘m' },
    ],
  },
  features: {
    title: 'Imkoniyatlar',
    items: [
      { icon: '💬', title: 'Oddiy matn', text: '«20k», «2kk», «1,5 mln», «yigirma besh ming», «50$» — hammasi tushuniladi.' },
      { icon: '🏷', title: 'Aqlli kategoriyalar', text: 'Bir marta tuzatsangiz, keyingi safar o‘zi to‘g‘ri qo‘yadi.' },
      { icon: '🤝', title: 'Qarzlar', text: 'Kimga qancha berganingiz, qaytgan qismi va qoldig‘i. Muddatdan oldin eslatma.' },
      { icon: '📊', title: 'Hisobotlar', text: 'Qisqa kunlik, haftalik va oylik hisobotlar — 3–5 qatorda.' },
      { icon: '🖥', title: 'Web panel', text: 'Grafiklar, filtrlar va tahrirlash — telefonda ham, kompyuterda ham.' },
      { icon: '🔒', title: 'Xavfsizlik', text: 'Karta raqami saqlanmaydi, telefon va email so‘ralmaydi. Bank parolini hech qachon so‘ramaymiz.' },
    ],
  },
  pricing: {
    title: 'Narxlar',
    text: 'Matn bilan yozish har doim cheklovsiz va bepul.',
    free: {
      name: 'Bepul',
      price: "0 so'm",
      items: ['Cheklovsiz matnli yozuvlar', 'Byudjet, maqsadlar va obunalar', 'Qarzlar va eslatmalar', 'Hisobotlar va web panel'],
      cta: 'Boshlash',
    },
    pro: {
      name: 'Pro',
      price: 'Tez orada',
      items: ['Ovozli xabarlar', 'Chek suratini o‘qish', 'Bank xabarlarini import qilish', 'Oilaviy hamyon'],
      note: 'Narx hali belgilanmagan',
    },
  },
  faq: {
    title: 'Ko‘p beriladigan savollar',
    items: [
      { q: 'Telefon raqami yoki email kerakmi?', a: 'Yo‘q. Telegram akkauntingiz yetarli.' },
      { q: 'Bank kartamni ulashim kerakmi?', a: 'Yo‘q. Xarajatlarni o‘zingiz yozasiz. Karta raqami, CVV yoki SMS kod hech qachon so‘ralmaydi va saqlanmaydi.' },
      { q: 'Qaysi tillarda ishlaydi?', a: 'O‘zbek (lotin va kirill) va rus tillarida, aralash yozilsa ham.' },
      { q: 'Noto‘g‘ri tushunsa nima bo‘ladi?', a: 'Har bir yozuv kartochkada ko‘rsatiladi — bir bosishda tuzatasiz yoki o‘chirasiz (10 soniya ichida qaytarish mumkin). Summa noaniq bo‘lsa, bot so‘raydi va taxmin qilmaydi.' },
      { q: 'Ma’lumotlarimni o‘chira olamanmi?', a: 'Ha. Ma’lumotlarni eksport qilish va akkauntni o‘chirish imkoniyati beriladi.' },
    ],
  },
  cta: { title: 'Birinchi xarajatingizni hoziroq yozing', text: 'Botni oching, tilni tanlang va «taksi 25 ming» deb yozing — 60 soniyada tayyor.', button: 'Telegramda boshlash' },
  footer: { tagline: "Telegramdagi o'zbekcha aqlli hamyon.", contact: 'Aloqa: Telegram bot' },
  auth: {
    loginTitle: 'Kirish',
    signupTitle: "Ro'yxatdan o'tish",
    loginText: 'Telegram akkauntingiz orqali kiring — parol kerak emas.',
    signupText: 'Hisob Telegram orqali ochiladi. Telefon raqami va email so‘ralmaydi.',
    widgetHint: 'Tugma ko‘rinmasa, quyidagi usuldan foydalaning.',
    or: 'yoki',
    botLogin: 'Bot orqali kirish',
    botSignup: "Bot orqali ro'yxatdan o'tish",
    botLoginSteps: ['Botni oching', '/web deb yozing', 'Kelgan havolani bosing (15 daqiqa amal qiladi)'],
    botSignupSteps: ['Botni oching va /start bosing', 'Tilni va valyutani tanlang', 'Birinchi xarajatni yozing, masalan «taksi 25 ming»'],
    openBot: 'Telegram botni ochish',
    haveAccount: 'Hisobingiz bormi? Kirish',
    noAccount: "Hisobingiz yo'qmi? Ro'yxatdan o'tish",
    back: '← Bosh sahifa',
    failed: 'Kirish amalga oshmadi. Qaytadan urinib ko‘ring yoki bot orqali kiring.',
    noPhone: 'Telefon va email talab qilinmaydi',
  },
};

const uz_cyrl: Copy = {
  nav: { features: 'Имкониятлар', how: 'Қандай ишлайди', pricing: 'Нархлар', faq: 'Саволлар', login: 'Кириш', signup: 'Рўйхатдан ўтиш', cabinet: 'Кабинет' },
  hero: {
    kicker: 'Телеграмдаги ўзбекча ақлли ҳамён',
    title: 'Пулингиз қаерга кетаётганини аниқ билинг',
    text: 'Одатдагидек ёзинг ёки forward қилинг — Hamyon AI қолганини автоматик ҳисобга олади. Жадвал йўқ, формалар йўқ: битта хабар етарли.',
    primary: 'Телеграмда бошлаш',
    secondary: 'Қандай ишлайди',
  },
  steps: [
    { n: '01', title: 'Битта хабар', text: '«такси 25 минг» — сумма, категория ва сана ўзи аниқланади' },
    { n: '02', title: 'Лимит назорати', text: 'Категория лимитига яқинлашсангиз, бот дарҳол огоҳлантиради' },
  ],
  badge: 'ТЕЛЕГРАМДАГИ ЎЗБЕКЧА АҚЛЛИ ҲАМЁН • ',
  stat: { value: '3 сония', label: 'битта ёзувга кетадиган вақт' },
  chat: {
    you: ['такси 25 минг', 'нон 5 минг, сут 12 минг'],
    bot: [
      { amount: '25 000 сўм', category: 'Транспорт', note: 'Такси · Бугун' },
      { amount: '12 000 сўм', category: 'Озиқ-овқат', note: 'Сут · Бугун' },
    ],
    reply: 'Мурод ака 100 минг қайтарди',
    buttons: ['Транспорт', '25 000', 'Бугун', '🗑 Ўчириш'],
  },
  how: {
    title: 'Қандай ишлайди',
    text: 'Hamyon AI одатдагидек ёзганингизни тушунади: лотин, кирилл, рус тили, хатолар ва қисқартмалар билан.',
    items: [
      { title: 'Ёзинг', text: 'Харажат, даромад ёки қарзни оддий сўз билан юборинг.', example: '«бозордан гўшт олдим юз эллик минг»' },
      { title: 'Карточкани текширинг', text: 'Сумма, категория ва сана кўрсатилади. Нотўғри бўлса — бир босишда тузатинг.', example: '150 000 сўм · Озиқ-овқат · Бугун' },
      { title: 'Натижани кўринг', text: '/bugun, /hafta, /oy ҳисоботлари ва веб панелдаги графиклар.', example: '📊 Харажат: 185 000 сўм' },
    ],
  },
  features: {
    title: 'Имкониятлар',
    items: [
      { icon: '💬', title: 'Оддий матн', text: '«20k», «2kk», «1,5 млн», «йигирма беш минг», «50$» — ҳаммаси тушунилади.' },
      { icon: '🏷', title: 'Ақлли категориялар', text: 'Бир марта тузатсангиз, кейинги сафар ўзи тўғри қўяди.' },
      { icon: '🤝', title: 'Қарзлар', text: 'Кимга қанча берганингиз, қайтган қисми ва қолдиғи. Муддатдан олдин эслатма.' },
      { icon: '📊', title: 'Ҳисоботлар', text: 'Қисқа кунлик, ҳафталик ва ойлик ҳисоботлар — 3–5 қаторда.' },
      { icon: '🖥', title: 'Веб панел', text: 'Графиклар, фильтрлар ва таҳрирлаш — телефонда ҳам, компьютерда ҳам.' },
      { icon: '🔒', title: 'Хавфсизлик', text: 'Карта рақами сақланмайди, телефон ва email сўралмайди. Банк паролини ҳеч қачон сўрамаймиз.' },
    ],
  },
  pricing: {
    title: 'Нархлар',
    text: 'Матн билан ёзиш ҳар доим чекловсиз ва бепул.',
    free: {
      name: 'Бепул',
      price: '0 сўм',
      items: ['Чекловсиз матнли ёзувлар', 'Бюджет, мақсадлар ва обуналар', 'Қарзлар ва эслатмалар', 'Ҳисоботлар ва веб панел'],
      cta: 'Бошлаш',
    },
    pro: {
      name: 'Pro',
      price: 'Тез орада',
      items: ['Овозли хабарлар', 'Чек суратини ўқиш', 'Банк хабарларини импорт қилиш', 'Оилавий ҳамён'],
      note: 'Нарх ҳали белгиланмаган',
    },
  },
  faq: {
    title: 'Кўп бериладиган саволлар',
    items: [
      { q: 'Телефон рақами ёки email керакми?', a: 'Йўқ. Телеграм аккаунтингиз етарли.' },
      { q: 'Банк картамни улашим керакми?', a: 'Йўқ. Харажатларни ўзингиз ёзасиз. Карта рақами, CVV ёки SMS код ҳеч қачон сўралмайди ва сақланмайди.' },
      { q: 'Қайси тилларда ишлайди?', a: 'Ўзбек (лотин ва кирилл) ва рус тилларида, аралаш ёзилса ҳам.' },
      { q: 'Нотўғри тушунса нима бўлади?', a: 'Ҳар бир ёзув карточкада кўрсатилади — бир босишда тузатасиз ёки ўчирасиз (10 сония ичида қайтариш мумкин). Сумма ноаниқ бўлса, бот сўрайди ва тахмин қилмайди.' },
      { q: 'Маълумотларимни ўчира оламанми?', a: 'Ҳа. Маълумотларни экспорт қилиш ва аккаунтни ўчириш имконияти берилади.' },
    ],
  },
  cta: { title: 'Биринчи харажатингизни ҳозироқ ёзинг', text: 'Ботни очинг, тилни танланг ва «такси 25 минг» деб ёзинг — 60 сонияда тайёр.', button: 'Телеграмда бошлаш' },
  footer: { tagline: 'Телеграмдаги ўзбекча ақлли ҳамён.', contact: 'Алоқа: Телеграм бот' },
  auth: {
    loginTitle: 'Кириш',
    signupTitle: 'Рўйхатдан ўтиш',
    loginText: 'Телеграм аккаунтингиз орқали киринг — парол керак эмас.',
    signupText: 'Ҳисоб Телеграм орқали очилади. Телефон рақами ва email сўралмайди.',
    widgetHint: 'Тугма кўринмаса, қуйидаги усулдан фойдаланинг.',
    or: 'ёки',
    botLogin: 'Бот орқали кириш',
    botSignup: 'Бот орқали рўйхатдан ўтиш',
    botLoginSteps: ['Ботни очинг', '/web деб ёзинг', 'Келган ҳаволани босинг (15 дақиқа амал қилади)'],
    botSignupSteps: ['Ботни очинг ва /start босинг', 'Тилни ва валютани танланг', 'Биринчи харажатни ёзинг, масалан «такси 25 минг»'],
    openBot: 'Телеграм ботни очиш',
    haveAccount: 'Ҳисобингиз борми? Кириш',
    noAccount: 'Ҳисобингиз йўқми? Рўйхатдан ўтиш',
    back: '← Бош саҳифа',
    failed: 'Кириш амалга ошмади. Қайтадан уриниб кўринг ёки бот орқали киринг.',
    noPhone: 'Телефон ва email талаб қилинмайди',
  },
};

const ru: Copy = {
  nav: { features: 'Возможности', how: 'Как это работает', pricing: 'Цены', faq: 'Вопросы', login: 'Войти', signup: 'Регистрация', cabinet: 'Кабинет' },
  hero: {
    kicker: 'Умный кошелёк на узбекском — в Telegram',
    title: 'Знайте точно, куда уходят ваши деньги',
    text: 'Пишите как обычно или пересылайте — Hamyon AI учтёт всё сам. Никаких таблиц и форм: достаточно одного сообщения.',
    primary: 'Начать в Telegram',
    secondary: 'Как это работает',
  },
  steps: [
    { n: '01', title: 'Одно сообщение', text: '«такси 25к» — сумма, категория и дата определяются сами' },
    { n: '02', title: 'Контроль лимитов', text: 'Бот сразу предупредит, когда расходы приблизятся к лимиту категории' },
  ],
  badge: 'УМНЫЙ КОШЕЛЁК В TELEGRAM • HAMYON AI • ',
  stat: { value: '3 секунды', label: 'на одну запись' },
  chat: {
    you: ['такси 25к', 'хлеб 5к, молоко 12к'],
    bot: [
      { amount: '25 000 сум', category: 'Транспорт', note: 'Такси · Сегодня' },
      { amount: '12 000 сум', category: 'Продукты', note: 'Молоко · Сегодня' },
    ],
    reply: 'Мурод ака вернул 100к',
    buttons: ['Транспорт', '25 000', 'Сегодня', '🗑 Удалить'],
  },
  how: {
    title: 'Как это работает',
    text: 'Hamyon AI понимает, как вы обычно пишете: латиница, кириллица, русский, опечатки и сокращения.',
    items: [
      { title: 'Напишите', text: 'Расход, доход или долг — обычными словами.', example: '«на рынке мясо сто пятьдесят тысяч»' },
      { title: 'Проверьте карточку', text: 'Сумма, категория и дата видны сразу. Ошибка — исправьте в одно касание.', example: '150 000 сум · Продукты · Сегодня' },
      { title: 'Смотрите итоги', text: 'Отчёты /bugun, /hafta, /oy и графики в веб-панели.', example: '📊 Расходы: 185 000 сум' },
    ],
  },
  features: {
    title: 'Возможности',
    items: [
      { icon: '💬', title: 'Обычный текст', text: '«20к», «2кк», «1,5 млн», «двадцать пять тысяч», «50$» — понимается всё.' },
      { icon: '🏷', title: 'Умные категории', text: 'Исправили один раз — в следующий раз будет правильно.' },
      { icon: '🤝', title: 'Долги', text: 'Кому сколько дали, что вернули и сколько осталось. Напоминание до срока.' },
      { icon: '📊', title: 'Отчёты', text: 'Короткие отчёты за день, неделю и месяц — в 3–5 строк.' },
      { icon: '🖥', title: 'Веб-панель', text: 'Графики, фильтры и редактирование — на телефоне и компьютере.' },
      { icon: '🔒', title: 'Безопасность', text: 'Номер карты не хранится, телефон и email не нужны. Пароль от банка мы никогда не спросим.' },
    ],
  },
  pricing: {
    title: 'Цены',
    text: 'Текстовые записи — всегда без ограничений и бесплатно.',
    free: {
      name: 'Бесплатно',
      price: '0 сум',
      items: ['Безлимитные текстовые записи', 'Бюджеты, цели и подписки', 'Долги и напоминания', 'Отчёты и веб-панель'],
      cta: 'Начать',
    },
    pro: {
      name: 'Pro',
      price: 'Скоро',
      items: ['Голосовые сообщения', 'Распознавание чеков', 'Импорт банковских уведомлений', 'Семейный кошелёк'],
      note: 'Цена ещё не определена',
    },
  },
  faq: {
    title: 'Частые вопросы',
    items: [
      { q: 'Нужен номер телефона или email?', a: 'Нет. Достаточно аккаунта Telegram.' },
      { q: 'Нужно подключать банковскую карту?', a: 'Нет. Расходы вы записываете сами. Номер карты, CVV или SMS-код никогда не запрашиваются и не хранятся.' },
      { q: 'На каких языках работает?', a: 'Узбекский (латиница и кириллица) и русский, в том числе вперемешку.' },
      { q: 'Что если бот поймёт неправильно?', a: 'Каждая запись показывается карточкой — исправить или удалить можно в одно касание (отмена в течение 10 секунд). Если сумма неясна, бот спросит, а не угадает.' },
      { q: 'Можно удалить свои данные?', a: 'Да. Будет доступен экспорт данных и удаление аккаунта.' },
    ],
  },
  cta: { title: 'Запишите первый расход прямо сейчас', text: 'Откройте бота, выберите язык и напишите «такси 25к» — готово за 60 секунд.', button: 'Начать в Telegram' },
  footer: { tagline: 'Умный кошелёк на узбекском в Telegram.', contact: 'Связь: Telegram-бот' },
  auth: {
    loginTitle: 'Вход',
    signupTitle: 'Регистрация',
    loginText: 'Войдите через Telegram — пароль не нужен.',
    signupText: 'Аккаунт создаётся через Telegram. Телефон и email не запрашиваются.',
    widgetHint: 'Если кнопка не видна, используйте способ ниже.',
    or: 'или',
    botLogin: 'Вход через бота',
    botSignup: 'Регистрация через бота',
    botLoginSteps: ['Откройте бота', 'Напишите /web', 'Нажмите на ссылку (действует 15 минут)'],
    botSignupSteps: ['Откройте бота и нажмите /start', 'Выберите язык и валюту', 'Запишите первый расход, например «такси 25к»'],
    openBot: 'Открыть Telegram-бот',
    haveAccount: 'Уже есть аккаунт? Войти',
    noAccount: 'Нет аккаунта? Регистрация',
    back: '← На главную',
    failed: 'Не удалось войти. Попробуйте ещё раз или войдите через бота.',
    noPhone: 'Телефон и email не нужны',
  },
};

export const COPY: Record<Lang, Copy> = { uz_latn, uz_cyrl, ru };
