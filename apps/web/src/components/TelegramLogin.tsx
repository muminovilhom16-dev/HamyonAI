import { useEffect, useRef } from 'react';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onHamyonTelegramAuth?: (user: TelegramUser) => void;
  }
}

/**
 * Official Telegram Login Widget. Works only on the domain set for the bot
 * with BotFather (/setdomain). The signed payload is verified server-side.
 */
export function TelegramLogin({ botUsername, onAuth }: { botUsername: string; onAuth: (u: TelegramUser) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.onHamyonTelegramAuth = onAuth;
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', botUsername);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '10');
    s.setAttribute('data-request-access', 'write');
    s.setAttribute('data-onauth', 'onHamyonTelegramAuth(user)');
    ref.current?.appendChild(s);
    const node = ref.current;
    return () => {
      delete window.onHamyonTelegramAuth;
      if (node) node.innerHTML = '';
    };
  }, [botUsername, onAuth]);
  return <div ref={ref} className="tg-widget" />;
}
