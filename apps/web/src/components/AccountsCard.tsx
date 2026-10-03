import { useEffect, useState } from 'react';
import { Banknote, CreditCard, Plus, Star, Trash2 } from 'lucide-react';
import { api, type Account, type Lang } from '../api';
import { money } from '../format';
import { tr } from '../i18n';

const parseSigned = (s: string): number | null => {
  const t = s.replace(/[\s  ]/g, '');
  if (!/^-?\d{1,15}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
};

/** Cash and card balances: opening balance + income − expenses recorded on each. */
export function AccountsCard({ lang }: { lang: Lang }) {
  const [list, setList] = useState<Account[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'card' | 'cash'>('card');
  const [balance, setBalance] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Account[]>('/api/accounts').then(setList).catch(() => setList([]));
  }, []);

  const create = async () => {
    const opening = balance.trim() ? parseSigned(balance) : 0;
    if (!name.trim() || opening === null) return setErr(tr(lang, 'invalidAmount'));
    try {
      setList(await api.post<Account[]>('/api/accounts', { name: name.trim(), kind, openingBalance: opening }));
      setAdding(false);
      setName('');
      setBalance('');
      setErr(null);
    } catch {
      setErr(tr(lang, 'error'));
    }
  };
  const patch = async (a: Account, body: object) => {
    try {
      setList(await api.patch<Account[]>(`/api/accounts/${a.id}`, body));
    } catch {
      setErr(tr(lang, 'error'));
    }
  };

  if (!list) return null;
  return (
    <div className="card">
      <div className="card-title">
        <span>{tr(lang, 'accounts')}</span>
        <button className="linkbtn" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden />
          {tr(lang, 'add')}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {list.length === 0 && !adding && (
        <div className="empty" style={{ padding: '12px 8px' }}>
          <CreditCard size={30} aria-hidden />
          <div className="small">{tr(lang, 'accountsEmpty')}</div>
        </div>
      )}
      <div className="budget-list">
        {list.map((a) => (
          <div className="budget" key={a.id}>
            <span className="icon-circle" aria-hidden>{a.kind === 'cash' ? <Banknote size={19} /> : <CreditCard size={19} />}</span>
            <div className="body">
              <div className="top">
                <span className="name">{a.name}{a.isDefault && <span className="badge" style={{ marginLeft: 8 }}>{tr(lang, 'main')}</span>}</span>
                <span className={`num${a.balance < 0 ? ' neg' : ''}`}>{money(a.balance, a.currency, lang)}</span>
              </div>
            </div>
            {!a.isDefault && (
              <button className="icon-btn" onClick={() => patch(a, { isDefault: true })} aria-label={tr(lang, 'makeMain')} title={tr(lang, 'makeMain')}><Star size={16} /></button>
            )}
            <button className="icon-btn" onClick={() => patch(a, { archived: true })} aria-label={tr(lang, 'delete')}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {adding && (
        <div className="recurring-form">
          <div className="segmented" role="group">
            {(['card', 'cash'] as const).map((k) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{tr(lang, k === 'card' ? 'card' : 'cash')}</button>
            ))}
          </div>
          <input className="input" placeholder={tr(lang, kind === 'card' ? 'cardNameHint' : 'cashNameHint')} value={name} onChange={(e) => setName(e.target.value)} aria-label={tr(lang, 'categoryName')} maxLength={40} />
          <input className="input" inputMode="numeric" placeholder={tr(lang, 'currentBalance')} value={balance} onChange={(e) => setBalance(e.target.value)} aria-label={tr(lang, 'currentBalance')} />
          <button className="btn primary" onClick={create}>{tr(lang, 'save')}</button>
        </div>
      )}
    </div>
  );
}
