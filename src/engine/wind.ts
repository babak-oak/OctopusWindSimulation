// Site wind: hourly ERA5 wind -> hub-height wind -> power curve -> annual energy and the 12 x 24 profile.
// Calibrated on Volodymyrets (data/wind_calibration.json). Pure functions: the browser fetches ERA5 and calls these.
import calibration from '../../data/wind_calibration.json';
import curvesJson from '../../data/power_curves.json';

export interface PowerCurve {
  id: string;
  name: string;
  oem: string;
  /** null for a normalised curve (power as a share of rated) */
  ratedKW: number | null;
  rotor: number | null;
  hubs: number[];
  normalized: boolean;
  /** [wind speed m/s, kW] or [m/s, share of rated] when normalized; air density 1.225 kg/m3 */
  points: [number, number][];
  source: string;
}

export const CAL = calibration as {
  alpha: number; bias: number; localUtcOffset: number; diurnal: number[][];
  site: { name: string; lat: number; lon: number };
  validation: Record<string, number>;
};
export const CURVES = curvesJson as PowerCurve[];
export const CUSTOM_CURVE = 'custom';

/** Hourly ERA5 at 100 m, UTC. Values may be null where the archive has gaps. */
export interface Era5Series {
  /** epoch milliseconds, UTC, start of the hour */
  t: number[];
  v100: (number | null)[];
  t2m: (number | null)[];
  /** surface pressure, hPa */
  sp: (number | null)[];
  elevation: number;
}

export type SiteCalib = 'era5' | 'mean' | 'mast';

export interface SiteResult {
  computedAt: string;
  lat: number;
  lon: number;
  curveId: string;
  turbineMW: number;
  hub: number;
  calib: SiteCalib;
  /** long-term window used, ISO dates */
  period: [string, string];
  years: number;
  /** multiplier applied to ERA5 100 m speed before the shear law */
  scale: number;
  meanSpeedHub: number;
  meanDensity: number;
  /** one turbine, before wake, MWh/yr */
  grossPerTurbine: number;
  capacityFactor: number;
  /** standard deviation of annual energy over the window, share of mean */
  iavSigma: number;
  /** P90 (one year) / P50 from the inter-annual variability */
  p90Ratio: number;
  /** 12 x 24 shares of annual energy, local time UTC+2, hour h = h:00-(h+1):00 */
  shares: number[][];
  monthlySpeed: number[];
  mast?: { overlapHours: number; mastMean: number; era5Mean: number };
  warnings: string[];
}

export interface SiteConfig {
  /** 'proposal' = Net AEP and profile from the OEM proposal (default); 'site' = computed for the coordinates */
  mode: 'proposal' | 'site';
  lat: number;
  lon: number;
  hub: number;
  alpha: number;
  calib: SiteCalib;
  /** long-term mean wind speed at `meanHeight`, m/s (calib = 'mean') */
  meanSpeed?: number;
  meanHeight?: number;
  /** measurement height of the uploaded mast series, m (calib = 'mast') */
  mastHeight?: number;
  curveId: string;
  customCurve?: [number, number][];
  /** wake (shading) loss, fixed share */
  wake: number;
  /** apply the Volodymyrets diurnal correction to the ERA5 profile */
  diurnal: boolean;
  level: 'P50' | 'P90';
  /** long-term window, complete calendar years */
  fromYear: number;
  toYear: number;
  result?: SiteResult;
}

export function defaultSiteConfig(): SiteConfig {
  const y = new Date().getUTCFullYear() - 1;
  return {
    mode: 'proposal', lat: CAL.site.lat, lon: CAL.site.lon, hub: 149, alpha: CAL.alpha, calib: 'era5',
    curveId: 'generic-iec3', wake: 0.055, diurnal: true, level: 'P50', fromYear: y - 19, toYear: y,
  };
}

export function curveById(id: string, custom?: [number, number][]): PowerCurve | undefined {
  if (id === CUSTOM_CURVE) {
    if (!custom || custom.length < 3) return undefined;
    return { id, name: 'Власна крива', oem: 'custom', ratedKW: Math.max(...custom.map((p) => p[1])), rotor: null, hubs: [], normalized: false, points: custom, source: 'Введено користувачем' };
  }
  return CURVES.find((c) => c.id === id);
}

