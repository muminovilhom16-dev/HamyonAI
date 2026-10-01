import { useEffect, useState } from 'react';
import { api, type Dashboard, type Lang } from '../api';
import { Bars } from '../components/Bars';
import { Donut } from '../components/Donut';
import { day, money } from '../format';
import { tr } from '../i18n';

type Period = 'day' | 'week' | 'month';

function debtLine(list: Dashboard['debts']['owedToMe'], lang: Lang) {
  return list.length ? list.map((d) => money(d.amount, d.currency, lang)).join(' · ') : '0';
}

export function DashboardPage({ lang }: { lang: Lang }) {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<Dashboard | null>(null);
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

  return (
    <section>
      <div className="segmented" role="group">
        {(['day', 'week', 'month'] as const).map((p) => (
          <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
            {tr(lang, p === 'day' ? 'today' : p)}
          </button>
        ))}
      </div>
      {error && <p className="error">{tr(lang, 'error')}</p>}
      {data && (
        <>
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            {data.range.startDate === data.range.endDate
              ? day(data.range.startDate, lang)
              : `${day(data.range.startDate, lang)} — ${day(data.range.endDate, lang)}`}
          </p>
          <div className="grid-cards">
            <div className="card">
              <div className="kpi-label">{tr(lang, 'expense')}</div>
              <div className="kpi-value">{money(data.expenseUzs, 'UZS', lang)}</div>
            </div>
            <div className="card">
              <div className="kpi-label">{tr(lang, 'income')}</div>
              <div className="kpi-value">{money(data.incomeUzs, 'UZS', lang)}</div>
            </div>
            <div className="card">
              <div className="kpi-label">{tr(lang, 'balance')}</div>
              {data.balanceUzs === null ? (
                // TZ §27: no income → no negative red balance.
                <>
                  <div className="kpi-value" style={{ fontSize: 15 }}>{tr(lang, 'enterIncome')}</div>
                  <div className="kpi-hint">{tr(lang, 'enterIncomeHint')}</div>
                </>
              ) : (
                <div className="kpi-value">{money(data.balanceUzs, 'UZS', lang)}</div>
              )}
            </div>
            <div className="card">
              <div className="kpi-label">{tr(lang, 'debts')}</div>
              {data.debts.owedToMe.length || data.debts.iOwe.length ? (
                <>
                  <div className="kpi-hint">{tr(lang, 'owedToMe')}: <span className="num">{debtLine(data.debts.owedToMe, lang)}</span></div>
                  <div className="kpi-hint">{tr(lang, 'iOwe')}: <span className="num">{debtLine(data.debts.iOwe, lang)}</span></div>
                </>
              ) : (
                <div className="kpi-hint">{tr(lang, 'noDebts')}</div>
              )}
            </div>
          </div>
          <div className="panels">
            <div className="card">
              <div className="panel-title"><span>{tr(lang, 'byCategory')}</span></div>
              {data.byCategory.length ? <Donut rows={data.byCategory} totalUzs={data.expenseUzs} lang={lang} /> : <p className="muted">{tr(lang, 'noData')}</p>}
            </div>
            <div className="card">
              <Bars daily={data.daily} lang={lang} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
