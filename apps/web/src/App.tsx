import { useEffect, useState } from 'react';
import { HandCoins, LayoutDashboard, ReceiptText, Settings as SettingsIcon } from 'lucide-react';
import { api, ApiError, type Lang, type Settings } from './api';
import { navigate } from './router';
import { tr } from './i18n';
import { DashboardPage } from './pages/DashboardPage';
import { DebtsPage } from './pages/DebtsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

export type Tab = 'dashboard' | 'records' | 'debts' | 'settings';
const TABS = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'records', icon: ReceiptText },
  { id: 'debts', icon: HandCoins },
  { id: 'settings', icon: SettingsIcon },
] as const;

const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'dashboard';
};

export const initials = (name: string | null | undefined) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'H';

function Logo() {
  return (
    <a className="logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
      <span className="logo-mark" aria-hidden>H</span>
      Hamyon AI
    </a>
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

  useEffect(() => {
    if (state === 'login') navigate('/login');
  }, [state]);

  const browserLang: Lang = navigator.language.startsWith('ru') ? 'ru' : 'uz_latn';
  if (state === 'loading' || state === 'login') return null;
  if (state === 'error' || !settings) return <main className="center"><p className="error">{tr(browserLang, 'error')}</p></main>;

  const lang = settings.language;
  document.documentElement.lang = lang === 'ru' ? 'ru' : 'uz';
  const go = (t: Tab) => {
    window.location.hash = t;
    setTab(t);
    window.scrollTo(0, 0);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <span className="avatar" title={settings.displayName ?? ''}>{initials(settings.displayName)}</span>
      </header>
      <nav className="nav" aria-label="Hamyon AI">
        <div className="nav-logo"><Logo /></div>
        {TABS.map(({ id, icon: Icon }) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
            <Icon aria-hidden strokeWidth={tab === id ? 2.3 : 1.8} />
            <span>{tr(lang, id)}</span>
          </button>
        ))}
        <div className="nav-user">
          <span className="avatar">{initials(settings.displayName)}</span>
          <span className="small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {settings.displayName}
          </span>
        </div>
      </nav>
      <main className="main">
        <h1 className="page-title">{tr(lang, tab)}</h1>
        {tab === 'dashboard' && <DashboardPage lang={lang} onSeeAll={() => go('records')} />}
        {tab === 'records' && <TransactionsPage lang={lang} currency={settings.currency} />}
        {tab === 'debts' && <DebtsPage lang={lang} currency={settings.currency} />}
        {tab === 'settings' && <SettingsPage settings={settings} onChange={setSettings} />}
      </main>
    </div>
  );
}
