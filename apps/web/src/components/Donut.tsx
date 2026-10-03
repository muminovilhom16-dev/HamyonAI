import { useState } from 'react';
import type { Dashboard, Lang } from '../api';
import { compact, money, percent } from '../format';
import { tr } from '../i18n';

/** Fixed categorical order; slots beyond 6 fold into a neutral "Others". */
const SLOTS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'];
const MAX_SLICES = SLOTS.length;

export interface Slice { key: string; name: string; icon: string | null; totalUzs: number; percentTenths: number; color: string }

/** Server percentages already sum to 100.0; folding only adds them up. */
export function toSlices(rows: Dashboard['byCategory'], lang: Lang): Slice[] {
  const head = rows.length > MAX_SLICES ? rows.slice(0, MAX_SLICES - 1) : rows;
  const tail = rows.slice(head.length);
  const slices = head.map((r, i) => ({
    key: r.categoryId ?? 'none',
    name: r.name,
    icon: r.icon,
    totalUzs: r.totalUzs,
    percentTenths: r.percentTenths,
    color: SLOTS[i]!,
  }));
  if (tail.length) {
    slices.push({
      key: 'others',
      name: tr(lang, 'others'),
      icon: '…',
      totalUzs: tail.reduce((a, r) => a + r.totalUzs, 0),
      percentTenths: tail.reduce((a, r) => a + r.percentTenths, 0),
      color: 'var(--neutral-fill)',
    });
  }
  return slices;
}

export function Donut({ rows, totalUzs, lang }: { rows: Dashboard['byCategory']; totalUzs: number; lang: Lang }) {
  const [active, setActive] = useState<string | null>(null);
  const slices = toSlices(rows, lang);
  const size = 184;
  const r = 70;
  const stroke = 20;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2 : 0; // 2px surface gap between segments
  let offset = 0;
  const hovered = slices.find((s) => s.key === active);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={tr(lang, 'byCategory')}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((s) => {
              const len = (s.percentTenths / 1000) * c;
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === s.key ? stroke + 4 : stroke}
                  strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
                  strokeDashoffset={-offset}
                  onMouseEnter={() => setActive(s.key)}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>{`${s.name}: ${money(s.totalUzs, 'UZS', lang)} (${percent(s.percentTenths)})`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
          </g>
          <text x="50%" y="47%" textAnchor="middle" fontSize="12" fill="var(--text-2)">
            {hovered ? hovered.name.slice(0, 18) : tr(lang, 'expense')}
          </text>
          <text x="50%" y="60%" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)">
            {compact(hovered ? hovered.totalUzs : totalUzs, lang)}
          </text>
        </svg>
      </div>
      {/* Legend: color dot + icon + name, amount and share — identity never relies on color alone. */}
      <ul className="legend">
        {slices.map((s) => (
          <li
            key={s.key}
            data-active={active === s.key}
            tabIndex={0}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(s.key)}
            onBlur={() => setActive(null)}
          >
            <span className="icon-circle" aria-hidden>
              {s.icon ?? '🏷'}
              <span className="dot" style={{ background: s.color }} />
            </span>
            <span className="name">{s.name}</span>
            <span className="amt num">{money(s.totalUzs, 'UZS', lang)}</span>
            <span className="meter">
              <span className="track"><span className="fill" style={{ display: 'block', width: `${s.percentTenths / 10}%`, background: s.color }} /></span>
              <span className="pct num">{percent(s.percentTenths)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
