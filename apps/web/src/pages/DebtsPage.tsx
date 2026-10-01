import { useEffect, useState } from 'react';
import { api, type DebtGroup, type Lang } from '../api';
import { day, money } from '../format';
import { tr } from '../i18n';

export function DebtsPage({ lang }: { lang: Lang }) {
  const [groups, setGroups] = useState<DebtGroup[] | null>(null);
  const [error, setError] = useState(false);
  const load = () => api.get<DebtGroup[]>('/api/debts').then(setGroups).catch(() => setError(true));
  useEffect(() => {
    void load();
  }, []);

  const setDue = async (id: string, dueDate: string) => {
    try {
      await api.patch(`/api/debts/${id}`, { dueDate: dueDate || null });
      await load();
    } catch {
      setError(true);
    }
  };

  if (error) return <p className="error">{tr(lang, 'error')}</p>;
  if (!groups) return null;
  if (groups.length === 0) return <p className="muted">{tr(lang, 'noDebts')}</p>;
  const year = new Date().getFullYear().toString();

  const section = (dir: 'given' | 'taken') => {
    const list = groups.filter((g) => g.direction === dir);
    if (!list.length) return null;
    return (
      <>
        <h3 className="day-head">{tr(lang, dir === 'given' ? 'owedToMe' : 'iOwe')}</h3>
        {list.map((g) => (
          <div className="card debt" key={`${g.direction}-${g.counterparty}-${g.currency}`}>
            <div className="head">
              <span className="name">{g.counterparty}</span>
              <span className="num" style={{ fontWeight: 700 }}>{money(g.remaining, g.currency, lang)}</span>
            </div>
            <div className="progress" aria-hidden>
              <div style={{ width: `${Math.round(((g.total - g.remaining) / g.total) * 100)}%` }} />
            </div>
            <div className="small muted">
              {tr(lang, 'remaining')}: {money(g.remaining, g.currency, lang)} / {money(g.total, g.currency, lang)}
            </div>
            {g.debts.map((d) => (
              <div key={d.id} style={{ marginTop: 10 }}>
                <div className="row" style={{ alignItems: 'center' }}>
                  <span className="small">{day(d.createdDate, lang, year)} · <span className="num">{money(d.total, g.currency, lang)}</span></span>
                  <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {tr(lang, 'due')}
                    <input type="date" value={d.dueDate ?? ''} onChange={(e) => setDue(d.id, e.target.value)} />
                  </label>
                </div>
                {d.payments.length > 0 && (
                  <div className="small muted">
                    {tr(lang, 'payments')}: {d.payments.map((p) => `${day(p.date, lang, year)} — ${money(p.amount, g.currency, lang)}`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  return (
    <section>
      {section('given')}
      {section('taken')}
    </section>
  );
}
