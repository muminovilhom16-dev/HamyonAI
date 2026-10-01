import type { Lang } from '../api';
import { navigate } from '../router';
import { copyFor, LangSwitch, Logo, useLandingLang, usePublic } from './shared';

const go = (path: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(path);
};

function Sparkle({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="lp-sparkle" style={style} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill="currentColor" />
    </svg>
  );
}

function RotatingBadge({ text }: { text: string }) {
  return (
    <div className="lp-badge" aria-hidden>
      <svg viewBox="0 0 120 120">
        <defs>
          <path id="lp-circle" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
        </defs>
        <text><textPath href="#lp-circle">{text.repeat(2)}</textPath></text>
      </svg>
      <span className="lp-badge-core">
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="4" y="8" width="16" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="13.5" r="1.4" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

/** Hero visual: the product itself — a chat turning a message into a card. */
function ChatMock({ lang }: { lang: Lang }) {
  const c = copyFor(lang).chat;
  return (
    <div className="lp-visual" aria-hidden>
      <div className="lp-goldcard">
        <div className="lp-goldcard-brand">Hamyon AI</div>
        <div className="lp-goldcard-chip" />
        <div className="lp-goldcard-num">•••• •••• •••• ••••</div>
      </div>
      <div className="lp-phone">
        <div className="lp-phone-bar"><span className="lp-dot" /> Hamyon AI</div>
        <div className="lp-msg you">{c.you[0]}</div>
        <div className="lp-msg bot">
          <b>{c.bot[0]!.amount}</b>
          <span>{c.bot[0]!.category}</span>
          <small>{c.bot[0]!.note}</small>
          <div className="lp-btns">
            {c.buttons.map((b) => <span key={b}>{b}</span>)}
          </div>
        </div>
        <div className="lp-msg you">{c.you[1]}</div>
        <div className="lp-msg bot small">
          <b>{c.bot[1]!.amount}</b>
          <span>{c.bot[1]!.category} · {c.bot[1]!.note}</span>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const [lang, setLang] = useLandingLang();
  const { botUrl, signedIn } = usePublic();
  const c = copyFor(lang);
  const start = botUrl ?? '/signup';

  return (
    <div className="landing">
      <header className="lp-header">
        <Logo />
        <nav className="lp-nav">
          <a href="#features">{c.nav.features}</a>
          <a href="#how">{c.nav.how}</a>
          <a href="#pricing">{c.nav.pricing}</a>
          <a href="#faq">{c.nav.faq}</a>
        </nav>
        <div className="lp-actions">
          <LangSwitch lang={lang} setLang={setLang} />
          {signedIn ? (
            <a className="lp-btn outline" href="/app" onClick={go('/app')}>{c.nav.cabinet}</a>
          ) : (
            <>
              <a className="lp-link" href="/login" onClick={go('/login')}>{c.nav.login}</a>
              <a className="lp-btn outline" href="/signup" onClick={go('/signup')}>{c.nav.signup}</a>
            </>
          )}
        </div>
      </header>

      <section className="lp-hero">
        <Sparkle style={{ top: '6%', left: '44%', width: 22 }} />
        <Sparkle style={{ top: '16%', right: '8%', width: 12 }} />
        <Sparkle style={{ bottom: '28%', left: '38%', width: 10 }} />
        <div className="lp-hero-text">
          <p className="lp-kicker">{c.hero.kicker}</p>
          <h1>{c.hero.title}</h1>
          <p className="lp-lead">{c.hero.text}</p>
          <div className="lp-cta-row">
            <a className="lp-btn gold" href={start}>{c.hero.primary}</a>
            <a className="lp-btn outline" href="#how">{c.hero.secondary}</a>
          </div>
        </div>
        <ChatMock lang={lang} />
        <div className="lp-hero-foot">
          <div className="lp-steps">
            {c.steps.map((s) => (
              <div key={s.n}>
                <div className="lp-step-n">{s.n}</div>
                <div className="lp-step-t">{s.title}</div>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <RotatingBadge text={c.badge} />
          <div className="lp-stat">
            <span className="lp-stat-v">{c.stat.value}</span>
            <span className="lp-stat-l">{c.stat.label}</span>
          </div>
        </div>
      </section>

      <section id="how" className="lp-section">
        <h2>{c.how.title}</h2>
        <p className="lp-sub">{c.how.text}</p>
        <div className="lp-grid3">
          {c.how.items.map((it, i) => (
            <div className="lp-card" key={it.title}>
              <div className="lp-step-n">{String(i + 1).padStart(2, '0')}</div>
              <h3>{it.title}</h3>
              <p>{it.text}</p>
              <code>{it.example}</code>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="lp-section">
        <h2>{c.features.title}</h2>
        <div className="lp-grid3">
          {c.features.items.map((f) => (
            <div className="lp-card" key={f.title}>
              <div className="lp-icon" aria-hidden>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="lp-section">
        <h2>{c.pricing.title}</h2>
        <p className="lp-sub">{c.pricing.text}</p>
        <div className="lp-grid2">
          <div className="lp-card lp-plan featured">
            <h3>{c.pricing.free.name}</h3>
            <div className="lp-price">{c.pricing.free.price}</div>
            <ul>{c.pricing.free.items.map((x) => <li key={x}>{x}</li>)}</ul>
            <a className="lp-btn gold block" href={start}>{c.pricing.free.cta}</a>
          </div>
          <div className="lp-card lp-plan">
            <h3>{c.pricing.pro.name}</h3>
            <div className="lp-price muted">{c.pricing.pro.price}</div>
            <ul>{c.pricing.pro.items.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="lp-note">{c.pricing.pro.note}</p>
          </div>
        </div>
      </section>

      <section id="faq" className="lp-section">
        <h2>{c.faq.title}</h2>
        <div className="lp-faq">
          {c.faq.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-section lp-final">
        <h2>{c.cta.title}</h2>
        <p className="lp-sub">{c.cta.text}</p>
        <a className="lp-btn gold" href={start}>{c.cta.button}</a>
      </section>

      <footer className="lp-footer">
        <Logo />
        <span>{c.footer.tagline}</span>
        {botUrl && <a href={botUrl}>{c.footer.contact}</a>}
        <span>© {new Date().getFullYear()} Hamyon AI</span>
      </footer>
    </div>
  );
}