/** Power of one turbine, kW, at speed v (already density-normalised). Zero below the first point and above the last. */
export function powerKW(curve: PowerCurve, v: number, turbineKW: number): number {
  const p = curve.points;
  if (!(v >= p[0][0]) || v > p[p.length - 1][0]) return 0;
  let i = 1;
  while (i < p.length && p[i][0] < v) i++;
  const [v0, p0] = p[i - 1];
  const [v1, p1] = p[Math.min(i, p.length - 1)];
  const y = v1 === v0 ? p1 : p0 + ((p1 - p0) * (v - v0)) / (v1 - v0);
  if (curve.normalized) return y * turbineKW;
  return curve.ratedKW && Math.abs(curve.ratedKW - turbineKW) > 1 ? (y * turbineKW) / curve.ratedKW : y;
}

const R = 287.05;
const HOURS_PER_YEAR = 8766;

/** Air density at hub height from 2 m temperature and surface pressure (ISA lapse, hydrostatic). */
export function hubDensity(t2m: number, spHPa: number, hubAboveGround: number): number {
  const T = t2m + 273.15 - 0.0065 * hubAboveGround;
  const p = spHPa * 100 * Math.exp((-9.81 * hubAboveGround) / (R * T));
  return p / (R * T);
}

/** Mean of v100 * (h/100)^alpha over the given indices. */
function meanAtHeight(s: Era5Series, idx: number[], h: number, alpha: number): number {
  let sum = 0, n = 0;
  const f = Math.pow(h / 100, alpha);
  for (const i of idx) { const v = s.v100[i]; if (v != null) { sum += v * f; n++; } }
  return n ? sum / n : NaN;
}

export interface MastHourly { /** epoch ms UTC, start of hour */ t: number[]; v: number[] }

