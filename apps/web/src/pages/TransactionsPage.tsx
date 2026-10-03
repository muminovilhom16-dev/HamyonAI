import { useCallback, useEffect, useRef, useState } from 'react';
import { ReceiptText, Trash2, X } from 'lucide-react';
import { api, ApiError, type Category, type Lang, type Tx } from '../api';
import { DEBT_TYPES as DEBT, TxRow } from '../components/TxRow';
import { day, group, money, parseAmountInput } from '../format';
import { tr } from '../i18n';

export function TransactionsPage({ lang }: { lang: Lang }) {
  const [items, setItems] = useState<Tx[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [type, setType] = useState<'' | 'expense' | 'income'>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [toast, setToast] = useState<Tx | null>(null);
  const [error, setError] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const query = useCallback(
    (c?: string | null) => {
      const p = new URLSearchParams({ limit: '50' });
      if (type) p.set('type', type);
      if (start) p.set('start', start);
      if (end) p.set('end', end);
      if (c) p.set('cursor', c);
      return `/api/transactions?${p}`;
    },
    [type, start, end],
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
  useEffect(() => {
    api.get<Category[]>('/api/categories').then(setCategories).catch(() => {});
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
      {editing && (
        <EditSheet
          tx={editing}
          lang={lang}
          categories={categories.filter((c) => c.kind === (editing.type === 'income' ? 'income' : 'expense'))}
          onClose={() => setEditing(null)}
          onSaved={(tx) => {
            setItems((prev) => prev.map((x) => (x.id === tx.id ? tx : x)));
            setEditing(null);
          }}
          onDelete={() => remove(editing)}
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

function EditSheet(props: {
  tx: Tx;
  lang: Lang;
  categories: Category[];
  onClose: () => void;
  onSaved: (tx: Tx) => void;
  onDelete: () => void;
}) {
  const { tx, lang } = props;
  const isDebt = DEBT.includes(tx.type);
  const [amount, setAmount] = useState(group(tx.amount));
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? '');
  const [date, setDate] = useState(tx.date);
  const [note, setNote] = useState(tx.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (!isDebt) {
      const n = parseAmountInput(amount);
      if (n === null) return setErr(tr(lang, 'invalidAmount'));
      if (n !== tx.amount) patch.amount = n;
      if (categoryId && categoryId !== tx.categoryId) patch.categoryId = categoryId;
    }
    if (date !== tx.date) patch.date = date;
    if (note !== (tx.note ?? '')) patch.note = note || null;
    if (Object.keys(patch).length === 0) return props.onClose();
    setBusy(true);
    try {
      props.onSaved(await api.patch<Tx>(`/api/transactions/${tx.id}`, patch));
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'invalidAmount') : tr(lang, 'error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={tr(lang, 'edit')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>{tr(lang, 'edit')}</h3>
          <button className="icon-btn" onClick={props.onClose} aria-label={tr(lang, 'cancel')}><X size={18} /></button>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="field">
          <label htmlFor="amt">{tr(lang, 'amount')} ({tx.currency})</label>
          <input id="amt" className="amount-input" inputMode="numeric" value={amount} disabled={isDebt} onChange={(e) => setAmount(e.target.value)} />
          {isDebt && <span className="small muted">{tr(lang, 'debtAmountLocked')}</span>}
        </div>
        {!isDebt && (
          <div className="field">
            <label htmlFor="cat">{tr(lang, 'category')}</label>
            <select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {!tx.categoryId && <option value="">{tr(lang, 'uncategorized')}</option>}
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>{`${c.icon ?? ''} ${c.name}`.trim()}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="date">{tr(lang, 'date')}</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="note">{tr(lang, 'note')}</label>
          <input id="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn danger" onClick={props.onDelete}><Trash2 size={16} aria-hidden />{tr(lang, 'delete')}</button>
          <button className="btn" onClick={props.onClose}>{tr(lang, 'cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={save}>{tr(lang, 'save')}</button>
        </div>
      </div>
    </div>
  );
}
