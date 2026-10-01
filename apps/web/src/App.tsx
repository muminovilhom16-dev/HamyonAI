import { useEffect, useState } from 'react';
import { api, ApiError, type Lang, type Settings } from './api';
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

function Login({ lang }: { lang: Lang }) {
  const [bot, setBot] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ botUsername: string | null }>('/api/public').then((r) => setBot(r.botUsername)).catch(() => {});
  }, []);
  return (
    <main className="center">
      <div className="login">
        <h1>{tr(lang, 'loginTitle')}</h1>
        <p className="muted">{tr(lang, 'loginHint')}</p>
        {bot && (
          <a className="btn primary" href={`https://t.me/${bot}`}>
            {tr(lang, 'openBot')}
          </a>
        )}
      </div>
    </main>
  );
}

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

  const browserLang: Lang = navigator.language.startsWith('ru') ? 'ru' : 'uz_latn';
  if (state === 'loading') return null;
  if (state === 'login') return <Login lang={browserLang} />;
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
        <span className="brand">Hamyon AI</span>
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
