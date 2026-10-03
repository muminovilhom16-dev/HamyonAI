import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ReceiptText, Search, Trash2, X } from 'lucide-react';
import { api, ApiError, type Account, type Category, type Currency, type Lang, type Tx } from '../api';
import { DEBT_TYPES as DEBT, TxRow } from '../components/TxRow';
import { day, group, money, parseAmountInput } from '../format';
import { tr } from '../i18n';

export function TransactionsPage({ lang, currency }: { lang: Lang; currency: Currency }) {
  const [items, setItems] = useState<Tx[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [type, setType] = useState<'' | 'expense' | 'income'>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  // Debounce typing so every keystroke is not a request.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Tx | null>(null);
  const [error, setError] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const query = useCallback(
    (c?: string | null) => {
      const p = new URLSearchParams({ limit: '50' });
      if (type) p.set('type', type);
      if (start) p.set('start', start);
      if (end) p.set('end', end);
      if (q) p.set('q', q);
      if (c) p.set('cursor', c);
      return `/api/transactions?${p}`;
    },
    [type, start, end, q],
  );

  const load = useCallback(() => {
    setError(false);
    api
      .get<{ items: Tx[]; nextCursor: string | null }>(query())
      .then((r) => {
        setItems(r.items);
        setCursor(r.nextCursor);
      })
      .catch(() => setError(true));
  }, [query]);

  useEffect(load, [load]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    api.get<Category[]>('/api/categories').then(setCategories).catch(() => {});
    api.get<Account[]>('/api/accounts').then(setAccounts).catch(() => {});
  }, []);

  const more = async () => {
    const r = await api.get<{ items: Tx[]; nextCursor: string | null }>(query(cursor));
    setItems((prev) => [...prev, ...r.items]);
    setCursor(r.nextCursor);
  };

  const remove = async (tx: Tx) => {
    try {
      await api.del(`/api/transactions/${tx.id}`);
    } catch {
      setError(true);
      return;
    }
    setEditing(null);
    setItems((prev) => prev.filter((x) => x.id !== tx.id));
    setToast(tx);
    window.clearTimeout(toastTimer.current);
    // Undo window is 10 s on the server (TZ §19).
    toastTimer.current = window.setTimeout(() => setToast(null), 10_000);
  };

  const undo = async () => {
    if (!toast) return;
    window.clearTimeout(toastTimer.current);
    setToast(null);
    try {
      await api.post(`/api/transactions/${toast.id}/restore`);
      load();
    } catch {
      setError(true);
    }
  };

  const year = new Date().getFullYear().toString();
  // Group consecutive rows by day; header shows the day's spending.
  const days: Array<{ date: string; rows: Tx[]; spentUzs: number }> = [];
  for (const tx of items) {
    let d = days.at(-1);
    if (!d || d.date !== tx.date) days.push((d = { date: tx.date, rows: [], spentUzs: 0 }));
    d.rows.push(tx);
    if (tx.type === 'expense') d.spentUzs += tx.amountUzs;
  }

  return (
    <section>
      <label className="search-box">
        <Search size={18} aria-hidden />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr(lang, 'searchHint')} aria-label={tr(lang, 'search')} />
      </label>
      <div className="filters">
        <div className="segmented" role="group" aria-label={tr(lang, 'records')}>
          {(['', 'expense', 'income'] as const).map((v) => (
            <button key={v || 'all'} aria-pressed={type === v} onClick={() => setType(v)}>
              {tr(lang, v || 'all')}
            </button>
          ))}
        </div>
        <label className="pill-input">
          {tr(lang, 'from')}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="pill-input">
          {tr(lang, 'to')}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{tr(lang, 'error')}</p>}
      {items.length === 0 && !error && (
        <div className="card empty">
          <ReceiptText size={36} aria-hidden />
          <div>{tr(lang, 'empty')}</div>
        </div>
      )}
      {days.map((d) => (
        <div className="day" key={d.date}>
          <div className="day-head">
            <span>{day(d.date, lang, year)}</span>
            {d.spentUzs > 0 && <span className="num">−{money(d.spentUzs, 'UZS', lang)}</span>}
          </div>
          <div className="card day-list">
            {d.rows.map((tx) => (
              <TxRow key={tx.id} tx={tx} lang={lang} onClick={() => setEditing(tx)} />
            ))}
          </div>
        </div>
      ))}
      {cursor && (
        <button className="btn block" onClick={more}>
          {tr(lang, 'loadMore')}
        </button>
      )}
      <button className="fab" onClick={() => setCreating(true)} aria-label={tr(lang, 'addRecord')}>
        <Plus size={26} aria-hidden />
      </button>
      {(editing || creating) && (
        <EditSheet
          tx={editing}
          lang={lang}
          currency={currency}
          categories={categories}
          accounts={accounts}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={(tx) => {
            if (creating) load();
            else setItems((prev) => prev.map((x) => (x.id === tx.id ? tx : x)));
            setEditing(null);
            setCreating(false);
          }}
          {...(editing && { onDelete: () => remove(editing) })}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{tr(lang, 'deleted')}</span>
          <button onClick={undo}>{tr(lang, 'undo')}</button>
        </div>
      )}
    </section>
  );
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Edit an existing record, or create one when `tx` is null. */
function EditSheet(props: {
  tx: Tx | null;
  lang: Lang;
  currency: Currency;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSaved: (tx: Tx) => void;
  onDelete?: () => void;
}) {
  const { tx, lang } = props;
  const creating = tx === null;
  const isDebt = !!tx && DEBT.includes(tx.type);
  const [kind, setKind] = useState<'expense' | 'income'>(tx?.type === 'income' ? 'income' : 'expense');
  const [amount, setAmount] = useState(tx ? group(tx.amount) : '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [date, setDate] = useState(tx?.date ?? todayIso());
  const [note, setNote] = useState(tx?.note ?? '');
  const defaultAccount = props.accounts.find((a) => a.isDefault)?.id ?? '';
  const [accountId, setAccountId] = useState(tx ? tx.accountId ?? '' : defaultAccount);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = props.categories.filter((c) => c.kind === kind);

  const save = async () => {
    const n = isDebt ? tx!.amount : parseAmountInput(amount);
    if (n === null) return setErr(tr(lang, 'invalidAmount'));
    if (creating) {
      if (!categoryId) return setErr(tr(lang, 'pickCategory'));
      setBusy(true);
      try {
        props.onSaved(await api.post<Tx>('/api/transactions', { type: kind, amount: n, categoryId, date, note: note.trim() || null, accountId: accountId || null }));
      } catch (e) {
        setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'invalidAmount') : tr(lang, 'error'));
      } finally {
        setBusy(false);
      }
      return;
    }
    const patch: Record<string, unknown> = {};
    if (!isDebt) {
      if (n !== tx!.amount) patch.amount = n;
      if (categoryId && categoryId !== tx!.categoryId) patch.categoryId = categoryId;
    }
    if (date !== tx!.date) patch.date = date;
    if (note !== (tx!.note ?? '')) patch.note = note || null;
    if (!isDebt && accountId !== (tx!.accountId ?? '')) patch.accountId = accountId || null;
    if (Object.keys(patch).length === 0) return props.onClose();
    setBusy(true);
    try {
      props.onSaved(await api.patch<Tx>(`/api/transactions/${tx!.id}`, patch));
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'invalidAmount') : tr(lang, 'error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={tr(lang, creating ? 'addRecord' : 'edit')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{tr(lang, creating ? 'addRecord' : 'edit')}</h3>
          <button className="icon-btn" onClick={props.onClose} aria-label={tr(lang, 'cancel')}><X size={18} /></button>
        </div>
        {err && <p className="error">{err}</p>}
        {creating && (
          <div className="segmented" role="group" style={{ marginBottom: 14 }}>
            {(['expense', 'income'] as const).map((k) => (
              <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setCategoryId(''); }}>{tr(lang, k)}</button>
            ))}
          </div>
        )}
        <div className="field">
          <label htmlFor="amt">{tr(lang, 'amount')} ({tx?.currency ?? props.currency})</label>
          <input id="amt" className="amount-input" inputMode="numeric" autoFocus={creating} placeholder="25 000" value={amount} disabled={isDebt} onChange={(e) => setAmount(e.target.value)} />
          {isDebt && <span className="small muted">{tr(lang, 'debtAmountLocked')}</span>}
        </div>
        {!isDebt && (
          <div className="field">
            <label htmlFor="cat">{tr(lang, 'category')}</label>
            <select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {(!categoryId || (tx && !tx.categoryId)) && <option value="">{creating ? '—' : tr(lang, 'uncategorized')}</option>}
              {options.map((c) => (
                <option key={c.id} value={c.id}>{`${c.icon ?? ''} ${c.name}`.trim()}</option>
              ))}
            </select>
          </div>
        )}
        {!isDebt && props.accounts.length > 0 && (
          <div className="field">
            <label htmlFor="acc">{tr(lang, 'accountField')}</label>
            <select id="acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{tr(lang, 'noAccount')}</option>
              {props.accounts.map((a) => (
                <option key={a.id} value={a.id}>{`${a.kind === 'cash' ? '💵' : '💳'} ${a.name}`}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="date">{tr(lang, 'date')}</label>
          <input id="date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="note">{tr(lang, 'note')}</label>
          <input id="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row">
          {props.onDelete && <button className="btn danger" onClick={props.onDelete}><Trash2 size={16} aria-hidden />{tr(lang, 'delete')}</button>}
          <button className="btn" onClick={props.onClose}>{tr(lang, 'cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={save}>{tr(lang, 'save')}</button>
        </div>
      </div>
    </div>
  );
}
