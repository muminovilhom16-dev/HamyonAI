import { useEffect, useState } from 'react';
import { Bell, CalendarRange, Clock, Coins, Download, FileSpreadsheet, Globe, LogOut, Trash2, TriangleAlert } from 'lucide-react';
import { api, type Lang, type Settings } from '../api';
import { initials } from '../App';
import { day } from '../format';
import { tr } from '../i18n';

function monthRange(offset: number): { start: string; end: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(first), end: iso(last) };
}

export function SettingsPage({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const lang = settings.language;
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  useEffect(() => {
    if (status !== 'saved') return;
    const t = window.setTimeout(() => setStatus('idle'), 2000);
    return () => window.clearTimeout(t);
  }, [status]);

  const update = async (patch: Partial<Settings>) => {
    try {
      const r = await api.patch<Partial<Settings>>('/api/settings', patch);
      onChange({ ...settings, ...r });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  const [range, setRange] = useState<'m' | 'p' | 'a'>('m');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [confirming, setConfirming] = useState(false);
  const exportUrl = (() => {
    const p = new URLSearchParams({ format });
    if (range !== 'a') {
      const r = monthRange(range === 'm' ? 0 : -1);
      p.set('start', r.start);
      p.set('end', r.end);
    }
    return `/api/export?${p}`;
  })();

  const deleteAccount = async () => {
    try {
      await api.post('/api/account/delete', { confirm: true });
      window.location.assign('/');
    } catch {
      setStatus('error');
    }
  };
  const cancelDeletion = async () => {
    try {
      await api.post('/api/account/cancel-deletion');
      onChange({ ...settings, deletionScheduledFor: null });
    } catch {
      setStatus('error');
    }
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    window.location.assign('/');
  };

  return (
    <section style={{ maxWidth: 680 }}>
      {status === 'saved' && <div className="saved-pill" role="status">✓ {tr(lang, 'saved')}</div>}
      {status === 'error' && <p className="error">{tr(lang, 'error')}</p>}
      {settings.deletionScheduledFor && (
        <div className="notice" role="alert">
          <TriangleAlert size={20} aria-hidden />
          <div style={{ flex: 1 }}>
            <div>{tr(lang, 'scheduledDeletion')} <b>{day(settings.deletionScheduledFor, lang)}</b></div>
            <button className="btn" style={{ marginTop: 10 }} onClick={cancelDeletion}>{tr(lang, 'cancelDeletion')}</button>
          </div>
        </div>
      )}

      <div className="group-title">{tr(lang, 'profile')}</div>
      <div className="group">
        <div className="group-row">
          <span className="avatar lg" aria-hidden>{initials(settings.displayName)}</span>
          <div className="label">
            <b>{settings.displayName}</b>
            <small>{tr(lang, 'timezone')}: {settings.timezone}</small>
          </div>
        </div>
      </div>

      <div className="group-title">{tr(lang, 'preferences')}</div>
      <div className="group">
        <div className="group-row">
          <span className="icon-circle" aria-hidden><Globe /></span>
          <label className="label" htmlFor="lang">{tr(lang, 'language')}</label>
          <select id="lang" value={lang} onChange={(e) => update({ language: e.target.value as Lang })}>
            <option value="uz_latn">O'zbekcha</option>
            <option value="uz_cyrl">Ўзбекча</option>
            <option value="ru">Русский</option>
          </select>
        </div>
        <div className="group-row">
          <span className="icon-circle" aria-hidden><Coins /></span>
          <label className="label" htmlFor="cur">{tr(lang, 'currency')}</label>
          <select id="cur" value={settings.currency} onChange={(e) => update({ currency: e.target.value as Settings['currency'] })}>
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className="group-row">
          <span className="icon-circle" aria-hidden><Bell /></span>
          <label className="label" htmlFor="rem">{tr(lang, 'reminder')}</label>
          <span className="switch">
            <input id="rem" type="checkbox" role="switch" checked={settings.remindersEnabled} onChange={(e) => update({ remindersEnabled: e.target.checked })} />
            <span aria-hidden />
          </span>
        </div>
        <div className="group-row">
          <span className="icon-circle" aria-hidden><Clock /></span>
          <label className="label" htmlFor="rt">{tr(lang, 'reminderTime')}</label>
          <input
            id="rt"
            type="time"
            value={settings.reminderTime}
            disabled={!settings.remindersEnabled}
            onChange={(e) => e.target.value && update({ reminderTime: e.target.value })}
          />
        </div>
      </div>

      <div className="group-title">{tr(lang, 'exportTitle')}</div>
      <div className="group">
        <div className="group-row">
          <span className="icon-circle" aria-hidden><CalendarRange /></span>
          <label className="label" htmlFor="ex-range">{tr(lang, 'period')}</label>
          <select id="ex-range" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            <option value="m">{tr(lang, 'month')}</option>
            <option value="p">{tr(lang, 'prevMonth')}</option>
            <option value="a">{tr(lang, 'all')}</option>
          </select>
        </div>
        <div className="group-row">
          <span className="icon-circle" aria-hidden><FileSpreadsheet /></span>
          <label className="label" htmlFor="ex-format">{tr(lang, 'format')}</label>
          <select id="ex-format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <div className="group-row">
          <a className="btn primary block" href={exportUrl} download>
            <Download size={18} aria-hidden />
            {tr(lang, 'download')}
          </a>
        </div>
      </div>

      <div className="group-title">{tr(lang, 'account')}</div>
      <div className="group">
        <div className="group-row">
          <button className="btn block" onClick={logout}>
            <LogOut size={18} aria-hidden />
            {tr(lang, 'logout')}
          </button>
        </div>
      </div>

      {!settings.deletionScheduledFor && (
        <>
          <div className="group-title">{tr(lang, 'dangerTitle')}</div>
          <div className="group danger-zone">
            <div className="group-row" style={{ display: 'block' }}>
              <p className="small muted" style={{ marginTop: 0 }}>{tr(lang, 'dangerText').replace('{days}', String(settings.deletionGraceDays))}</p>
              {confirming ? (
                <div className="row">
                  <button className="btn" onClick={() => setConfirming(false)}>{tr(lang, 'cancel')}</button>
                  <button className="btn danger solid" onClick={deleteAccount}>{tr(lang, 'confirmDelete')}</button>
                </div>
              ) : (
                <button className="btn danger" onClick={() => setConfirming(true)}>
                  <Trash2 size={16} aria-hidden />
                  {tr(lang, 'deleteAccount')}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