export function computeSite(s: Era5Series, cfg: SiteConfig, turbineMW: number, mast?: MastHourly): SiteResult {
  const curve = curveById(cfg.curveId, cfg.customCurve);
  if (!curve) throw new Error('power curve not found');
  const warnings: string[] = [];
  const from = Date.UTC(cfg.fromYear, 0, 1), to = Date.UTC(cfg.toYear + 1, 0, 1);
  const lt: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (s.t[i] >= from && s.t[i] < to && s.v100[i] != null) lt.push(i);
  if (lt.length < 8760) throw new Error('ERA5 series shorter than one year');

  let scale = CAL.bias;
  let mastInfo: SiteResult['mast'];
  if (cfg.calib === 'mean') {
    if (!cfg.meanSpeed || !cfg.meanHeight) throw new Error('mean wind speed and its height are required');
    scale = cfg.meanSpeed / meanAtHeight(s, lt, cfg.meanHeight, cfg.alpha);
  } else if (cfg.calib === 'mast') {
    if (!mast || !cfg.mastHeight) throw new Error('mast series and its height are required');
    const pos = new Map<number, number>();
    s.t.forEach((t, i) => pos.set(t, i));
    let sm = 0, se = 0, n = 0;
    const f = Math.pow(cfg.mastHeight / 100, cfg.alpha);
    mast.t.forEach((t, k) => {
      const i = pos.get(t);
      const e = i == null ? null : s.v100[i];
      if (e != null && Number.isFinite(mast.v[k])) { sm += mast.v[k]; se += e * f; n++; }
    });
    if (n < 24 * 30) throw new Error('mast and ERA5 overlap is shorter than 30 days');
    if (n < 24 * 365) warnings.push('mastShort');
    scale = sm / se;
    mastInfo = { overlapHours: n, mastMean: sm / n, era5Mean: se / n };
  }
  if (curve.ratedKW && !curve.normalized && Math.abs(curve.ratedKW - turbineMW * 1000) > 1) warnings.push('ratingMismatch');

  const turbineKW = turbineMW * 1000;
  const shear = Math.pow(cfg.hub / 100, cfg.alpha);
  const M = Array.from({ length: 12 }, () => new Array<number>(24).fill(0));
  const speedSum = new Array<number>(12).fill(0), speedN = new Array<number>(12).fill(0);
  const byYear = new Map<number, { e: number; n: number }>();
  let eSum = 0, vSum = 0, rhoSum = 0, rhoN = 0;
  const offset = CAL.localUtcOffset * 3600e3;
  for (const i of lt) {
    const v = (s.v100[i] as number) * scale * shear;
    const t2 = s.t2m[i], sp = s.sp[i];
    let rho = 1.225;
    if (t2 != null && sp != null) { rho = hubDensity(t2, sp, cfg.hub); rhoSum += rho; rhoN++; }
    const p = powerKW(curve, v * Math.cbrt(rho / 1.225), turbineKW) / 1000; // MW
    const d = new Date(s.t[i] + offset);
    const m = d.getUTCMonth(), h = d.getUTCHours();
    M[m][h] += p;
    speedSum[m] += v; speedN[m]++;
    eSum += p; vSum += v;
    const y = new Date(s.t[i]).getUTCFullYear();
    const yy = byYear.get(y) ?? { e: 0, n: 0 };
    yy.e += p; yy.n++; byYear.set(y, yy);
  }
  if (cfg.diurnal) {
    for (let m = 0; m < 12; m++) {
      const before = M[m].reduce((x, y) => x + y, 0);
      const row = M[m].map((x, h) => x * CAL.diurnal[m][h]);
      const after = row.reduce((x, y) => x + y, 0);
      M[m] = row.map((x) => (after > 0 ? (x * before) / after : 0));
    }
  }
  const total = M.flat().reduce((x, y) => x + y, 0);
  const shares = M.map((r) => r.map((x) => (total > 0 ? x / total : 1 / 288)));
  const gross = (eSum / lt.length) * HOURS_PER_YEAR;
  const annual = [...byYear.values()].filter((y) => y.n >= 8700).map((y) => (y.e / y.n) * HOURS_PER_YEAR);
  const mean = annual.reduce((x, y) => x + y, 0) / Math.max(annual.length, 1);
  const sigma = annual.length > 1 ? Math.sqrt(annual.reduce((x, y) => x + (y - mean) ** 2, 0) / (annual.length - 1)) / mean : 0;
  return {
    computedAt: new Date().toISOString(),
    lat: cfg.lat, lon: cfg.lon, curveId: cfg.curveId, turbineMW, hub: cfg.hub, calib: cfg.calib,
    period: [`${cfg.fromYear}-01-01`, `${cfg.toYear}-12-31`],
    years: lt.length / HOURS_PER_YEAR,
    scale,
    meanSpeedHub: vSum / lt.length,
    meanDensity: rhoN ? rhoSum / rhoN : 1.225,
    grossPerTurbine: gross,
    capacityFactor: gross / (turbineMW * HOURS_PER_YEAR),
    iavSigma: sigma,
    p90Ratio: 1 - 1.2816 * sigma,
    shares,
    monthlySpeed: speedSum.map((x, m) => (speedN[m] ? x / speedN[m] : 0)),
    mast: mastInfo,
    warnings,
  };
}

/** Net AEP of the whole farm from a site result, MWh/yr (before availability and technical losses). */
export function siteNetAEP(cfg: SiteConfig, turbines: number): number | undefined {
  const r = cfg.result;
  if (cfg.mode !== 'site' || !r) return undefined;
  return r.grossPerTurbine * turbines * (1 - cfg.wake) * (cfg.level === 'P90' ? r.p90Ratio : 1);
}

/** The site result no longer matches the inputs it was computed for. */
export function siteStale(cfg: SiteConfig, turbineMW: number): boolean {
  const r = cfg.result;
  if (!r) return true;
  return r.lat !== cfg.lat || r.lon !== cfg.lon || r.hub !== cfg.hub || r.curveId !== cfg.curveId || r.calib !== cfg.calib || Math.abs(r.turbineMW - turbineMW) > 1e-9
    || r.period[0] !== `${cfg.fromYear}-01-01` || r.period[1] !== `${cfg.toYear}-12-31`;
}

