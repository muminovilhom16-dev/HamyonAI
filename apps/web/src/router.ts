import { useEffect, useState } from 'react';

/** Minimal pathname router: "/", "/login", "/signup", "/app". */
export function navigate(path: string): void {
  if (window.location.pathname + window.location.hash === path) return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

/** Per-viewer convenience only; storage may be unavailable. */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}
