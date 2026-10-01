import { useEffect, useRef, useState } from 'react';
import type { Dashboard, Lang } from '../api';
import { compact, day, money } from '../format';
import { tr } from '../i18n';

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Daily expense bars: equal intervals, zero days shown, straight bars (no curves). */
export function Bars({ daily, lang }: { daily: Dashboard['daily']; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 180;
  const padL = 48;
  const padB = 22;
  const padT = 8;
  const plotW = width - padL - 4;
  const plotH = height - padB - padT;
  const max = niceMax(Math.max(...daily.map((d) => d.expenseUzs), 0));
  const band = plotW / Math.max(daily.length, 1);
  const barW = Math.max(2, Math.min(28, band - 2)); // ≥2px gap between bars
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(daily.length / 7);
  const year = daily[0]?.date.slice(0, 4);

  return (
    <div>
      <div className="panel-title">
        <span>{tr(lang, 'dynamics')}</span>
        <button className="linkbtn" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {tr(lang, 'tableView')}
        </button>
      </div>
      {table ? (
        <table className="data">
          <thead>
            <tr><th>{tr(lang, 'date')}</th><th className="r">{tr(lang, 'expense')}</th></tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date}><td>{day(d.date, lang, year)}</td><td className="r num">{money(d.expenseUzs, 'UZS', lang)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap" ref={ref}>
          <svg width={width} height={height} role="img" aria-label={tr(lang, 'dynamics')}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line className="gridline" x1={padL} x2={width} y1={y(max * f)} y2={y(max * f)} />
                <text className="axis" x={padL - 6} y={y(max * f) + 4} textAnchor="end">{compact(max * f, lang)}</text>
              </g>
            ))}
            {daily.map((d, i) => {
              const x = padL + i * band + (band - barW) / 2;
              const h = Math.max(0, y(0) - y(d.expenseUzs));
              const r = Math.min(4, barW / 2, h);
              const top = y(0) - h;
              return (
                <g key={d.date}>
                  {h > 0 && (
                    <path
                      d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                      fill="var(--series-1)"
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {/* Hit target wider and taller than the mark. */}
                  <rect
                    x={padL + i * band}
                    y={padT}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${day(d.date, lang, year)}: ${money(d.expenseUzs, 'UZS', lang)}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  />
                  {i % labelEvery === 0 && (
                    <text className="axis" x={padL + i * band + band / 2} y={height - 6} textAnchor="middle">
                      {Number(d.date.slice(8))}
                    </text>
                  )}
                </g>
              );
            })}
            <line stroke="var(--text-3)" x1={padL} x2={width} y1={y(0)} y2={y(0)} />
          </svg>
          {hover !== null && daily[hover] && (
            <div className="tooltip" style={{ left: padL + hover * band + band / 2, top: y(daily[hover]!.expenseUzs) - 6 }}>
              {day(daily[hover]!.date, lang, year)}: {money(daily[hover]!.expenseUzs, 'UZS', lang)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
