import { InlineKeyboard } from 'grammy';
import {
  addDays,
  localDate,
  type Language,
  type ParsedTransaction,
  type Account,
  type Transaction,
  type WalletCategory,
} from '@hamyon/core';
import { formatDateLabel, formatMoney, groupDigits } from '../format';
import { t } from '../i18n';
import { b, esc, i } from './html';

export interface CardEnv {
  lang: Language;
  today: string;
  yesterday: string;
  categories: WalletCategory[];
  /** Active cash/card accounts; empty when the user has none (no account UI then). */
  accounts: Array<Pick<Account, 'id' | 'name' | 'kind'>>;
}

export function cardEnv(lang: Language, timeZone: string, now: Date, categories: WalletCategory[], accounts: CardEnv['accounts'] = []): CardEnv {
  const today = localDate(now, timeZone);
  return { lang, today, yesterday: addDays(today, -1), categories, accounts };
}

const accountIcon = (kind: 'cash' | 'card') => (kind === 'cash' ? '💵' : '💳');
const accountLabel = (env: CardEnv, id: string | null) => {
  const a = id ? env.accounts.find((x) => x.id === id) : undefined;
  return a ? `${accountIcon(a.kind)} ${a.name}` : null;
};

/** Short category reference for callback data (64-byte limit). */
export const catRef = (c: WalletCategory) => (c.key === c.id ? `c${c.id.slice(0, 8)}` : c.key);

export function resolveCatRef(categories: WalletCategory[], ref: string): WalletCategory | null {
  return (
    categories.find((c) => c.key !== c.id && c.key === ref) ??
    categories.find((c) => c.key === c.id && ref === `c${c.id.slice(0, 8)}`) ??
    null
  );
}

const findCategory = (env: CardEnv, key: string | null) =>
  key ? env.categories.find((c) => c.key === key || c.id === key) ?? null : null;
const categoryName = (env: CardEnv, key: string | null) => findCategory(env, key)?.name ?? null;

interface CardFields {
  /** Voice input: what we heard, shown on the card (TZ §57). */
  transcript?: string | null;
  amount: number;
  currency: 'UZS' | 'USD';
  amountUzs?: number;
  type: ParsedTransaction['type'];
  categoryName: string | null;
  categoryIcon?: string | null;
  categoryPending: boolean;
  note: string | null;
  date: string;
  accountLabel?: string | null;
}

/**
 * HTML card:
 *   🚕 <b>25 000 so'm</b>
 *   Transport · Bugun
 *   📝 taksi
 */
export function cardText(f: CardFields, env: CardEnv, suffix?: string): string {
  const money =
    f.currency === 'USD' && f.amountUzs
      ? `${formatMoney(f.amount, 'USD', env.lang)} · ${formatMoney(f.amountUzs, 'UZS', env.lang)}`
      : formatMoney(f.amount, f.currency, env.lang);
  const income = f.type === 'income';
  const known = !f.categoryPending && !!f.categoryName;
  const icon = (known && f.categoryIcon) || (income ? '💰' : '💸');
  const lines = f.transcript ? [`🎙 ${i(`«${esc(f.transcript)}»`)}`, ''] : [];
  lines.push(`${icon} ${b(income ? `+${money}` : money)}`);
  const what = known ? esc(income ? `${t(env.lang, 'income')} · ${f.categoryName}` : f.categoryName!) : `❓ ${t(env.lang, 'categoryPending')}`;
  lines.push(`${what} · ${formatDateLabel(f.date, env.today, env.yesterday, env.lang)}${f.accountLabel ? ` · ${esc(f.accountLabel)}` : ''}`);
  // A note that only repeats the category ("Oylik" under "Oylik") adds nothing.
  if (f.note && f.note.toLowerCase() !== (f.categoryName ?? '').toLowerCase()) lines.push(`📝 ${esc(f.note)}`);
  if (suffix) lines.push('', b(suffix));
  return lines.join('\n');
}

export function txFields(tx: Transaction, env: CardEnv, timeZone: string): CardFields {
  return {
    transcript: tx.source === 'voice' ? tx.rawInput : null,
    amount: tx.amount,
    currency: tx.currency,
    amountUzs: tx.amountUzs,
    type: tx.type,
    categoryName: categoryName(env, tx.categoryId),
    categoryIcon: findCategory(env, tx.categoryId)?.icon ?? null,
    categoryPending: tx.categoryStatus === 'pending',
    note: tx.note,
    date: localDate(tx.occurredAt, timeZone),
    accountLabel: accountLabel(env, tx.accountId),
  };
}

export function parsedFields(tx: ParsedTransaction, env: CardEnv, categoryPending = false, transcript: string | null = null): CardFields {
  return {
    transcript,
    amount: tx.amount,
    currency: tx.currency,
    type: tx.type,
    categoryName: categoryName(env, tx.category_id),
    categoryIcon: findCategory(env, tx.category_id)?.icon ?? null,
    categoryPending,
    note: tx.note,
    date: tx.date,
  };
}

/** [Transport] [25 000] [Bugun] / [🗑 O'chirish] — no Save button: the record is already saved (TZ §16). */
export function txKeyboard(tx: Transaction, env: CardEnv, timeZone: string): InlineKeyboard {
  const f = txFields(tx, env, timeZone);
  const catLabel = f.categoryPending || !f.categoryName ? `❓ ${t(env.lang, 'categoryShort')}` : `${f.categoryIcon ?? '🏷'} ${f.categoryName}`;
  const kb = new InlineKeyboard()
    .text(catLabel, `cat:${tx.id}`)
    .text(`✏️ ${groupDigits(tx.amount)}`, `amt:${tx.id}`)
    .text(`📅 ${formatDateLabel(f.date, env.today, env.yesterday, env.lang)}`, `dt:${tx.id}`)
    .row();
  // Account switcher (cycles through accounts) only when the user has accounts.
  if (env.accounts.length > 0) kb.text(accountLabel(env, tx.accountId) ?? `💳 ${t(env.lang, 'accountNone')}`, `acc:${tx.id}`);
  return kb.text(t(env.lang, 'delete'), `del:${tx.id}`);
}

/** Category grid; `prefix` decides what a tap does (e.g. `sc:<txId>` or `pc:<pendingId>`). */
export function categoryKeyboard(
  env: CardEnv,
  kind: 'expense' | 'income',
  prefix: string,
  opts: { first?: string[]; back?: string } = {},
): InlineKeyboard {
  const visible = env.categories.filter((c) => !c.isHidden && c.kind === kind);
  const first = opts.first ?? [];
  const ordered = [
    ...first.map((k) => visible.find((c) => c.key === k)).filter((c): c is WalletCategory => !!c),
    ...visible.filter((c) => !first.includes(c.key)),
  ];
  const kb = new InlineKeyboard();
  ordered.forEach((c, i) => {
    kb.text(`${c.icon ?? ''} ${c.name}`.trim(), `${prefix}:${catRef(c)}`);
    if (i % 2 === 1) kb.row();
  });
  if (opts.back) kb.row().text(t(env.lang, 'back'), opts.back);
  return kb;
}

export function dateKeyboard(env: CardEnv, txId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(formatDateLabel(env.today, env.today, env.yesterday, env.lang), `sd:${txId}:0`)
    .text(formatDateLabel(env.yesterday, env.today, env.yesterday, env.lang), `sd:${txId}:1`)
    .text(t(env.lang, 'dayBefore'), `sd:${txId}:2`)
    .row()
    .text(t(env.lang, 'back'), `card:${txId}`);
}
