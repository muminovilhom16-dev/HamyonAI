import { foldWord } from './normalize';

/**
 * Deterministic keyword dictionaries (folded Latin form, apostrophes removed).
 * Matching is by exact token or by prefix for stems of 4+ letters, so
 * "bozordan", "taksiga", "kompyuterga" match "bozor", "taksi", "kompyuter".
 * Russian entries are written in Cyrillic and folded like user input.
 */
const f = (words: string[]) => words.map((w) => w.split(' ').map(foldWord).join(' '));

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: f([
    'bozor', 'korzinka', 'karzinka', 'korzina', 'makro', 'havas', 'magnum', 'baraka', 'supermarket', 'oziq', 'produkt',
    'non', 'sut', "go'sht", 'gosht', 'guruch', 'tuxum', 'kartoshka', 'piyoz', 'sabzi', 'sabzavot', 'meva', 'olma', 'banan',
    'shakar', 'qatiq', 'pishloq', 'kolbasa', 'tovuq', 'baliq', 'yog', 'un', 'makaron', 'pomidor', 'bodring', 'qaymoq', 'smetana',
    'kefir', 'tvorog', 'choy', 'shirinlik', 'tort', 'qand', 'tuz', 'kartoshka',
    'рынок', 'базар', 'продукты', 'продукт', 'хлеб', 'молоко', 'мясо', 'яйца', 'картошка', 'овощи', 'фрукты', 'сахар', 'курица',
    'рыба', 'масло', 'сыр', 'колбаса', 'супермаркет', 'макро', 'корзинка',
  ]),
  cafe: f([
    'kafe', 'cafe', 'restoran', 'restaurant', 'tushlik', 'nonushta', 'choyxona', 'kofe', 'coffee', 'evos', 'lavash', 'burger',
    'pitsa', 'pizza', 'shashlik', 'somsa', 'kfc', 'fastfood', 'wolt', 'oqtepa', 'max way', 'maxway', 'bellissimo', 'les ailes',
    'кафе', 'ресторан', 'обед', 'ужин', 'завтрак', 'кофе', 'шашлык', 'самса', 'пицца', 'бургер', 'лаваш', 'столовая',
  ]),
  transport: f([
    'taksi', 'taxi', 'yandex', 'mytaxi', 'uklon', 'metro', 'avtobus', 'marshrutka', 'benzin', 'propan', 'metan', 'zapravka',
    'parkovka', 'poyezd', 'poezd', 'afrosiyob', 'aviabilet', 'samolyot', 'yol kira', 'transport', 'moyka', 'shina',
    'такси', 'метро', 'автобус', 'маршрутка', 'бензин', 'пропан', 'метан', 'заправка', 'парковка', 'поезд', 'авиабилет',
    'транспорт', 'мойка', 'яндекс',
  ]),
  utilities: f([
    'gaz', 'svet', 'elektr', 'suv', 'kommunal', 'kommunalka', 'issiqlik', 'otopleniye', 'chiqindi', 'musor',
    'газ', 'свет', 'электричество', 'вода', 'коммуналка', 'коммунальные', 'отопление', 'мусор',
  ]),
  housing: f(['ijara', 'kvartira', 'arenda', 'uy ijarasi', 'mebel', 'аренда', 'квартира', 'квартплата', 'мебель']),
  telecom: f([
    'internet', 'inet', 'ucell', 'beeline', 'uzmobile', 'mobiuz', 'humans', 'uztelecom', 'paynet', 'aloqa', 'tarif', 'svyaz',
    'интернет', 'связь', 'тариф', 'пейнет',
  ]),
  tech_services: f([
    'windows', 'vindovs', 'kompyuter', 'kompyuterga', 'noutbuk', 'notebook', 'laptop', "ta'mir", 'tamir', 'remont', 'ustanovka',
    "o'rnatish", 'ornatish', 'dastur', 'programma', 'printer', 'usta', 'master', 'texnika', 'ekran', 'zaryadka', 'naushnik',
    'виндовс', 'компьютер', 'ноутбук', 'ремонт', 'установка', 'программа', 'принтер', 'мастер', 'техника', 'зарядка', 'наушники',
  ]),
  health: f([
    'dori', 'dorixona', 'apteka', 'shifokor', 'vrach', 'klinika', 'stomatolog', 'tish', 'analiz', 'kasalxona', 'bolnitsa',
    'massaj', 'аптека', 'лекарство', 'лекарства', 'врач', 'клиника', 'стоматолог', 'анализ', 'больница', 'таблетки',
  ]),
  clothing: f([
    'kiyim', 'kurtka', "ko'ylak", 'koylak', 'shim', 'krossovka', 'poyabzal', 'futbolka', 'palto', 'jinsi', 'oyoq kiyim', 'tufli',
    'одежда', 'куртка', 'обувь', 'кроссовки', 'рубашка', 'футболка', 'джинсы', 'пальто', 'брюки', 'платье',
  ]),
  education: f([
    'kurs', 'kitob', "o'qish", 'kontrakt', 'maktab', 'universitet', 'repetitor', 'ingliz', "ta'lim", 'talim', 'darslik',
    'курсы', 'книга', 'книги', 'учеба', 'контракт', 'школа', 'университет', 'репетитор', 'обучение',
  ]),
  kids: f([
    'bolalar', 'bolaga', "bog'cha", 'bogcha', 'pampers', "o'yinchoq", 'oyinchoq', 'sadik', 'detskiy',
    'детский', 'памперс', 'игрушки', 'игрушка', 'садик', 'подгузники',
  ]),
  celebrations: f([
    "to'y", "to'yga", "to'yi", "tug'ilgan kun", 'sovga', "sovg'a", 'marosim', 'nikoh', 'gul', 'gullar', 'svadba',
    'свадьба', 'подарок', 'цветы', 'день рождения',
  ]),
  loans: f(['kredit', 'nasiya', 'rassrochka', 'ipoteka', 'muddatli', 'кредит', 'рассрочка', 'ипотека', 'насия']),
  entertainment: f([
    'kino', 'teatr', 'konsert', 'playstation', 'netflix', 'spotify', 'bouling', 'kinoteatr', "ko'ngilochar", 'dam olish',
    'кино', 'театр', 'концерт', 'боулинг', 'развлечения',
  ]),
  salary: f(['oylik', 'oylig', 'maosh', 'zarplata', 'zarplat', 'avans', 'зарплата', 'зарплату', 'аванс', 'оклад']),
  other_income: f(['bonus', 'premiya', 'daromad', 'foyda', 'cashback', 'keshbek', 'премия', 'бонус', 'доход', 'кэшбэк']),
};

