// Numbers are always 1,234.5 regardless of language (ТЗ, розділ 8).
const nf = (d: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const cache = new Map<number, Intl.NumberFormat>();
const get = (d: number) => {
  if (!cache.has(d)) cache.set(d, nf(d));
  return cache.get(d)!;
};
const MINUS = '−';

export function num(v: number, d = 0): string {
  if (!Number.isFinite(v)) return '–';
  const s = get(d).format(Math.abs(v));
  return v < -0.5 * Math.pow(10, -d) ? MINUS + s : s;
}
export function signed(v: number, d = 1): string {
  if (!Number.isFinite(v)) return '–';
  const r = Number(Math.abs(v).toFixed(d));
  if (r === 0) return get(d).format(0);
  return (v > 0 ? '+' : MINUS) + get(d).format(r);
}
export const pct = (v: number, d = 1) => (Number.isFinite(v) ? num(v * 100, d) + '%' : '–');
export const signedPct = (v: number, d = 1) => signed(v * 100, d) + '%';
export const mln = (v: number, d = 2) => num(v / 1e6, d);
export const pp = (v: number, d = 1) => signed(v * 100, d) + ' pp';
