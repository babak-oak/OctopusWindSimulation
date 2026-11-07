// Checks the site wind method against the Volodymyrets references.
// Usage: npx tsx scripts/calibrate-wind.ts <era5.json from the "ERA5 fetch" workflow>
import { readFileSync } from 'node:fs';
import { CAL, computeSite, defaultSiteConfig, parseEra5 } from '../src/engine/wind';
import geonetShares from '../data/wind_profile.json';

const s = parseEra5(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const cfg = { ...defaultSiteConfig(), mode: 'site' as const, curveId: 'v162-6.0', hub: 149, fromYear: 2001, toYear: 2020 };
const r = computeSite(s, cfg, 6.0);
const net = r.grossPerTurbine * 12 * (1 - cfg.wake);
const g = (geonetShares as { shares: number[][] }).shares.flat();
const o = r.shares.flat();
const mg = g.reduce((a, b) => a + b) / g.length, mo = o.reduce((a, b) => a + b) / o.length;
const cov = g.reduce((a, x, i) => a + (x - mg) * (o[i] - mo), 0);
const corr = cov / Math.sqrt(g.reduce((a, x) => a + (x - mg) ** 2, 0) * o.reduce((a, x) => a + (x - mo) ** 2, 0));
console.log(JSON.stringify({
  bias: CAL.bias, alpha: CAL.alpha, meanSpeedHub: +r.meanSpeedHub.toFixed(3), density: +r.meanDensity.toFixed(4),
  grossPerTurbine: Math.round(r.grossPerTurbine), net12: Math.round(net), geonet: 239939, diff: +(net / 239939 - 1).toFixed(4),
  cf: +r.capacityFactor.toFixed(4), iavSigma: +r.iavSigma.toFixed(4), p90Ratio: +r.p90Ratio.toFixed(4), profileCorr: +corr.toFixed(4),
}, null, 1));
const r2 = computeSite(s, { ...cfg, diurnal: false }, 6.0);
console.log('without diurnal correction, net', Math.round(r2.grossPerTurbine * 12 * (1 - cfg.wake)));
const r3 = computeSite(s, { ...cfg, calib: 'mean', meanSpeed: 6.7, meanHeight: 119, fromYear: 2020, toYear: 2021 }, 6.0);
console.log('mean-speed calib on 2020-2021 (mast 6.7 m/s at 119 m): scale', r3.scale.toFixed(4));
