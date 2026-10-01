import { useState } from 'react';
import { api, type Lang, type Settings } from '../api';
import { tr } from '../i18n';

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

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    window.location.reload();
  };

  return (
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
  );
}
