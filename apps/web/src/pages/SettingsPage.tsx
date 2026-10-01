import { useState } from 'react';
import { api, type Lang, type Settings } from '../api';
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
    <>
    {settings.deletionScheduledFor && (
      <section className="card" style={{ marginBottom: 12, borderColor: 'var(--critical)' }} role="alert">
        <p style={{ marginTop: 0 }}>{tr(lang, 'scheduledDeletion')} <b>{day(settings.deletionScheduledFor, lang)}</b></p>
        <button className="btn" onClick={cancelDeletion}>{tr(lang, 'cancelDeletion')}</button>
      </section>
    )}
    <section className="card">
      {status === 'saved' && <p className="small" role="status">✓ {tr(lang, 'saved')}</p>}
      {status === 'error' && <p className="error">{tr(lang, 'error')}</p>}
      <div className="field">
        <label htmlFor="lang">{tr(lang, 'language')}</label>
        <select id="lang" value={lang} onChange={(e) => update({ language: e.target.value as Lang })}>
          <option value="uz_latn">O'zbekcha</option>
          <option value="uz_cyrl">Ўзбекча</option>
          <option value="ru">Русский</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="cur">{tr(lang, 'currency')}</label>
        <select id="cur" value={settings.currency} onChange={(e) => update({ currency: e.target.value as Settings['currency'] })}>
          <option value="UZS">UZS</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="field">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={settings.remindersEnabled} onChange={(e) => update({ remindersEnabled: e.target.checked })} />
          {tr(lang, 'reminder')}
        </label>
      </div>
      <div className="field">
        <label htmlFor="rt">{tr(lang, 'reminderTime')}</label>
        <input
          id="rt"
          type="time"
          value={settings.reminderTime}
          disabled={!settings.remindersEnabled}
          onChange={(e) => e.target.value && update({ reminderTime: e.target.value })}
        />
      </div>
      <p className="small muted">{settings.timezone}</p>
      <button className="btn" onClick={logout}>{tr(lang, 'logout')}</button>
    </section>

    <section className="card" style={{ marginTop: 12 }}>
      <div className="panel-title"><span>{tr(lang, 'exportTitle')}</span></div>
      <p className="small muted" style={{ marginTop: 0 }}>{tr(lang, 'exportHint')}</p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label={tr(lang, 'exportTitle')} className="btn">
          <option value="m">{tr(lang, 'month')}</option>
          <option value="p">{tr(lang, 'prevMonth')}</option>
          <option value="a">{tr(lang, 'all')}</option>
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} aria-label="format" className="btn">
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="csv">CSV</option>
        </select>
        <a className="btn primary" href={exportUrl} download style={{ textAlign: 'center', textDecoration: 'none' }}>{tr(lang, 'download')}</a>
      </div>
    </section>

    {!settings.deletionScheduledFor && (
      <section className="card" style={{ marginTop: 12 }}>
        <div className="panel-title"><span>{tr(lang, 'dangerTitle')}</span></div>
        <p className="small muted" style={{ marginTop: 0 }}>{tr(lang, 'dangerText').replace('{days}', String(settings.deletionGraceDays))}</p>
        {confirming ? (
          <div className="row">
            <button className="btn" onClick={() => setConfirming(false)}>{tr(lang, 'cancel')}</button>
            <button className="btn danger" onClick={deleteAccount}>{tr(lang, 'confirmDelete')}</button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setConfirming(true)}>{tr(lang, 'deleteAccount')}</button>
        )}
      </section>
    )}
    </>
  );
}
