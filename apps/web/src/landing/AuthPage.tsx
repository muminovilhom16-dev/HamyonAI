import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { TelegramLogin, type TelegramUser } from '../components/TelegramLogin';
import { navigate } from '../router';
import { copyFor, LangSwitch, Logo, useLandingLang, usePublic } from './shared';

/**
 * Sign up / log in. Accounts are Telegram accounts: no phone, email or
 * password (TZ §14, §26). Two ways: the official Telegram Login Widget, or
 * the bot (/start to sign up, /web for a one-time login link).
 */
export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const [lang, setLang] = useLandingLang();
  const { bot, botUrl, signedIn } = usePublic();
  const [error, setError] = useState(false);
  const c = copyFor(lang).auth;

  useEffect(() => {
    if (signedIn) navigate('/app');
  }, [signedIn]);

  const onAuth = useCallback(async (user: TelegramUser) => {
    setError(false);
    try {
      await api.post('/auth/telegram', user);
      navigate('/app');
    } catch {
      setError(true);
    }
  }, []);

  const steps = mode === 'login' ? c.botLoginSteps : c.botSignupSteps;
  const botLink = botUrl ? (mode === 'signup' ? `${botUrl}?start=web` : botUrl) : null;

  return (
    <div className="landing lp-auth">
      <header className="lp-header">
        <Logo />
        <div className="lp-actions"><LangSwitch lang={lang} setLang={setLang} /></div>
      </header>
      <main className="lp-auth-main">
        <div className="lp-auth-card">
          <a className="lp-link small" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>{c.back}</a>
          <h1>{mode === 'login' ? c.loginTitle : c.signupTitle}</h1>
          <p className="lp-lead">{mode === 'login' ? c.loginText : c.signupText}</p>
          <p className="lp-pill">🔒 {c.noPhone}</p>
          {error && <p className="lp-error" role="alert">{c.failed}</p>}
          {bot && <TelegramLogin botUsername={bot} onAuth={onAuth} />}
          <p className="lp-hint">{c.widgetHint}</p>
          <div className="lp-divider"><span>{c.or}</span></div>
          <h2 className="lp-auth-h2">{mode === 'login' ? c.botLogin : c.botSignup}</h2>
          <ol className="lp-ol">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
          {botLink && <a className="lp-btn gold block" href={botLink}>{c.openBot}</a>}
          <a
            className="lp-link small center"
            href={mode === 'login' ? '/signup' : '/login'}
            onClick={(e) => { e.preventDefault(); navigate(mode === 'login' ? '/signup' : '/login'); }}
          >
            {mode === 'login' ? c.noAccount : c.haveAccount}
          </a>
        </div>
      </main>
    </div>
  );
}
