import { useEffect, useState } from 'react';
import { AtSign, BellRing, CalendarClock, HandCoins, Plus, X } from 'lucide-react';
import { api, ApiError, type Currency, type DebtGroup, type Lang } from '../api';
import { initials } from '../App';
import { day, money, parseAmountInput } from '../format';
import { tr } from '../i18n';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Same rule as the server: "@Murod_A" / "t.me/murod_a" → "murod_a"; '' when empty; null when invalid. */
export function cleanUsername(raw: string): string | null {
  const v = raw.trim().replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '').toLowerCase();
  if (!v) return '';
  return /^[a-z0-9_]{5,32}$/.test(v) ? v : null;
}

function totals(list: DebtGroup[], lang: Lang): string {
  const byCur = new Map<Currency, number>();
  for (const g of list) byCur.set(g.currency, (byCur.get(g.currency) ?? 0) + g.remaining);
  return [...byCur].map(([c, v]) => money(v, c, lang)).join(' + ');
}

export function DebtsPage({ lang, currency }: { lang: Lang; currency: Currency }) {
  const [groups, setGroups] = useState<DebtGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const load = () => api.get<DebtGroup[]>('/api/debts').then(setGroups).catch(() => setError(true));
  useEffect(() => {
    void load();
  }, []);

  const patchDebt = async (id: string, body: object) => {
    try {
      await api.patch(`/api/debts/${id}`, body);
      await load();
      return true;
    } catch {
      return false;
    }
  };

  if (error) return <p className="error">{tr(lang, 'error')}</p>;
  if (!groups) return null;
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
                    <div className="small muted">
                      {tr(lang, dir === 'given' ? 'debtGiven' : 'debtTaken')}
                      {g.username && ` · @${g.username}`}
                    </div>
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
                {dir === 'given' && g.username && (
                  <div className={`tg-status${g.onBot ? ' on' : ''}`}>
                    <BellRing size={14} aria-hidden />
                    {tr(lang, g.onBot ? 'debtorOnBot' : 'debtorNotOnBot')}
                  </div>
                )}
                <div className="debt-items">
                  {g.debts.map((d) => (
                    <DebtRow key={d.id} lang={lang} year={year} currency={g.currency} debt={d} given={dir === 'given'} onPatch={(body) => patchDebt(d.id, body)} />
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
      {groups.length === 0 && (
        <div className="card empty">
          <HandCoins size={36} aria-hidden />
          <div>{tr(lang, 'noDebts')}</div>
          <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden />
            {tr(lang, 'addDebt')}
          </button>
        </div>
      )}
      {section('given')}
      {section('taken')}
      <button className="fab" onClick={() => setAdding(true)} aria-label={tr(lang, 'addDebt')}>
        <Plus size={26} aria-hidden />
      </button>
      {adding && (
        <AddDebtSheet
          lang={lang}
          currency={currency}
          onClose={() => setAdding(false)}
          onSaved={(list) => {
            setGroups(list);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function DebtRow(props: {
  lang: Lang;
  year: string;
  currency: Currency;
  given: boolean;
  debt: DebtGroup['debts'][number];
  onPatch: (body: object) => Promise<boolean>;
}) {
  const { lang, debt: d } = props;
  const [username, setUsername] = useState(d.username ? `@${d.username}` : '');
  const [err, setErr] = useState(false);
  const saveUsername = async () => {
    const u = cleanUsername(username);
    if (u === null) return setErr(true);
    if ((u || null) === d.username) return setErr(false);
    setErr(!(await props.onPatch({ username: u || null })));
  };
  return (
    <div>
      <div className="debt-item">
        <span>
          {day(d.createdDate, lang, props.year)} · <span className="num">{money(d.total, props.currency, lang)}</span>
        </span>
        <label className="small muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {tr(lang, 'due')}
          <input type="date" value={d.dueDate ?? ''} onChange={(e) => props.onPatch({ dueDate: e.target.value || null })} />
        </label>
      </div>
      {props.given && (
        <div className="debt-item" style={{ marginTop: 6 }}>
          <label className={`tg-input${err ? ' invalid' : ''}`}>
            <AtSign size={14} aria-hidden />
            <input
              value={username.replace(/^@/, '')}
              placeholder={tr(lang, 'tgUsernameShort')}
              aria-label={tr(lang, 'tgUsername')}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={saveUsername}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          {err && <span className="small error" style={{ margin: 0 }}>{tr(lang, 'tgUsernameInvalid')}</span>}
        </div>
      )}
      {d.payments.length > 0 && (
        <div className="small muted" style={{ marginTop: 4 }}>
          {tr(lang, 'payments')}: {d.payments.map((p) => `${day(p.date, lang, props.year)} — ${money(p.amount, props.currency, lang)}`).join(', ')}
        </div>
      )}
    </div>
  );
}

function AddDebtSheet(props: { lang: Lang; currency: Currency; onClose: () => void; onSaved: (list: DebtGroup[]) => void }) {
  const { lang } = props;
  const [direction, setDirection] = useState<'given' | 'taken'>('given');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [username, setUsername] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = parseAmountInput(amount);
    if (!name.trim()) return setErr(tr(lang, 'debtNameRequired'));
    if (n === null) return setErr(tr(lang, 'invalidAmount'));
    if (dueDate && dueDate < date) return setErr(tr(lang, 'dueBeforeDate'));
    const u = direction === 'given' ? cleanUsername(username) : '';
    if (u === null) return setErr(tr(lang, 'tgUsernameInvalid'));
    setBusy(true);
    try {
      props.onSaved(
        await api.post<DebtGroup[]>('/api/debts', {
          direction, counterparty: name.trim(), amount: n, date, dueDate: dueDate || null, username: u || null,
        }),
      );
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'invalidAmount') : tr(lang, 'error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={tr(lang, 'addDebt')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{tr(lang, 'addDebt')}</h3>
          <button className="icon-btn" onClick={props.onClose} aria-label={tr(lang, 'cancel')}><X size={18} /></button>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="segmented" role="group" style={{ marginBottom: 14 }}>
          {(['given', 'taken'] as const).map((d) => (
            <button key={d} aria-pressed={direction === d} onClick={() => setDirection(d)}>{tr(lang, d === 'given' ? 'debtGiven' : 'debtTaken')}</button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="dname">{tr(lang, direction === 'given' ? 'debtWhoGiven' : 'debtWhoTaken')}</label>
          <input id="dname" autoFocus maxLength={100} placeholder="Murod aka" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="damt">{tr(lang, 'amount')} ({props.currency})</label>
          <input id="damt" className="amount-input" inputMode="numeric" placeholder="300 000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="ddate">{tr(lang, 'date')}</label>
            <input id="ddate" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ddue">{tr(lang, 'dueOptional')}</label>
            <input id="ddue" type="date" min={date} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {direction === 'given' && (
          <div className="field">
            <label htmlFor="duser">{tr(lang, 'tgUsername')}</label>
            <input id="duser" placeholder="@murod_aka" autoCapitalize="off" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} />
            <span className="small muted">{tr(lang, 'tgUsernameHint')}</span>
          </div>
        )}
        <div className="row">
          <button className="btn" onClick={props.onClose}>{tr(lang, 'cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={save}>{tr(lang, 'save')}</button>
        </div>
      </div>
    </div>
  );
}
