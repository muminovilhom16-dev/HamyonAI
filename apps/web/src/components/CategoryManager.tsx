import { useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import { api, ApiError, type Category, type Lang } from '../api';
import { tr } from '../i18n';

/** Add custom categories, rename, hide/show (system categories are hidden, never deleted). */
export function CategoryManager({ lang }: { lang: Lang }) {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.get<Category[]>('/api/categories?all=1').then(setCats).catch(() => setErr(tr(lang, 'error')));
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    setErr(null);
    try {
      await api.post('/api/categories', { name: name.trim(), kind, icon: icon.trim() || null });
      setName('');
      setIcon('');
      await load();
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 400 ? tr(lang, 'categoryExists') : tr(lang, 'error'));
    }
  };
  const patch = async (c: Category, body: object) => {
    try {
      await api.patch(`/api/categories/${c.id}`, body);
      await load();
    } catch {
      setErr(tr(lang, 'error'));
    }
  };
  const rename = (c: Category) => {
    const next = window.prompt(tr(lang, 'rename'), c.name)?.trim();
    if (next && next !== c.name) void patch(c, { name: next });
  };

  const list = (cats ?? []).filter((c) => c.kind === kind);
  return (
    <>
      <div className="group-title">{tr(lang, 'categories')}</div>
      <div className="group">
        <div className="group-row">
          <div className="segmented" role="group">
            {(['expense', 'income'] as const).map((k) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{tr(lang, k)}</button>
            ))}
          </div>
        </div>
        {err && <div className="group-row"><p className="error" style={{ margin: 0 }}>{err}</p></div>}
        {list.map((c) => (
          <div className="group-row" key={c.id} style={c.hidden ? { opacity: 0.55 } : undefined}>
            <span className="icon-circle" aria-hidden style={{ fontSize: 17 }}>{c.icon ?? '🏷'}</span>
            <div className="label">
              {c.name}
              {c.hidden && <small>{tr(lang, 'hidden')}</small>}
            </div>
            <button className="icon-btn" onClick={() => rename(c)} aria-label={tr(lang, 'rename')} title={tr(lang, 'rename')}><Pencil size={16} /></button>
            <button className="icon-btn" onClick={() => patch(c, { hidden: !c.hidden })} aria-label={tr(lang, c.hidden ? 'show' : 'hide')} title={tr(lang, c.hidden ? 'show' : 'hide')}>
              {c.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
        ))}
        <div className="group-row">
          <input className="cat-icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏷" aria-label={tr(lang, 'icon')} maxLength={4} />
          <input className="cat-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(lang, 'newCategory')} aria-label={tr(lang, 'categoryName')} maxLength={40}
            onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn primary" onClick={add} aria-label={tr(lang, 'add')}><Plus size={18} aria-hidden /></button>
        </div>
      </div>
    </>
  );
}
