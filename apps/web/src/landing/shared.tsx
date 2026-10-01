import { useEffect, useState } from 'react';
import { api, type Lang } from '../api';
import { navigate, readPref, writePref } from '../router';
import { COPY } from './copy';

export function useLandingLang(): [Lang, (l: Lang) => void] {
  const initial = (): Lang => {
    const saved = readPref('hamyon.lang');
    if (saved === 'uz_latn' || saved === 'uz_cyrl' || saved === 'ru') return saved;
    return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'uz_latn';
  };
  const [lang, setLang] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang === 'ru' ? 'ru' : 'uz';
  }, [lang]);
  return [lang, (l) => { writePref('hamyon.lang', l); setLang(l); }];
}

export function usePublic() {
  const [bot, setBot] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    api.get<{ botUsername: string | null }>('/api/public').then((r) => setBot(r.botUsername)).catch(() => {});
    api.get('/api/settings').then(() => setSignedIn(true)).catch(() => setSignedIn(false));
  }, []);
  return { bot, signedIn, botUrl: bot ? `https://t.me/${bot}` : null };
}

export function Logo() {
  return (
    <a className="lp-logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
      Hamyon<span>AI</span>
      <svg viewBox="0 0 64 8" aria-hidden><path d="M2 6 Q32 0 62 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </a>
  );
}

export function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <select className="lp-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Til / Язык">
      <option value="uz_latn">O‘z</option>
      <option value="uz_cyrl">Ўз</option>
      <option value="ru">Ру</option>
    </select>
  );
}

export const copyFor = (lang: Lang) => COPY[lang];
