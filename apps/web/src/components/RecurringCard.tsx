import { useEffect, useState } from 'react';
import { Plus, Repeat, Trash2 } from 'lucide-react';
import { api, type Category, type Lang, type Recurring } from '../api';
import { day, money, parseAmountInput } from '../format';
import { tr } from '../i18n';

/** Monthly payments: the bot asks "paid?" on the day and records it in one tap. */
export function RecurringCard({ lang }: { lang: Lang }) {
  const [list, setList] = useState<Recurring[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dom, setDom] = useState('1');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Recurring[]>('/api/recurring').then(setList).catch(() => setList([]));
    api.get<Category[]>('/api/categories').then((c) => setCats(c.filter((x) => x.kind === 'expense'))).catch(() => {});
  }, []);

  const save = async () => {
    const n = parseAmountInput(amount);
    if (!note.trim() || n === null) return setErr(tr(lang, 'invalidAmount'));
    try {
      setList(await api.post<Recurring[]>('/api/recurring', { note: note.trim(), amount: n, categoryId: categoryId || null, dayOfMonth: Number(dom) }));
      setAdding(false);
      setNote('');
      setAmount('');
      setErr(null);
    } catch {
      setErr(tr(lang, 'error'));
    }
  };
  const remove = async (r: Recurring) => {
    await api.del(`/api/recurring/${r.id}`).catch(() => {});
    setList((l) => (l ?? []).filter((x) => x.id !== r.id));
  };

  if (!list) return null;
  const year = new Date().getFullYear().toString();
  return (
    <div className="card">
      <div className="card-title">
        <span>{tr(lang, 'recurring')}</span>
        <button className="linkbtn" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden />
          {tr(lang, 'add')}
        </button>
      </div>
      {list.length === 0 && !adding && (
        <div className="empty" style={{ padding: '12px 8px' }}>
          <Repeat size={30} aria-hidden />
          <div className="small">{tr(lang, 'recurringEmpty')}</div>
        </div>
      )}
      <div className="budget-list">
        {list.map((r) => (
          <div className="budget" key={r.id}>
            <span className="icon-circle" aria-hidden>{r.categoryIcon ?? '🔁'}</span>
            <div className="body">
              <div className="top">
                <span className="name">{r.note}</span>
                <span className="num">{money(r.amount, r.currency, lang)}</span>
              </div>
              <div className="small muted">
                {tr(lang, 'everyMonth').replace('{day}', String(r.dayOfMonth))} · {tr(lang, 'next')}: {day(r.nextDate, lang, year)}
              </div>
            </div>
            <button className="icon-btn" onClick={() => remove(r)} aria-label={tr(lang, 'delete')}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {adding && (
        <div className="recurring-form">
          {err && <p className="error">{err}</p>}
          <input className="input" placeholder={tr(lang, 'recurringNameHint')} value={note} onChange={(e) => setNote(e.target.value)} aria-label={tr(lang, 'categoryName')} maxLength={100} />
          <input className="input" inputMode="numeric" placeholder="99 000" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={tr(lang, 'amount')} />
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={tr(lang, 'category')}>
            <option value="">{tr(lang, 'uncategorized')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{`${c.icon ?? ''} ${c.name}`.trim()}</option>
            ))}
          </select>
          <select className="input" value={dom} onChange={(e) => setDom(e.target.value)} aria-label={tr(lang, 'dayOfMonth')}>
            {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
              <option key={d} value={d}>{tr(lang, 'everyMonth').replace('{day}', d)}</option>
            ))}
          </select>
          <button className="btn primary" onClick={save}>{tr(lang, 'save')}</button>
        </div>
      )}
    </div>
  );
}
