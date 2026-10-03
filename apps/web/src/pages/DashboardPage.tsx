import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { api, type Dashboard, type Lang, type Tx } from '../api';
import { Bars } from '../components/Bars';
import { Donut } from '../components/Donut';
import { TxRow } from '../components/TxRow';
import { day, money } from '../format';
import { tr } from '../i18n';

type Period = 'day' | 'week' | 'month';

function debtLine(list: Dashboard['debts']['owedToMe'], lang: Lang) {
  return list.length ? list.map((d) => money(d.amount, d.currency, lang)).join(' · ') : money(0, 'UZS', lang);
}

export function DashboardPage({ lang, onSeeAll }: { lang: Lang; onSeeAll: () => void }) {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<Dashboard | null>(null);
  const [recent, setRecent] = useState<Tx[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    api
      .get<Dashboard>(`/api/dashboard?period=${period}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [period]);

  useEffect(() => {
    api
      .get<{ items: Tx[] }>('/api/transactions?limit=5')
      .then((r) => setRecent(r.items))
      .catch(() => setRecent([]));
  }, []);

  const year = new Date().getFullYear().toString();

  return (
    <section className="stack">
      {error && <p className="error">{tr(lang, 'error')}</p>}
      <div className="dash-top">
        <div className="hero">
          <div className="segmented" role="group">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {tr(lang, p === 'day' ? 'today' : p)}
              </button>
            ))}
          </div>
          {data && (
            <>
              <div className="hero-label">{tr(lang, 'balance')}</div>
              {data.balanceUzs === null ? (
                // TZ §27: no income → no negative red balance, prompt instead.
                <>
                  <div className="hero-value prompt">{tr(lang, 'enterIncome')}</div>
                  <div className="hero-range">{tr(lang, 'enterIncomeHint')}</div>
                </>
              ) : (
                <>
                  <div className="hero-value">{money(data.balanceUzs, 'UZS', lang)}</div>
                  <div className="hero-range">
                    {data.range.startDate === data.range.endDate
                      ? day(data.range.startDate, lang)
                      : `${day(data.range.startDate, lang)} — ${day(data.range.endDate, lang)}`}
                  </div>
                </>
              )}
              <div className="hero-chips">
                <div className="hero-chip">
                  <div className="k"><TrendingDown aria-hidden />{tr(lang, 'expense')}</div>
                  <div className="v">{money(data.expenseUzs, 'UZS', lang)}</div>
                </div>
                <div className="hero-chip">
                  <div className="k"><TrendingUp aria-hidden />{tr(lang, 'income')}</div>
                  <div className="v">{money(data.incomeUzs, 'UZS', lang)}</div>
                </div>
              </div>
            </>
          )}
        </div>
        {data && (
          <div className="tiles">
            <div className="card tile">
              <span className="icon-circle good" aria-hidden><ArrowDownLeft size={20} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="k">{tr(lang, 'owedToMe')}</div>
                <div className="v">{debtLine(data.debts.owedToMe, lang)}</div>
              </div>
            </div>
            <div className="card tile">
              <span className="icon-circle warn" aria-hidden><ArrowUpRight size={20} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="k">{tr(lang, 'iOwe')}</div>
                <div className="v">{debtLine(data.debts.iOwe, lang)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {data && (
        <div className="dash-grid two">
          <div className="card">
            <div className="card-title"><span>{tr(lang, 'byCategory')}</span></div>
            {data.byCategory.length ? (
              <Donut rows={data.byCategory} totalUzs={data.expenseUzs} lang={lang} />
            ) : (
              <p className="empty">{tr(lang, 'noData')}</p>
            )}
          </div>
          <div className="card">
            <Bars daily={data.daily} lang={lang} />
          </div>
        </div>
      )}

      {recent && recent.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>{tr(lang, 'recent')}</span>
            <button className="linkbtn" onClick={onSeeAll}>
              {tr(lang, 'all')}
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div style={{ margin: '-6px -8px' }}>
            {recent.map((tx) => (
              <TxRow key={tx.id} tx={tx} lang={lang} onClick={onSeeAll} showDate={day(tx.date, lang, year)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
