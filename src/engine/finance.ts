// Date-based discounting, same conventions as Excel XNPV / XIRR (actual days / 365, base = first date).

export function daysBetween(a: string, b: string): number {
  return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000;
}

export function xnpv(rate: number, flows: number[], dates: string[]): number {
  const d0 = dates[0];
  let s = 0;
  for (let i = 0; i < flows.length; i++) {
    if (flows[i] === 0) continue;
    s += flows[i] / Math.pow(1 + rate, daysBetween(d0, dates[i]) / 365);
  }
  return s;
}

/** XIRR by bisection on [-0.99, 10]; NaN when the flows never change sign. */
export function xirr(flows: number[], dates: string[]): number {
  const hasNeg = flows.some((v) => v < 0);
  const hasPos = flows.some((v) => v > 0);
  if (!hasNeg || !hasPos) return NaN;
  let lo = -0.99;
  let hi = 10;
  let flo = xnpv(lo, flows, dates);
  const fhi = xnpv(hi, flows, dates);
  if (flo * fhi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = xnpv(mid, flows, dates);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Last day of the month that starts `offset` months after `start` (yyyy-mm-01). */
export function monthEnd(start: string, offset: number): string {
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7)) - 1 + offset;
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Calendar month (1..12) and year of timeline month t (1-based). */
export function calMonth(start: string, t: number): { year: number; month: number } {
  const y = Number(start.slice(0, 4));
  const m0 = Number(start.slice(5, 7)) - 1 + (t - 1);
  return { year: y + Math.floor(m0 / 12), month: (m0 % 12) + 1 };
}

/** Months to payback, interpolated within the month the cumulative flow turns non-negative. */
export function paybackMonths(flows: number[]): number {
  let cum = 0;
  for (let i = 0; i < flows.length; i++) {
    const prev = cum;
    cum += flows[i];
    if (cum >= 0 && prev < 0 && i > 0) {
      return i + (flows[i] === 0 ? 0 : -prev / flows[i]);
    }
  }
  return NaN;
}
