import { useEffect, useState } from 'react';
import { api, ApiError, type Lang, type Settings } from './api';
import { navigate } from './router';
import { tr, type Key } from './i18n';
import { DashboardPage } from './pages/DashboardPage';
import { DebtsPage } from './pages/DebtsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

type Tab = 'dashboard' | 'records' | 'debts' | 'settings';
const TABS: Tab[] = ['dashboard', 'records', 'debts', 'settings'];

const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1) as Tab;
  return TABS.includes(h) ? h : 'dashboard';
};

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'error'>('loading');
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    api
      .get<Settings>('/api/settings')
      .then((s) => {
        setSettings(s);
        setState('ready');
      })
      .catch((e) => setState(e instanceof ApiError && e.status === 401 ? 'login' : 'error'));
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (state === 'login') navigate('/login');
  }, [state]);

  const browserLang: Lang = navigator.language.startsWith('ru') ? 'ru' : 'uz_latn';
  if (state === 'loading') return null;
  if (state === 'login') return null;
  if (state === 'error' || !settings) return <main className="center"><p className="error">{tr(browserLang, 'error')}</p></main>;

  const lang = settings.language;
  document.documentElement.lang = lang === 'ru' ? 'ru' : 'uz';
  const go = (t: Tab) => {
    window.location.hash = t;
    setTab(t);
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} style={{ color: 'inherit', textDecoration: 'none' }}>Hamyon AI</a>
        <span className="muted small">{settings.displayName}</span>
      </header>
      <nav className="nav" aria-label="Hamyon AI">
        {TABS.map((t) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => go(t)}>
            {tr(lang, t as Key)}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'dashboard' && <DashboardPage lang={lang} />}
        {tab === 'records' && <TransactionsPage lang={lang} />}
        {tab === 'debts' && <DebtsPage lang={lang} />}
        {tab === 'settings' && <SettingsPage settings={settings} onChange={setSettings} />}
      </main>
    </div>
  );
}