// ---------- mast files ----------

export interface MastTable { columns: string[]; t: number[]; values: number[][] }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DATE_EU = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function parseDate(a: string, b?: string): { t: number; used: number } | null {
  let m = a.match(DATE_RE), y: number, mo: number, d: number, hh = 0, mi = 0, used = 1;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4] != null) { hh = +m[4]; mi = +m[5]; } }
  else if ((m = a.match(DATE_EU))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (m[4] != null) { hh = +m[4]; mi = +m[5]; } }
  else return null;
  if ((!m[4]) && b) { const tm = b.match(TIME_RE); if (tm) { hh = +tm[1]; mi = +tm[2]; used = 2; } }
  return { t: Date.UTC(y, mo - 1, d, hh, mi), used };
}

/**
 * Reads a mast or LiDAR export: one timestamp (date and time in one or two columns) and numeric channels.
 * Comment lines (#) are skipped; the last non-numeric line before the data is taken as the header.
 */
export function parseMast(text: string): MastTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const sample = lines.slice(0, 50).join('\n');
  const delim = sample.includes('\t') ? '\t' : (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ';' : ',';
  const decimalComma = delim === ';';
  let header: string[] = [];
  const t: number[] = [];
  const values: number[][] = [];
  let width = 0;
  for (const line of lines) {
    const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    const dt = parseDate(cells[0], cells[1]);
    if (!dt) { if (!t.length) header = cells; continue; }
    const nums = cells.slice(dt.used).map((c) => {
      const x = Number(decimalComma ? c.replace(',', '.') : c);
      return c === '' || !Number.isFinite(x) ? NaN : x;
    });
    if (!width) width = nums.length;
    t.push(dt.t);
    values.push(nums.slice(0, width));
  }
  if (!t.length) throw new Error('no timestamped rows found');
  const firstData = lines.find((l) => parseDate(l.split(delim)[0].trim(), l.split(delim)[1]?.trim()));
  const used = firstData ? parseDate(firstData.split(delim)[0].trim(), firstData.split(delim)[1]?.trim())!.used : 1;
  const names = header.length >= used + width ? header.slice(used, used + width) : [];
  const columns = Array.from({ length: width }, (_, k) => names[k] || `col ${k + 1}`);
  return { columns, t, values };
}

/** Hourly means of one column, shifted to UTC by `utcOffsetHours` of the file's clock; drops invalid speeds. */
export function mastHourly(tab: MastTable, col: number, utcOffsetHours: number): MastHourly {
  const acc = new Map<number, { s: number; n: number }>();
  tab.t.forEach((t, k) => {
    const v = tab.values[k][col];
    if (!Number.isFinite(v) || v < 0 || v > 60) return;
    const h = Math.floor((t - utcOffsetHours * 3600e3) / 3600e3) * 3600e3;
    const a = acc.get(h) ?? { s: 0, n: 0 };
    a.s += v; a.n++; acc.set(h, a);
  });
  const keys = [...acc.keys()].sort((a, b) => a - b);
  return { t: keys, v: keys.map((k) => acc.get(k)!.s / acc.get(k)!.n) };
}

// ---------- ERA5 download (Open-Meteo archive) ----------

export function era5Url(lat: number, lon: number, start: string, end: string): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), start_date: start, end_date: end,
    hourly: 'wind_speed_100m,temperature_2m,surface_pressure', wind_speed_unit: 'ms', timezone: 'GMT', models: 'era5',
  });
  return `https://archive-api.open-meteo.com/v1/archive?${q.toString()}`;
}

export function parseEra5(j: { elevation?: number; hourly: { time: string[]; wind_speed_100m: (number | null)[]; temperature_2m: (number | null)[]; surface_pressure: (number | null)[] } }): Era5Series {
  return {
    t: j.hourly.time.map((x) => Date.parse(`${x}:00Z`)),
    v100: j.hourly.wind_speed_100m,
    t2m: j.hourly.temperature_2m,
    sp: j.hourly.surface_pressure,
    elevation: j.elevation ?? 0,
  };
}
