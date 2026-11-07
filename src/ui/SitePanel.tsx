import React, { useContext, useState } from 'react';
import type { Assumptions } from '../engine/types';
import {
  CAL, CURVES, CUSTOM_CURVE, computeSite, curveById, defaultSiteConfig, era5Url, mastHourly, parseEra5, parseMast, siteNetAEP, siteStale,
  type MastTable, type SiteCalib, type SiteConfig,
} from '../engine/wind';
import { Gate, ReadOnly } from './readonly';
import { NumberInput } from './Assumptions';
import { num, pct } from './format';
import type { Lang } from './i18n';

// SANY has not shared a curve yet: the V162-6.0 (the turbine of the Volodymyrets yield assessment) stands in, scaled to the rating.
const CURVE_FOR_PRESET: Record<string, string> = { sany: 'v162-6.0', nordex: 'n163-7.0', vestas: 'v162-6.0' };

const YEARS = Array.from({ length: new Date().getUTCFullYear() - 1990 }, (_, i) => 1990 + i);

interface Props { a: Assumptions; lang: Lang; onChange: (a: Assumptions) => void; preset: string }

export function SitePanel({ a, lang, onChange, preset }: Props) {
  const L = (uk: string, en: string) => (lang === 'uk' ? uk : en);
  const ro = useContext(ReadOnly);
  const gate = useContext(Gate);
  const s = a.generation.site;
  const site = s?.mode === 'site';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mast, setMast] = useState<{ name: string; tab: MastTable } | null>(null);
  const [mastCol, setMastCol] = useState(0);
  const [mastTz, setMastTz] = useState(0);
  const [info, setInfo] = useState(false);
  const [curveText, setCurveText] = useState(() => (s?.customCurve ?? []).map((p) => `${p[0]}\t${p[1]}`).join('\n'));

  const base = (): SiteConfig => ({ ...defaultSiteConfig(), curveId: CURVE_FOR_PRESET[preset] ?? 'generic-iec3' });
  const set = (patch: Partial<SiteConfig>) => onChange({ ...a, generation: { ...a.generation, site: { ...(s ?? base()), ...patch } } });

  const errText = (e: unknown): string => {
    const m = e instanceof Error ? e.message : String(e);
    if (/Daily API request limit/i.test(m)) return L('Сервіс ERA5 (Open-Meteo) вичерпав денний ліміт запитів. Спробуйте завтра.', 'The ERA5 service (Open-Meteo) has reached its daily limit. Try again tomorrow.');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return L('Не вдалося з’єднатися з сервісом ERA5 (Open-Meteo). Перевірте з’єднання.', 'Could not reach the ERA5 service (Open-Meteo). Check your connection.');
    if (/overlap/.test(m)) return L('Дані щогли перекриваються з ERA5 менше ніж 30 днів.', 'The mast data overlaps ERA5 for less than 30 days.');
    if (/curve/.test(m)) return L('Задайте криву потужності: щонайменше три рядки «швидкість кВт».', 'Enter a power curve: at least three rows "speed kW".');
    if (/mean wind speed/.test(m)) return L('Задайте середню швидкість вітру і висоту, на якій її виміряно.', 'Enter the mean wind speed and its height.');
    if (/mast series/.test(m)) return L('Завантажте файл щогли і вкажіть висоту вимірювання.', 'Upload a mast file and enter the measurement height.');
    return m;
  };

  async function compute() {
    if (gate) { gate(); return; }
    if (!s) return;
    setBusy(true); setErr(null);
    try {
      let start = `${s.fromYear}-01-01`, end = `${s.toYear}-12-31`;
      let mh;
      if (s.calib === 'mast') {
        if (!mast) throw new Error('mast series and its height are required');
        mh = mastHourly(mast.tab, mastCol, mastTz);
        if (!mh.t.length) throw new Error('mast series and its height are required');
        const ms = new Date(mh.t[0]).toISOString().slice(0, 10);
        const latest = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        const me = new Date(mh.t[mh.t.length - 1]).toISOString().slice(0, 10);
        if (ms < start) start = ms;
        if (me > end) end = me < latest ? me : latest;
      }
      const res = await fetch(era5Url(s.lat, s.lon, start, end));
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.reason ?? res.statusText);
      const r = computeSite(parseEra5(j), s, a.project.turbineMW, mh);
      onChange({ ...a, generation: { ...a.generation, site: { ...s, result: r } } });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const tab = parseMast(await f.text());
      setMast({ name: f.name, tab });
      const guess = tab.columns.findIndex((c) => /avg|mean|ws|v_?1|speed/i.test(c));
      setMastCol(guess >= 0 ? guess : 0);
      setErr(null);
    } catch {
      setErr(L('Не вдалося прочитати файл: потрібні рядки з датою і часом та числовими колонками (CSV, TXT, TSV).', 'Could not read the file: rows with a date-time and numeric columns are required (CSV, TXT, TSV).'));
    }
  }

  const curve = s ? curveById(s.curveId, s.customCurve) : undefined;
  const r = s?.result;
  const stale = site && r && s ? siteStale(s, a.project.turbineMW) : false;
  const farmNet = s && r ? siteNetAEP({ ...s, level: 'P50' }, a.project.turbines) : undefined;

  const numRow = (label: string, unit: string, value: number, dec: number, onCommit: (v: number) => void) => (
    <div className="field">
      <div className="field-head"><span className="field-label">{label}</span></div>
      <div className="field-ctl"><NumberInput value={value} decimals={dec} label={label} onCommit={onCommit} /><span className="unit">{unit}</span></div>
    </div>
  );

  return (
    <section className="group site">
      <div className="field-head">
        <h3 className="field-label">{L('Джерело генерації', 'Generation source')}</h3>
        <button className="icon" onClick={() => setInfo(!info)} aria-expanded={info} aria-label={L('Методика', 'Method')}>i</button>
      </div>
      {info && (
        <div className="field-note site-info">
          <p>{L(
            'Для координат завантажуються погодинні дані ERA5 (ECMWF, через Open-Meteo) на висоті 100 м за 20 повних років. Швидкість переноситься на висоту осі за законом зсуву, з поправкою на густину повітря, і пропускається через криву потужності. Потім віднімається затінення; доступність і техвтрати застосовуються в моделі, як і раніше.',
            'Hourly ERA5 data (ECMWF, via Open-Meteo) at 100 m for 20 full years are downloaded for the coordinates. Wind is carried to hub height with the shear law, corrected for air density and passed through the power curve. Wake loss is deducted; availability and technical losses apply in the model as before.')}</p>
          <p>{L(
            `Калібрування на Володимирці: місячні середні ERA5 і щогли GEO-NET (2020–2022) корелюють на ${num(CAL.validation.monthlyCorrelation, 3)}; зсув α = ${num(CAL.alpha, 3)} за щоглою 60–123 м; з множником ${num(CAL.bias, 3)} метод дає 239,9 ГВт·год/рік для 12 × V162-6.0 на 149 м при затіненні 5.5% — як оцінка GEO-NET. Добовий профіль ERA5 виправляється за GEO-NET (кореляція профілю ${num(CAL.validation.profileCorrBefore, 3)} → ${num(CAL.validation.profileCorrAfter, 3)}).`,
            `Calibrated on Volodymyrets: monthly ERA5 and GEO-NET mast means (2020–2022) correlate at ${num(CAL.validation.monthlyCorrelation, 3)}; shear α = ${num(CAL.alpha, 3)} from the 60–123 m mast; with a ${num(CAL.bias, 3)} multiplier the method gives 239.9 GWh/yr for 12 × V162-6.0 at 149 m with 5.5% wake, as the GEO-NET assessment does. The ERA5 diurnal profile is corrected to GEO-NET (profile correlation ${num(CAL.validation.profileCorrBefore, 3)} → ${num(CAL.validation.profileCorrAfter, 3)}).`)}</p>
          <p>{L('Це оцінка для скринінгу майданчика. Для фінансування банк вимагатиме виміри щогли або LiDAR щонайменше 12 місяців і звіт незалежного консультанта.', 'This is a screening estimate. For financing, lenders require at least 12 months of mast or LiDAR data and an independent assessment.')}</p>
        </div>
      )}
      <div className="seg site-mode" role="group" aria-label={L('Джерело генерації', 'Generation source')}>
        <button disabled={ro} aria-pressed={!site} onClick={() => set({ mode: 'proposal' })}>{L('Пропозиція виробника', 'Manufacturer proposal')}</button>
        <button disabled={ro} aria-pressed={site} onClick={() => set({ mode: 'site' })}>{L('За координатами', 'By coordinates')}</button>
      </div>
      {!site && <p className="field-src">{L('Net AEP і погодинний профіль — з пропозиції виробника (поля нижче).', 'Net AEP and the hourly profile come from the manufacturer proposal (fields below).')}</p>}

      {site && s && (
        <>
          {numRow(L('Широта', 'Latitude'), '°', s.lat, 4, (v) => set({ lat: Math.max(-90, Math.min(90, v)) }))}
          {numRow(L('Довгота', 'Longitude'), '°', s.lon, 4, (v) => set({ lon: Math.max(-180, Math.min(180, v)) }))}
          <p className="field-src"><a className="link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=11/${s.lat}/${s.lon}`}>{L('Показати на карті', 'Show on map')}</a></p>
          {numRow(L('Висота осі', 'Hub height'), L('м', 'm'), s.hub, 0, (v) => set({ hub: Math.max(40, Math.min(250, v)) }))}

          <div className="field">
            <div className="field-head"><span className="field-label">{L('Крива потужності', 'Power curve')}</span></div>
            <div className="field-ctl">
              <select disabled={ro} value={s.curveId} onChange={(e) => set({ curveId: e.target.value })}>
                {CURVES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={CUSTOM_CURVE}>{L('Власна крива', 'Custom curve')}</option>
              </select>
            </div>
            <div className="field-src">{s.curveId === CUSTOM_CURVE ? L('Вставте таблицю: швидкість, м/с і потужність, кВт, при 1.225 кг/м³; по рядку на точку.', 'Paste a table: speed m/s and power kW at 1.225 kg/m³, one point per row.') : curve?.source}</div>
            {preset === 'sany' && s.curveId === 'v162-6.0' && <div className="field-note">{L('Крива SANY запитана у виробника. До її отримання як аналог — Vestas V162-6.0, для якої є оцінка виробітку GEO-NET по Володимирцю.', 'The SANY curve has been requested. Until then Vestas V162-6.0 stands in: the GEO-NET Volodymyrets yield assessment uses it.')}</div>}
            {s.curveId === CUSTOM_CURVE && (
              <textarea className="curve-text" disabled={ro} rows={6} value={curveText} aria-label={L('Крива потужності', 'Power curve')}
                onFocus={(e) => { if (gate) { e.currentTarget.blur(); gate(); } }}
                onChange={(e) => setCurveText(e.target.value)}
                onBlur={() => {
                  const pts = curveText.split(/\r?\n/).map((l) => l.trim().split(/[\s;,]+/).map((x) => Number(x.replace(',', '.'))))
                    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]] as [number, number])
                    .sort((x, y) => x[0] - y[0]);
                  set({ customCurve: pts });
                }} />
            )}
            {curve && !curve.normalized && curve.ratedKW && Math.abs(curve.ratedKW - a.project.turbineMW * 1000) > 1 && (
              <div className="field-warn">{L(`Номінал кривої ${num(curve.ratedKW / 1000, 2)} МВт відрізняється від потужності ВЕУ в проєкті ${num(a.project.turbineMW, 2)} МВт: потужність масштабується пропорційно, це наближення.`, `The curve is rated ${num(curve.ratedKW / 1000, 2)} MW, the project turbine ${num(a.project.turbineMW, 2)} MW: power is scaled proportionally, an approximation.`)}</div>
            )}
          </div>

          <div className="field">
            <div className="field-head"><span className="field-label">{L('Дані про вітер', 'Wind data')}</span></div>
            <div className="field-ctl">
              <select disabled={ro} value={s.calib} onChange={(e) => set({ calib: e.target.value as SiteCalib })}>
                <option value="era5">{L('Лише ERA5 (калібровано на Володимирці)', 'ERA5 only (calibrated on Volodymyrets)')}</option>
                <option value="mean">{L('ERA5 + середня швидкість вітру', 'ERA5 + mean wind speed')}</option>
                <option value="mast">{L('ERA5 + файл щогли або LiDAR', 'ERA5 + mast or LiDAR file')}</option>
              </select>
            </div>
          </div>
          {s.calib === 'mean' && (
            <>
              {numRow(L('Середня багаторічна швидкість вітру', 'Long-term mean wind speed'), L('м/с', 'm/s'), s.meanSpeed ?? 7, 2, (v) => set({ meanSpeed: v, meanHeight: s.meanHeight ?? s.hub }))}
              {numRow(L('на висоті', 'at height'), L('м', 'm'), s.meanHeight ?? s.hub, 0, (v) => set({ meanHeight: v, meanSpeed: s.meanSpeed ?? 7 }))}
            </>
          )}
          {s.calib === 'mast' && (
            <div className="field">
              <div className="field-head"><span className="field-label">{L('Файл щогли (10-хв або погодинні дані, CSV/TXT)', 'Mast file (10-min or hourly, CSV/TXT)')}</span></div>
              <input type="file" disabled={ro} accept=".csv,.txt,.tsv,.dat"
                onClick={(e) => { if (gate) { e.preventDefault(); gate(); } }}
                onChange={(e) => onFile(e.target.files?.[0])} />
              {mast && (
                <>
                  <div className="field-src">{mast.name}: {num(mast.tab.t.length, 0)} {L('рядків', 'rows')}, {new Date(mast.tab.t[0]).toISOString().slice(0, 10)} – {new Date(mast.tab.t[mast.tab.t.length - 1]).toISOString().slice(0, 10)}</div>
                  <div className="field-ctl">
                    <label className="small">{L('Колонка швидкості', 'Speed column')}{' '}
                      <select value={mastCol} onChange={(e) => setMastCol(Number(e.target.value))}>
                        {mast.tab.columns.map((c, k) => <option key={k} value={k}>{c}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="field-ctl">
                    <label className="small">{L('Час у файлі', 'File clock')}{' '}
                      <select value={mastTz} onChange={(e) => setMastTz(Number(e.target.value))}>
                        <option value={0}>UTC</option><option value={2}>UTC+2</option><option value={3}>UTC+3</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              {numRow(L('Висота вимірювання', 'Measurement height'), L('м', 'm'), s.mastHeight ?? 100, 1, (v) => set({ mastHeight: v }))}
              <div className="field-src">{L('Файл не зберігається в проєкті — зберігається лише результат розрахунку.', 'The file is not stored with the project, only the result.')}</div>
            </div>
          )}
          {numRow(L('Зсув вітру α', 'Wind shear α'), '', s.alpha, 3, (v) => set({ alpha: Math.max(0, Math.min(0.6, v)) }))}
          {numRow(L('Затінення (втрати від сліду)', 'Wake loss'), '%', s.wake * 100, 1, (v) => set({ wake: Math.max(0, Math.min(30, v)) / 100 }))}
          <div className="field">
            <div className="field-head"><span className="field-label">{L('Багаторічний період ERA5', 'ERA5 long-term period')}</span></div>
            <div className="field-ctl">
              <select disabled={ro} aria-label={L('Перший рік', 'First year')} value={s.fromYear} onChange={(e) => set({ fromYear: Number(e.target.value) })}>
                {YEARS.filter((y) => y <= s.toYear).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="unit">–</span>
              <select disabled={ro} aria-label={L('Останній рік', 'Last year')} value={s.toYear} onChange={(e) => set({ toYear: Number(e.target.value) })}>
                {YEARS.filter((y) => y >= s.fromYear).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="unit">{s.toYear - s.fromYear + 1} {L('р.', 'yrs')}</span>
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" disabled={ro} checked={s.diurnal} onChange={(e) => set({ diurnal: e.target.checked })} />
            <span>{L('Корекція добового профілю за Володимирцем', 'Diurnal correction from Volodymyrets')}</span>
          </label>
          <div className="field">
            <div className="field-head"><span className="field-label">{L('Генерація в моделі', 'Generation used')}</span></div>
            <div className="seg" role="group">
              <button disabled={ro} aria-pressed={s.level === 'P50'} onClick={() => set({ level: 'P50' })}>P50</button>
              <button disabled={ro} aria-pressed={s.level === 'P90'} onClick={() => set({ level: 'P90' })}>{L('P90, 1 рік', 'P90, 1 year')}</button>
            </div>
          </div>
          {!ro && (
            <button className="btn-action site-run" disabled={busy} onClick={compute}>
              {busy ? L('Завантажую ERA5 і рахую…', 'Loading ERA5 and calculating…') : r ? L('Перерахувати', 'Recalculate') : L('Розрахувати генерацію', 'Calculate generation')}
            </button>
          )}
          {err && <p className="field-warn" role="alert">{err}</p>}
          {!r && !err && <p className="field-src">{L('Поки результату немає, модель використовує пропозицію виробника.', 'Until calculated, the model uses the manufacturer proposal.')}</p>}
          {r && (
            <dl className="site-result">
              {stale && <p className="field-warn">{L('Параметри змінено після розрахунку — натисніть «Перерахувати».', 'Inputs changed after the calculation: press Recalculate.')}</p>}
              <dt>{L('Швидкість на висоті осі', 'Hub-height wind speed')}</dt><dd>{num(r.meanSpeedHub, 2)} {L('м/с', 'm/s')}</dd>
              <dt>{L('Густина повітря', 'Air density')}</dt><dd>{num(r.meanDensity, 3)} {L('кг/м³', 'kg/m³')}</dd>
              <dt>{L('1 ВЕУ, до затінення', 'One turbine, before wake')}</dt><dd>{num(r.grossPerTurbine, 0)} {L('МВт·год/рік', 'MWh/yr')} · {L('КВВП', 'CF')} {pct(r.capacityFactor, 1)}</dd>
              <dt>{L('Net AEP парку, P50', 'Farm Net AEP, P50')}</dt><dd>{num(farmNet ?? 0, 0)} {L('МВт·год/рік', 'MWh/yr')}</dd>
              <dt>P90, {L('1 рік', '1 year')}</dt><dd>{num((farmNet ?? 0) * r.p90Ratio, 0)} ({pct(r.p90Ratio - 1, 1)})</dd>
              <dt>{L('Міжрічна мінливість', 'Inter-annual variability')}</dt><dd>σ {pct(r.iavSigma, 1)}</dd>
              <dt>{L('Період', 'Period')}</dt><dd>{r.period[0].slice(0, 4)}–{r.period[1].slice(0, 4)}, {L('множник ERA5', 'ERA5 multiplier')} {num(r.scale, 3)}</dd>
              {r.mast && <><dt>{L('Щогла', 'Mast')}</dt><dd>{num(r.mast.overlapHours / 24, 0)} {L('днів спільних з ERA5', 'days overlapping ERA5')}; {num(r.mast.mastMean, 2)} {L('проти', 'vs')} {num(r.mast.era5Mean, 2)} {L('м/с', 'm/s')}</dd></>}
              {r.warnings.includes('mastShort') && <p className="field-warn">{L('Спільний період щогли й ERA5 коротший за рік: сезонна похибка можлива.', 'Mast and ERA5 overlap is shorter than a year: seasonal bias is possible.')}</p>}
              <p className="field-src">{L('P90 — лише за міжрічною мінливістю вітру, без невизначеності методу й вимірювань.', 'P90 reflects inter-annual wind variability only, not method or measurement uncertainty.')}</p>
            </dl>
          )}
        </>
      )}
    </section>
  );
}
