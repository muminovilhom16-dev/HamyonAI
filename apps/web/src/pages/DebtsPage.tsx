import { useEffect, useState } from 'react';
import { CalendarClock, HandCoins } from 'lucide-react';
import { api, type Currency, type DebtGroup, type Lang } from '../api';
import { initials } from '../App';
import { day, money } from '../format';
import { tr } from '../i18n';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function totals(list: DebtGroup[], lang: Lang): string {
  const byCur = new Map<Currency, number>();
  for (const g of list) byCur.set(g.currency, (byCur.get(g.currency) ?? 0) + g.remaining);
  return [...byCur].map(([c, v]) => money(v, c, lang)).join(' + ');
}

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
  if (groups.length === 0) {
    return (
      <div className="card empty">
        <HandCoins size={36} aria-hidden />
        <div>{tr(lang, 'noDebts')}</div>
      </div>
    );
  }
  const year = new Date().getFullYear().toString();
  const today = todayIso();

  const section = (dir: 'given' | 'taken') => {
    const list = groups.filter((g) => g.direction === dir);
    if (!list.length) return null;
    return (
      <div className="debt-section">
        <h3>
          <span>{tr(lang, dir === 'given' ? 'owedToMe' : 'iOwe')}</span>
          <span className="num muted">{totals(list, lang)}</span>
        </h3>
        <div className="debt-grid">
          {list.map((g) => {
            const repaid = g.total - g.remaining;
            const overdue = !!g.nearestDue && g.nearestDue < today;
            return (
              <div className="card debt" key={`${g.direction}-${g.counterparty}-${g.currency}`}>
                <div className="head">
                  <span className="avatar lg" aria-hidden>{initials(g.counterparty)}</span>
                  <div className="who">
                    <div className="name">{g.counterparty}</div>
                    <div className="small muted">{tr(lang, dir === 'given' ? 'debtGiven' : 'debtTaken')}</div>
                  </div>
                  {g.nearestDue && (
                    <span className={`badge${overdue ? ' overdue' : ''}`}>
                      <CalendarClock aria-hidden />
                      {overdue ? tr(lang, 'overdue') : day(g.nearestDue, lang, year)}
                    </span>
                  )}
                </div>
                <div className="remaining">{money(g.remaining, g.currency, lang)}</div>
                <div className="progress" aria-hidden>
                  <div style={{ width: `${Math.round((repaid / g.total) * 100)}%` }} />
                </div>
                <div className="small muted">
                  {money(repaid, g.currency, lang)} {tr(lang, 'repaid')} · {money(g.total, g.currency, lang)}
                </div>
                <div className="debt-items">
                  {g.debts.map((d) => (
                    <div key={d.id}>
                      <div className="debt-item">
                        <span>
                          {day(d.createdDate, lang, year)} · <span className="num">{money(d.total, g.currency, lang)}</span>
                        </span>
                        <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {tr(lang, 'due')}
                          <input type="date" value={d.dueDate ?? ''} onChange={(e) => setDue(d.id, e.target.value)} />
                        </label>
                      </div>
                      {d.payments.length > 0 && (
                        <div className="small muted" style={{ marginTop: 4 }}>
                          {tr(lang, 'payments')}: {d.payments.map((p) => `${day(p.date, lang, year)} — ${money(p.amount, g.currency, lang)}`).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section>
      {section('given')}
      {section('taken')}
    </section>
  );
}
