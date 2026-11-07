import { describe, expect, it } from 'vitest';
import { CAL, computeSite, curveById, defaultSiteConfig, hubDensity, mastHourly, parseMast, powerKW, siteStale, type Era5Series, type SiteConfig } from '../src/engine/wind';
import { defaultAssumptions } from '../src/engine/defaults';
import { netAEP, run, windShares } from '../src/engine/model';
import { marketData } from '../src/engine/data';

function series(years: number[], v: (i: number) => number): Era5Series {
  const t: number[] = [];
  for (const y of years) for (let x = Date.UTC(y, 0, 1); x < Date.UTC(y + 1, 0, 1); x += 3600e3) t.push(x);
  return { t, v100: t.map((_, i) => v(i)), t2m: t.map(() => 15), sp: t.map(() => 1013.25), elevation: 0 };
}

const cfg = (p: Partial<SiteConfig> = {}): SiteConfig => ({ ...defaultSiteConfig(), mode: 'site', fromYear: 2019, toYear: 2020, ...p });

describe('power curves', () => {
  const v162 = curveById('v162-6.0')!;
  it('interpolates and cuts in/out', () => {
    expect(powerKW(v162, 8, 6000)).toBe(3017);
    expect(powerKW(v162, 8.25, 6000)).toBeCloseTo((3017 + 3624) / 2, 6);
    expect(powerKW(v162, 2.9, 6000)).toBe(0);
    expect(powerKW(v162, 24.1, 6000)).toBe(0);
  });
  it('scales a curve of another rating and normalised curves', () => {
    expect(powerKW(v162, 15, 6250)).toBeCloseTo(6250, 6);
    const gen = curveById('generic-iec3')!;
    expect(powerKW(gen, 13, 6250)).toBeCloseTo(6250, 6);
  });
});

describe('site energy', () => {
  it('constant wind at 100 m gives the curve value times hours, density-corrected', () => {
    const s = series([2019, 2020], () => 8);
    const r = computeSite(s, cfg({ curveId: 'v162-6.0', hub: 100, calib: 'mean', meanSpeed: 8, meanHeight: 100, diurnal: false }), 6);
    expect(r.scale).toBeCloseTo(1, 12);
    const rho = hubDensity(15, 1013.25, 100);
    const p = powerKW(curveById('v162-6.0')!, 8 * Math.cbrt(rho / 1.225), 6000) / 1000;
    expect(r.grossPerTurbine).toBeCloseTo(p * 8766, 6);
    expect(r.iavSigma).toBeCloseTo(0, 12);
    expect(r.shares.flat().reduce((a, b) => a + b)).toBeCloseTo(1, 12);
  });
  it('uses the shear law and the Volodymyrets bias without other inputs', () => {
    const s = series([2019, 2020], () => 6);
    const r = computeSite(s, cfg({ hub: 149, calib: 'era5' }), 6);
    expect(r.meanSpeedHub).toBeCloseTo(6 * CAL.bias * Math.pow(1.49, CAL.alpha), 9);
  });
  it('mean wind speed input sets the long-term mean at its height', () => {
    const s = series([2019, 2020], (i) => 4 + (i % 7));
    const r = computeSite(s, cfg({ hub: 120, calib: 'mean', meanSpeed: 7.5, meanHeight: 120 }), 6);
    expect(r.meanSpeedHub).toBeCloseTo(7.5, 9);
  });
  it('mast series calibrates the scale on the overlap', () => {
    const s = series([2019, 2020], (i) => 5 + (i % 5));
    const alpha = 0.25, h = 110;
    const mast = { t: s.t.slice(0, 24 * 400), v: s.v100.slice(0, 24 * 400).map((v) => (v as number) * 1.1 * Math.pow(h / 100, alpha)) };
    const r = computeSite(s, cfg({ hub: 140, alpha, calib: 'mast', mastHeight: h }), 6, mast);
    expect(r.scale).toBeCloseTo(1.1, 9);
    expect(r.mast?.overlapHours).toBe(24 * 400);
    expect(r.warnings).not.toContain('mastShort');
  });
  it('keeps monthly totals when the diurnal correction is applied', () => {
    const s = series([2019, 2020], (i) => 5 + 3 * Math.sin(i / 5));
    const a = computeSite(s, cfg({ diurnal: false }), 6);
    const b = computeSite(s, cfg({ diurnal: true }), 6);
    for (let m = 0; m < 12; m++) expect(b.shares[m].reduce((x, y) => x + y)).toBeCloseTo(a.shares[m].reduce((x, y) => x + y), 12);
    expect(b.grossPerTurbine).toBeCloseTo(a.grossPerTurbine, 9);
  });
});

describe('site mode in the model', () => {
  const s = series([2019, 2020], (i) => 5 + 3 * Math.sin(i / 7));
  const a = defaultAssumptions();
  const site = cfg({ curveId: 'generic-iec3' });
  site.result = computeSite(s, site, a.project.turbineMW);
  it('Net AEP and shares come from the site result', () => {
    const b = { ...a, generation: { ...a.generation, site } };
    expect(netAEP(b)).toBeCloseTo(site.result!.grossPerTurbine * a.project.turbines * (1 - site.wake), 6);
    expect(windShares(b, marketData)).toBe(site.result!.shares);
    const p90 = { ...a, generation: { ...a.generation, site: { ...site, level: 'P90' as const } } };
    expect(netAEP(p90)).toBeCloseTo(netAEP(b) * site.result!.p90Ratio, 6);
    expect(netAEP({ ...b, generation: { ...b.generation, manualAEP: 1000 } })).toBe(1000);
    const r = run(b, marketData);
    expect(r.kpis.equityIrr).toBeGreaterThan(-1);
  });
  it('proposal mode keeps the reference numbers', () => {
    const b = { ...a, generation: { ...a.generation, site: { ...site, mode: 'proposal' as const } } };
    expect(netAEP(b)).toBe(netAEP(a));
    expect(run(b, marketData).kpis.equityIrr).toBe(run(a, marketData).kpis.equityIrr);
  });
  it('flags a stale result', () => {
    expect(siteStale(site, a.project.turbineMW)).toBe(false);
    expect(siteStale({ ...site, hub: site.hub + 1 }, a.project.turbineMW)).toBe(true);
    expect(siteStale(site, 7)).toBe(true);
  });
});

describe('mast files', () => {
  it('reads a tab file with one timestamp column (GEO-NET style)', () => {
    const txt = 'Date/Time\tv_1_avg\tv_1_std\n2021-01-01 00:00\t6.0\t0.5\n2021-01-01 00:10\t8.0\t0.6\n2021-01-01 01:00\t5.0\t0.4\n';
    const t = parseMast(txt);
    expect(t.columns).toEqual(['v_1_avg', 'v_1_std']);
    const h = mastHourly(t, 0, 0);
    expect(h.t).toEqual([Date.UTC(2021, 0, 1, 0), Date.UTC(2021, 0, 1, 1)]);
    expect(h.v).toEqual([7, 5]);
  });
  it('reads a semicolon file with date and time columns, decimal comma and local time', () => {
    const txt = '# logger\nDate;Time;WS120\n01.07.2021;03:00;7,5\n01.07.2021;03:10;-999\n';
    const t = parseMast(txt);
    expect(t.columns).toEqual(['WS120']);
    const h = mastHourly(t, 0, 3);
    expect(h.t).toEqual([Date.UTC(2021, 6, 1, 0)]);
    expect(h.v).toEqual([7.5]);
  });
});
