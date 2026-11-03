// Charts in ISO 24896 notation (Octopus ChartNotation): neutral three-line title, scenario by fill
// (model results are forecasts = FC, hatched), square marks, zero-based value axes, direct labels,
// colour only for good / bad and one highlight.
import React from 'react';
import { num, signed } from './format';

export interface Title {
  entity: string;
  measure: string;
  scenario: string;
}

export function ChartTitle({ t }: { t: Title }) {
  return (
    <p className="oc-chart-title">
      <b>{t.entity}</b>
      <span>{t.measure}</span>
      <span>{t.scenario}</span>
    </p>
  );
}

function Hatch() {
  return (
    <defs>
      <pattern id="oc-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill="var(--surface-raised)" />
        <line x1="0" y1="0" x2="0" y2="4" stroke="var(--chart-fc)" strokeWidth="1.5" />
      </pattern>
    </defs>
  );
}

/** Time series, columns left to right. */
export function Columns({ title, labels, values, decimals = 1, highlight, height = 220, hatched = true }: {
  title: Title; labels: string[]; values: number[]; decimals?: number; highlight?: number; height?: number; hatched?: boolean;
}) {
  const W = 760, top = 22, bottom = 26, H = height;
  const max = Math.max(0, ...values), min = Math.min(0, ...values);
  const span = max - min || 1;
  const plotH = H - top - bottom;
  const y = (v: number) => top + ((max - v) / span) * plotH;
  const step = W / values.length;
  const bw = Math.max(2, Math.min(36, step * 0.62));
  const showAll = values.length <= 30;
  return (
    <figure className="oc-chart">
      <ChartTitle t={title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title.entity}, ${title.measure}`}>
        <Hatch />
        {values.map((v, i) => {
          const x = i * step + (step - bw) / 2;
          const y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
          const fill = i === highlight ? 'var(--chart-highlight)' : hatched ? 'url(#oc-hatch)' : 'var(--chart-ac)';
          const labelY = v >= 0 ? y0 - 5 : y0 + h + 12;
          return (
            <g key={i}>
              <rect x={x} y={y0} width={bw} height={Math.max(h, 0.5)} fill={fill} stroke="var(--chart-fc)" strokeWidth={hatched ? 1 : 0} />
              {(showAll || i % Math.ceil(values.length / 30) === 0) && v !== 0 && (
                <text x={x + bw / 2} y={labelY} textAnchor="middle">{num(v, decimals)}</text>
              )}
              {(showAll || i % Math.ceil(values.length / 15) === 0) && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="lbl-muted">{labels[i]}</text>
              )}
            </g>
          );
        })}
        <line className="axis" x1="0" x2={W} y1={y(0)} y2={y(0)} />
      </svg>
    </figure>
  );
}

/** Structure: horizontal bars, top to bottom, sorted by value unless `keepOrder`. */
export function Bars({ title, items, decimals = 1, keepOrder = false, highlight }: {
  title: Title; items: { label: string; value: number }[]; decimals?: number; keepOrder?: boolean; highlight?: string;
}) {
  const rows = keepOrder ? items : [...items].sort((a, b) => b.value - a.value);
  const W = 760, rowH = 26, labelW = 300, H = rows.length * rowH + 8;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  const x = (v: number) => (Math.abs(v) / max) * (W - labelW - 80);
  return (
    <figure className="oc-chart">
      <ChartTitle t={title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title.entity}, ${title.measure}`}>
        <Hatch />
        {rows.map((r, i) => (
          <g key={r.label} transform={`translate(0 ${i * rowH + 4})`}>
            <text x={labelW - 10} y={rowH / 2 + 4} textAnchor="end">{r.label}</text>
            <rect x={labelW} y={4} width={Math.max(x(r.value), 0.5)} height={rowH - 10}
              fill={r.label === highlight ? 'var(--chart-highlight)' : 'url(#oc-hatch)'} stroke="var(--chart-fc)" strokeWidth="1" />
            <text x={labelW + x(r.value) + 6} y={rowH / 2 + 4}>{num(r.value, decimals)}</text>
          </g>
        ))}
        <line className="axis" x1={labelW} x2={labelW} y1="0" y2={H} />
      </svg>
    </figure>
  );
}

