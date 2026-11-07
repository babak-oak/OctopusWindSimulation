import { describe, expect, it } from 'vitest';
import { buildBook } from '../src/export/build';
import { Evaluator, parse } from '../src/export/evaluate';
import { defaultAssumptions } from '../src/engine/defaults';
import { marketData } from '../src/engine/data';
import { run } from '../src/engine/model';
import { applyScenario, defaultStress, type ScenarioId } from '../src/engine/scenarios';
import { computeSite, defaultSiteConfig } from '../src/engine/wind';
import type { Assumptions } from '../src/engine/types';

function check(base: Assumptions, scenario: ScenarioId, lang: 'uk' | 'en' = 'uk') {
  const { book, timelineOrder, kpiRow } = buildBook({ base, md: marketData, lang, scenario, stress: defaultStress });
  const ev = new Evaluator(book);
  ev.run(() => timelineOrder);
  const e = run(applyScenario(base, scenario, defaultStress), marketData).kpis as unknown as Record<string, number>;
  for (const [k, r] of Object.entries(kpiRow)) {
    const x = ev.value('KPI', r, 3) as number;
    if (k === 'balanceMax' || k === 'debtEnd') { expect(Math.abs(x)).toBeLessThan(1e-3); continue; }
    if (e[k] === 0) expect(Math.abs(x)).toBeLessThan(1e-9);
    else expect(Math.abs(x / e[k] - 1)).toBeLessThan(1e-9);
  }
  return book;
}

describe('formula export', () => {
  it('parses operator precedence like Excel', () => {
    const ev = new Evaluator({ sheets: [], names: {}, sheet: () => { throw new Error(); } } as never);
    expect(ev.eval(parse('=1+2*3^2', 'X'))).toBe(19);
    expect(ev.eval(parse('=-2^2', 'X'))).toBe(4);
    expect(ev.eval(parse('=IF(1>2,"a",MOD(-7,3))', 'X'))).toBe(2);
    expect(ev.eval(parse('=EOMONTH(DATE(2027,3,1),0)', 'X'))).toBe(46477);
  });
  it('base: the workbook formulas give the engine KPIs', () => { check(defaultAssumptions(), 'base'); }, 20000);
  it('S4 in English', () => {
    const book = check(defaultAssumptions(), 'S4', 'en');
    expect(book.sheets.map((s) => s.name)).toEqual(['Inputs', 'KPI', 'Annual', 'Calc', 'Staff', 'Profiles', 'Capex', 'Funding', 'Timeline', 'Sensitivity', 'Risks']);
  }, 20000);
  it('site mode and a different layout', () => {
    const a = defaultAssumptions();
    a.project.turbines = 10;
    const t: number[] = [];
    for (let x = Date.UTC(2019, 0, 1); x < Date.UTC(2021, 0, 1); x += 3600e3) t.push(x);
    const series = { t, v100: t.map((_, i) => 5 + 3 * Math.sin(i / 9)), t2m: t.map(() => 10), sp: t.map(() => 1000), elevation: 150 };
    const site = { ...defaultSiteConfig(), mode: 'site' as const, curveId: 'v162-6.0', fromYear: 2019, toYear: 2020 };
    site.result = computeSite(series, site, a.project.turbineMW);
    a.generation.site = site;
    check(a, 'S1');
  }, 20000);
});