export const INCOME_SLUGS = new Set(['salary', 'other_income']);

/** Strong income signals: money arrived ("tushdi", "keldi", "получил"). */
export const INCOME_STRONG_WORDS = f(['tushdi', 'keldi', 'tushgan', 'kelgan', 'получил', 'получила', 'пришла', 'пришло', 'пришли', 'поступила', 'поступило']);

/** Words that mark income when present ("oylik tushdi", "pul keldi"). */
export const INCOME_WORDS = f(['tushdi', 'keldi', 'oldim oylik', 'daromad', 'maosh', 'oylik', 'zarplata', 'avans', 'premiya', 'bonus',
  'keshbek', 'cashback', 'получил', 'пришла', 'пришло', 'пришли', 'зарплата', 'зарплату', 'доход', 'премия', 'аванс', 'кэшбэк']);

export const DEBT_WORDS = f(['qarz', 'qarzga', 'qarzim', 'qarzni', 'qarzdan', 'долг', 'долга', 'долгу', 'взаймы', 'одолжил', 'одолжила', 'занял', 'заняла']);
export const DEBT_GIVE_WORDS = f(['berdim', 'berib', 'berdik', 'дал', 'дала', 'одолжил', 'одолжила']);
export const DEBT_TAKE_WORDS = f(['oldim', 'olib', 'oldik', 'взял', 'взяла', 'занял', 'заняла']);
/** They returned to me. */
export const RETURN_TO_ME_WORDS = f(['qaytardi', 'qaytarib berdi', 'вернул', 'вернула', 'вернули']);
/** I returned to them. */
export const RETURN_BY_ME_WORDS = f(['qaytardim', 'qaytarib berdim', 'qaytardik', 'вернул ему', 'отдал долг']);

/** Returned, direction not stated ("qarz qaytarildi", "возврат долга"). */
export const RETURN_ANY_WORDS = f(['qaytarildi', 'qaytarishdi', 'возврат', 'вернулся']);

/** Honorifics/relations that mark a person: "Murod akaga", "opamga". */
export const PERSON_STEMS = f(['aka', 'opa', 'uka', 'singil', 'singlim', 'ota', 'ona', 'dada', 'oyi', 'buvi', 'bobo', 'xola', 'amaki', "tog'a", 'brat', 'sestra']);

export const DATE_WORDS: Record<string, number> = Object.fromEntries(
  Object.entries({ bugun: 0, bugungi: 0, сегодня: 0, kecha: -1, kechagi: -1, вчера: -1, позавчера: -2 }).map(([k, v]) => [foldWord(k), v]),
);
/** Multi-word: "o'tgan kuni" = day before yesterday. */
export const DATE_PHRASES: Array<[string[], number]> = [[f(["o'tgan", 'kuni']), -2]];

/** Filler words dropped from the note and from learned patterns. */
export const STOP_WORDS = new Set(
  f([
    'oldim', 'olib', 'berdim', 'uchun', 'va', 'bilan', "to'ladim", 'toladim', 'tolov', "to'lov", 'xarid', 'sotib', 'qildim',
    'ketdi', 'sarfladim', 'pul', 'puli', 'pulga', 'ga', 'da', 'dan', 'ham', 'edi', 'dedi', 'tushdi', 'keldi',
    'за', 'на', 'и', 'в', 'купил', 'купила', 'оплатил', 'оплатила', 'заплатил', 'заплатила', 'потратил', 'потратила',
  ]),
);