/** 12 × 24 heatmap with one-hue sequential scale. */
export function Heatmap12x24({ title, m, decimals = 2, unit }: { title: Title; m: number[][]; decimals?: number; unit: string }) {
  const W = 760, left = 40, top = 18, cw = (W - left - 8) / 24, ch = 18;
  const flat = m.flat();
  const lo = Math.min(...flat), hi = Math.max(...flat);
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  return (
    <figure className="oc-chart">
      <ChartTitle t={title} />
      <svg viewBox={`0 0 ${W} ${top + 12 * ch + 30}`} role="img" aria-label={`${title.entity}, ${title.measure}`}>
        {Array.from({ length: 24 }, (_, h) => (
          <text key={h} x={left + h * cw + cw / 2} y={12} textAnchor="middle" className="lbl-muted">{h + 1}</text>
        ))}
        {m.map((row, i) => (
          <g key={i}>
            <text x={left - 6} y={top + i * ch + ch / 2 + 4} textAnchor="end" className="lbl-muted">{months[i]}</text>
            {row.map((v, h) => {
              const a = 0.08 + 0.92 * ((v - lo) / (hi - lo || 1));
              return (
                <rect key={h} x={left + h * cw + 0.5} y={top + i * ch + 0.5} width={cw - 1} height={ch - 1}
                  fill={`rgba(var(--chart-seq), ${a.toFixed(3)})`}>
                  <title>{`${months[i]}, ${h + 1}: ${num(v, decimals)} ${unit}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
        <text x={left} y={top + 12 * ch + 20} className="lbl-muted">{`${num(lo, decimals)} – ${num(hi, decimals)} ${unit}`}</text>
      </svg>
    </figure>
  );
}

/** Waterfall: start and end solid FC, steps good/bad with signed labels. */
export function Waterfall({ title, steps, decimals = 1, scale = 100 }: {
  title: Title; steps: { label: string; value?: number; delta?: number }[]; decimals?: number; scale?: number;
}) {
  const W = 760, H = 240, top = 22, bottom = 30;
  let run = 0;
  const bars = steps.map((s) => {
    if (s.value !== undefined) { run = s.value; return { ...s, from: 0, to: s.value, total: true }; }
    const from = run; run += s.delta!;
    return { ...s, from, to: run, total: false };
  });
  const max = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)));
  const min = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const y = (v: number) => top + ((max - v) / (max - min || 1)) * (H - top - bottom);
  const step = W / bars.length, bw = Math.min(90, step * 0.6);
  return (
    <figure className="oc-chart">
      <ChartTitle t={title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title.entity}, ${title.measure}`}>
        <Hatch />
        {bars.map((b, i) => {
          const x = i * step + (step - bw) / 2;
          const y1 = y(Math.max(b.from, b.to)), h = Math.abs(y(b.from) - y(b.to));
          const good = (b.delta ?? 0) >= 0;
          const fill = b.total ? 'url(#oc-hatch)' : good ? 'var(--good)' : 'var(--bad)';
          const lab = b.total ? num(b.to * scale, decimals) : signed(b.delta! * scale, decimals);
          return (
            <g key={i}>
              <rect x={x} y={y1} width={bw} height={Math.max(h, 0.5)} fill={fill} stroke={b.total ? 'var(--chart-fc)' : 'none'} />
              <text x={x + bw / 2} y={y1 - 5} textAnchor="middle" className={b.total ? '' : good ? 'oc-good' : 'oc-bad'}>{lab}</text>
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="lbl-muted">{b.label}</text>
              {i < bars.length - 1 && <line x1={x + bw} x2={x + step} y1={y(b.to)} y2={y(b.to)} stroke="var(--border-strong)" strokeDasharray="2 2" />}
            </g>
          );
        })}
        <line className="axis" x1="0" x2={W} y1={y(0)} y2={y(0)} />
      </svg>
    </figure>
  );
}

/** Two-way sensitivity grid: values versus a threshold, good / bad with signs, no hue-only meaning. */
export function SensGrid({ title, rowLabels, colLabels, m, threshold, rowHead, colHead }: {
  title: Title; rowLabels: string[]; colLabels: string[]; m: number[][]; threshold: number; rowHead: string; colHead: string;
}) {
  return (
    <figure className="oc-chart">
      <ChartTitle t={title} />
      <table className="oc-table sens">
        <thead>
          <tr><th>{rowHead} \ {colHead}</th>{colLabels.map((c) => <th key={c} className="n">{c}</th>)}</tr>
        </thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={i}>
              <td>{rowLabels[i]}</td>
              {row.map((v, j) => {
                const ok = v >= threshold;
                return (
                  <td key={j} className={`n ${ok ? 'oc-good' : 'oc-bad'}`} style={{ background: ok ? 'color-mix(in srgb, var(--good) 12%, transparent)' : 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>
                    {Number.isFinite(v) ? `${ok ? '▲' : '▼'} ${num(v * 100, 1)}%` : '–'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Line over time with an optional threshold rule (FC lines dashed). */
export function Lines({ title, labels, series, threshold, decimals = 1 }: {
  title: Title; labels: string[]; series: { name: string; values: number[] }[]; threshold?: { value: number; label: string }; decimals?: number;
}) {
  const W = 760, H = 220, top = 22, bottom = 26, left = 8, right = 70;
  const all = series.flatMap((s) => s.values).concat(threshold ? [threshold.value] : []);
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const n = labels.length;
  const x = (i: number) => left + (i / Math.max(1, n - 1)) * (W - left - right);
  const y = (v: number) => top + ((max - v) / (max - min || 1)) * (H - top - bottom);
  return (
    <figure className="oc-chart">
      <ChartTitle t={title} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title.entity}, ${title.measure}`}>
        {threshold && (
          <g>
            <line x1={left} x2={W - right} y1={y(threshold.value)} y2={y(threshold.value)} className="axis" />
            <text x={W - right + 4} y={y(threshold.value) + 4} className="lbl-muted">{threshold.label}</text>
          </g>
        )}
        {series.map((s, k) => (
          <g key={s.name}>
            <polyline fill="none" stroke={k === 0 ? 'var(--chart-fc)' : 'var(--chart-shade-3)'} strokeWidth="1.75" strokeDasharray="5 3"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            <text x={x(n - 1) + 4} y={y(s.values[n - 1]) + 4}>{s.name}</text>
            {s.values.map((v, i) => (i === 0 || i === n - 1 || n <= 12) && (
              <text key={i} x={x(i)} y={y(v) - 6} textAnchor="middle">{num(v, decimals)}</text>
            ))}
          </g>
        ))}
        {labels.map((l, i) => (n <= 15 || i % Math.ceil(n / 15) === 0) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="lbl-muted">{l}</text>
        ))}
        <line className="axis" x1={left} x2={W - right} y1={y(0)} y2={y(0)} />
      </svg>
    </figure>
  );
}
