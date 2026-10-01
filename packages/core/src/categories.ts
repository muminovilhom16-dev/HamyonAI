export type Language = 'uz_latn' | 'uz_cyrl' | 'ru';

export interface SystemCategory {
  slug: string;
  kind: 'expense' | 'income';
  icon: string;
  names: Record<Language, string>;
}

/** Default categories (TZ §9). Order here is display order. */
export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  { slug: 'food', kind: 'expense', icon: '🛒', names: { uz_latn: 'Oziq-ovqat', uz_cyrl: 'Озиқ-овқат', ru: 'Продукты' } },
  { slug: 'cafe', kind: 'expense', icon: '🍽', names: { uz_latn: 'Kafe va restoran', uz_cyrl: 'Кафе ва ресторан', ru: 'Кафе и рестораны' } },
  { slug: 'transport', kind: 'expense', icon: '🚕', names: { uz_latn: 'Transport', uz_cyrl: 'Транспорт', ru: 'Транспорт' } },
  { slug: 'utilities', kind: 'expense', icon: '💡', names: { uz_latn: 'Kommunal', uz_cyrl: 'Коммунал', ru: 'Коммунальные' } },
  { slug: 'housing', kind: 'expense', icon: '🏠', names: { uz_latn: 'Uy-joy', uz_cyrl: 'Уй-жой', ru: 'Жильё' } },
  { slug: 'telecom', kind: 'expense', icon: '📱', names: { uz_latn: 'Aloqa va internet', uz_cyrl: 'Алоқа ва интернет', ru: 'Связь и интернет' } },
  { slug: 'tech_services', kind: 'expense', icon: '🛠', names: { uz_latn: 'Texnika va xizmatlar', uz_cyrl: 'Техника ва хизматлар', ru: 'Техника и услуги' } },
  { slug: 'health', kind: 'expense', icon: '💊', names: { uz_latn: "Sog'liq", uz_cyrl: 'Соғлиқ', ru: 'Здоровье' } },
  { slug: 'clothing', kind: 'expense', icon: '👕', names: { uz_latn: 'Kiyim', uz_cyrl: 'Кийим', ru: 'Одежда' } },
  { slug: 'education', kind: 'expense', icon: '🎓', names: { uz_latn: "Ta'lim", uz_cyrl: 'Таълим', ru: 'Образование' } },
  { slug: 'kids', kind: 'expense', icon: '🧸', names: { uz_latn: 'Bolalar', uz_cyrl: 'Болалар', ru: 'Дети' } },
  { slug: 'celebrations', kind: 'expense', icon: '🎉', names: { uz_latn: "To'y va marosimlar", uz_cyrl: 'Тўй ва маросимлар', ru: 'Свадьбы и торжества' } },
  { slug: 'loans', kind: 'expense', icon: '🏦', names: { uz_latn: "Nasiya va kredit to'lovi", uz_cyrl: 'Насия ва кредит тўлови', ru: 'Рассрочка и кредит' } },
  { slug: 'entertainment', kind: 'expense', icon: '🎬', names: { uz_latn: "Ko'ngilochar", uz_cyrl: 'Кўнгилочар', ru: 'Развлечения' } },
  { slug: 'other', kind: 'expense', icon: '📦', names: { uz_latn: 'Boshqa', uz_cyrl: 'Бошқа', ru: 'Другое' } },
  // ASSUMPTION: TZ lists no income categories; minimal default pair.
  { slug: 'salary', kind: 'income', icon: '💰', names: { uz_latn: 'Oylik', uz_cyrl: 'Ойлик', ru: 'Зарплата' } },
  { slug: 'other_income', kind: 'income', icon: '➕', names: { uz_latn: 'Boshqa daromad', uz_cyrl: 'Бошқа даромад', ru: 'Другой доход' } },
];

export function categoryDisplayName(c: { slug: string | null; name: string | null }, lang: Language): string {
  if (c.name) return c.name;
  const sys = SYSTEM_CATEGORIES.find((s) => s.slug === c.slug);
  return sys ? sys.names[lang] : (c.slug ?? '');
}
