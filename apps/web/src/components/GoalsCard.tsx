import { useEffect, useState } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, type Goal, type Lang } from '../api';
import { day, group, money, parseAmountInput } from '../format';
import { tr } from '../i18n';

/** Savings goals: progress, put money in / take out, create, delete. Savings are not expenses. */
export function GoalsCard({ lang }: { lang: Lang }) {
  const [list, setList] = useState<Goal[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [money_, setMoney] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Goal[]>('/api/goals').then(setList).catch(() => setList([]));
  }, []);

  const create = async () => {
    const n = parseAmountInput(target);
    if (!name.trim() || n === null) return setErr(tr(lang, 'invalidAmount'));
    try {
      setList(await api.post<Goal[]>('/api/goals', { name: name.trim(), targetAmount: n, targetDate: date || null }));
      setAdding(false);
      setName('');
      setTarget('');
      setDate('');
      setErr(null);
    } catch {
      setErr(tr(lang, 'error'));
    }
  };
  const contribute = async (g: Goal, sign: 1 | -1) => {
    const n = parseAmountInput(money_[g.id] ?? '');
    if (n === null) return setErr(tr(lang, 'invalidAmount'));
    try {
      setList(await api.post<Goal[]>(`/api/goals/${g.id}/contributions`, { amount: sign * n }));
      setMoney((m) => ({ ...m, [g.id]: '' }));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'goalTooMuch') : tr(lang, 'error'));
    }
  };
  const remove = async (g: Goal) => {
    await api.del(`/api/goals/${g.id}`).catch(() => {});
    setList((l) => (l ?? []).filter((x) => x.id !== g.id));
  };

  if (!list) return null;
  const year = new Date().getFullYear().toString();
  return (
    <div className="card">
      <div className="card-title">
        <span>{tr(lang, 'goals')}</span>
        <button className="linkbtn" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden />
          {tr(lang, 'add')}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {list.length === 0 && !adding && (
        <div className="empty" style={{ padding: '12px 8px' }}>
          <PiggyBank size={30} aria-hidden />
          <div className="small">{tr(lang, 'goalsEmpty')}</div>
        </div>
      )}
      <div className="budget-list">
        {list.map((g) => {
          const pct = Math.min(100, Math.floor((g.savedAmount / g.targetAmount) * 100));
          return (
            <div className="goal" key={g.id}>
              <div className="budget">
                <span className="icon-circle" aria-hidden>{g.completed ? '✅' : '🎯'}</span>
                <div className="body">
                  <div className="top">
                    <span className="name">{g.name}</span>
                    <span className="pct">{pct}%</span>
                  </div>
                  <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
                  <div className="small muted num">
                    {group(g.savedAmount)} / {money(g.targetAmount, g.currency, lang)}
                    {g.targetDate && ` · ${day(g.targetDate, lang, year)}`}
                    {g.perMonth !== null && ` · ${tr(lang, 'perMonth').replace('{amount}', money(g.perMonth, g.currency, lang))}`}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => remove(g)} aria-label={tr(lang, 'delete')}><Trash2 size={16} /></button>
              </div>
              <div className="goal-money">
                <input className="input" inputMode="numeric" placeholder="200 000" value={money_[g.id] ?? ''} aria-label={tr(lang, 'amount')}
                  onChange={(e) => setMoney((m) => ({ ...m, [g.id]: e.target.value }))} />
                <button className="btn primary" onClick={() => contribute(g, 1)}>+ {tr(lang, 'putIn')}</button>
                <button className="btn" onClick={() => contribute(g, -1)}>− {tr(lang, 'takeOut')}</button>
              </div>
            </div>
          );
        })}
      </div>
      {adding && (
        <div className="recurring-form">
          <input className="input" placeholder={tr(lang, 'goalNameHint')} value={name} onChange={(e) => setName(e.target.value)} aria-label={tr(lang, 'categoryName')} maxLength={60} />
          <input className="input" inputMode="numeric" placeholder="5 000 000" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={tr(lang, 'amount')} />
          <label className="small muted" style={{ display: 'grid', gap: 4 }}>
            {tr(lang, 'targetDate')}
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn primary" onClick={create}>{tr(lang, 'save')}</button>
        </div>
      )}
    </div>
  );
}
