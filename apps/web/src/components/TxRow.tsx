import { Mic } from 'lucide-react';
import type { Lang, Tx, TxType } from '../api';
import { money } from '../format';
import { tr } from '../i18n';

export const DEBT_TYPES: TxType[] = ['debt_given', 'debt_taken', 'debt_return'];

const debtLabel = (tx: Tx, lang: Lang) =>
  tr(lang, tx.type === 'debt_given' ? 'debtGiven' : tx.type === 'debt_taken' ? 'debtTaken' : 'debtReturn');

/** Debts: the person is the title, the kind goes to the subtitle (fits narrow screens). */
export function txTitle(tx: Tx, lang: Lang): string {
  if (DEBT_TYPES.includes(tx.type)) return tx.counterparty ?? debtLabel(tx, lang);
  return tx.categoryName ?? tr(lang, 'uncategorized');
}

const txIcon = (tx: Tx) => (DEBT_TYPES.includes(tx.type) ? '🤝' : tx.categoryName ? tx.categoryIcon ?? '🏷' : '❓');

/** One bank-statement row: icon · title/subtitle · amount. */
export function TxRow({ tx, lang, onClick, showDate }: { tx: Tx; lang: Lang; onClick: () => void; showDate?: string }) {
  const income = tx.type === 'income';
  const isDebt = DEBT_TYPES.includes(tx.type);
  // A note that just repeats the category ("Oylik" under "Oylik") adds nothing.
  const note = tx.note && tx.note.toLowerCase() !== (tx.categoryName ?? '').toLowerCase() ? tx.note : null;
  const sub = [isDebt && tx.counterparty ? debtLabel(tx, lang) : null, showDate ?? tx.time, note].filter(Boolean).join(' · ');
  return (
    <button className="tx" onClick={onClick}>
      <span className="icon-circle" aria-hidden>{txIcon(tx)}</span>
      <span className="body">
        <span className="title">{txTitle(tx, lang)}</span>
        <span className="sub">
          {sub}
          {tx.source === 'voice' && <Mic size={12} style={{ marginLeft: 6, verticalAlign: '-1px' }} aria-label="voice" />}
        </span>
      </span>
      <span className={`amt${income ? ' income' : ''}`}>
        {income ? '+' : tx.type === 'expense' ? '−' : ''}
        {money(tx.amount, tx.currency, lang)}
        {tx.currency === 'USD' && <small>{money(tx.amountUzs, 'UZS', lang)}</small>}
      </span>
    </button>
  );
}
