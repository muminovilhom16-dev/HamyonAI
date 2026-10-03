import { useEffect, useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { api, ApiError, type Budget, type Category, type Lang } from '../api';
import { group, money, parseAmountInput } from '../format';
import { tr } from '../i18n';

/** Monthly limits with progress; add / remove inline. */
export function BudgetsCard({ lang }: { lang: Lang }) {
  const [list, setList] = useState<Budget[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Budget[]>('/api/budgets').then(setList).catch(() => setList([]));
    api.get<Category[]>('/api/categories').then((c) => setCats(c.filter((x) => x.kind === 'expense'))).catch(() => {});
  }, []);

  const save = async () => {
    const n = parseAmountInput(amount);
    if (n === null) return setErr(tr(lang, 'invalidAmount'));
    try {
      setList(await api.put<Budget[]>('/api/budgets', { categoryId: categoryId || null, amountUzs: n }));
      setAdding(false);
      setAmount('');
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'budgetLimitReached') : tr(lang, 'error'));
    }
  };
  const remove = async (b: Budget) => {
    await api.del(`/api/budgets/${b.id}`).catch(() => {});
    setList((l) => (l ?? []).filter((x) => x.id !== b.id));
  };

  if (!list) return null;
  return (
    <div className="card">
      <div className="card-title">
        <span>{tr(lang, 'budgets')}</span>
        <button className="linkbtn" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden />
          {tr(lang, 'addLimit')}
        </button>
      </div>
      {list.length === 0 && !adding && (
        <div className="empty" style={{ padding: '12px 8px' }}>
          <Target size={30} aria-hidden />
          <div className="small">{tr(lang, 'budgetsEmpty')}</div>
        </div>
      )}
      <div className="budget-list">
        {list.map((b) => {
          const pct = Math.round((b.spentUzs / b.limitUzs) * 100);
          const state = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
          return (
            <div className="budget" key={b.id}>
              <span className="icon-circle" aria-hidden>{b.categoryId ? b.icon ?? '🏷' : '💰'}</span>
              <div className="body">
                <div className="top">
                  <span className="name">{b.categoryId ? b.name : tr(lang, 'budgetTotal')}</span>
                  <span className={`pct ${state}`}>{pct}%{state === 'over' ? ` · ${tr(lang, 'overLimit')}` : ''}</span>
                </div>
                <div className="track"><div className={`fill ${state}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                <div className="small muted num">{group(b.spentUzs)} / {money(b.limitUzs, 'UZS', lang)}</div>
              </div>
              <button className="icon-btn" onClick={() => remove(b)} aria-label={tr(lang, 'delete')}><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
      {adding && (
        <div className="budget-form">
          {err && <p className="error">{err}</p>}
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={tr(lang, 'category')}>
            <option value="">💰 {tr(lang, 'budgetTotal')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{`${c.icon ?? ''} ${c.name}`.trim()}</option>
            ))}
          </select>
          <input className="input" inputMode="numeric" placeholder="2 000 000" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={tr(lang, 'amount')} />
          <button className="btn primary" onClick={save}>{tr(lang, 'save')}</button>
        </div>
      )}
    </div>
  );
}
