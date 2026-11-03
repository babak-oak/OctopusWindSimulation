import { describe, expect, it } from 'vitest';
import { defaultAssumptions } from '../src/engine/defaults';
import { marketData } from '../src/engine/data';
import { annualGeneration, gridMW, itemQty, landHa, netAEP, run, scheduleWeights, staffAnnualCost, staffCount } from '../src/engine/model';
import { xirr, xnpv } from '../src/engine/finance';
import { applyScenario, heatmap, riskRegister, scenarioTable, waterfall } from '../src/engine/scenarios';

const a = defaultAssumptions();
const r = run(a, marketData);
const sum = (x: number[]) => x.reduce((s, v) => s + v, 0);

describe('finance helpers', () => {
  it('xirr of -100 then +110 a year later is 10%', () => {
    expect(xirr([-100, 110], ['2027-01-01', '2028-01-01'])).toBeCloseTo(0.1, 6);
  });
  it('xnpv at the irr is zero', () => {
    const f = [-1000, 300, 400, 500];
    const d = ['2027-01-31', '2027-12-31', '2028-12-31', '2029-12-31'];
    expect(xnpv(xirr(f, d), f, d)).toBeCloseTo(0, 4);
  });
});

describe('inputs and schedules (ТЗ 5.1, 5.4)', () => {
  it('Net AEP gets availability and technical losses on top', () => {
    expect(annualGeneration(a)).toBeCloseTo(239_600 * 0.97 * 0.976, 3);
  });
  it('profiles sum to one', () => {
    expect(sum(marketData.windShares.flat())).toBeCloseTo(1, 9);
  });
  it('turbine payments: 20% m1, 50% m3, 7.5% in m6–m9', () => {
    const w = scheduleWeights(a, 'turbine');
    expect(w[0]).toBeCloseTo(0.2);
    expect(w[2]).toBeCloseTo(0.5);
    [5, 6, 7, 8].forEach((k) => expect(w[k]).toBeCloseTo(0.075));
    expect(sum(w)).toBeCloseTo(1, 12);
  });
  it('works 70% in m1–9, montage evenly m6–18, development in m1', () => {
    const w = scheduleWeights(a, 'works');
    expect(sum(w.slice(0, 9))).toBeCloseTo(0.7, 12);
    expect(sum(w)).toBeCloseTo(1, 12);
    const m = scheduleWeights(a, 'montage');
    expect(m[4]).toBe(0);
    expect(m[5]).toBeCloseTo(1 / 13);
    expect(scheduleWeights(a, 'dev')[0]).toBe(1);
  });
  it('monthly CAPEX adds up to the item total', () => {
    expect(sum(r.flows.capexExVat)).toBeCloseTo(sum(r.capexByItem.map((i) => i.exVat)), 4);
  });
});

describe('financing (ТЗ 5.5)', () => {
  it('debt is 65% of total funding incl. VAT, IDC and fee', () => {
    const F = r.kpis.capexExVat + r.kpis.vatPaid + r.kpis.idc + r.kpis.fee;
    expect(r.kpis.debt / F).toBeCloseTo(0.65, 9);
    expect(r.kpis.debt + r.kpis.equity).toBeCloseTo(F, 3);
  });
  it('fee is 0.5% of the loan', () => {
    expect(r.kpis.fee / r.kpis.debt).toBeCloseTo(0.005, 9);
  });
  it('development is paid by equity in month 1', () => {
    const dev = r.capexByItem.find((i) => i.id === 'dev')!;
    expect(dev.exVat).toBeCloseTo(60 * 72_000, 4);
    expect(r.flows.equityIn[0]).toBeGreaterThanOrEqual(dev.exVat + dev.vat);
  });
  it('no repayment before COD, 40 equal quarterly instalments after', () => {
    expect(sum(r.flows.principal.slice(0, 18))).toBe(0);
    const p = r.flows.principal.filter((v) => v > 0);
    expect(p.length).toBe(40);
    expect(Math.max(...p) - Math.min(...p)).toBeLessThan(1e-6);
    expect(r.flows.debtClose[18 + 120 - 1]).toBeCloseTo(0, 4);
  });
  it('VAT is fully recovered', () => {
    expect(r.flows.vatBalance.at(-1)).toBeCloseTo(0, 4);
  });
});

describe('statements', () => {
  it('balance sheet balances every month (< 1 €)', () => {
    expect(Math.max(...r.flows.balanceCheck.map(Math.abs))).toBeLessThan(1);
  });
  it('cash never goes negative in the base case', () => {
    expect(Math.min(...r.flows.cashClose)).toBeGreaterThan(-1);
  });
  it('all cash is distributed at the end', () => {
    expect(r.flows.cashClose.at(-1)).toBeCloseTo(0, 4);
  });
  it('calendar years run 2027–2053', () => {
    expect(r.annual[0].year).toBe(2027);
    expect(r.annual.at(-1)!.year).toBe(2053);
  });
});

describe('compensation 15% (ТЗ 5.6)', () => {
  const b = defaultAssumptions();
  b.compensation.enabled = true;
  const g = run(b, marketData);
  it('is 15% of CAPEX ex VAT, received 6 months after COD, not taxed', () => {
    expect(g.kpis.grant).toBeCloseTo(0.15 * g.kpis.capexExVat, 4);
    expect(g.flows.grantCash[18 + 6 - 1]).toBeCloseTo(g.kpis.grant, 4);
    expect(sum(g.flows.taxExpense)).toBeCloseTo(sum(r.flows.taxExpense), 2);
  });
  it('raises equity IRR and still balances', () => {
    expect(g.kpis.equityIrr).toBeGreaterThan(r.kpis.equityIrr);
    expect(Math.max(...g.flows.balanceCheck.map(Math.abs))).toBeLessThan(1);
  });
});

describe('stress tests (ТЗ 6.3)', () => {
  it('S1 cuts only June–August 11:00–15:00', () => {
    const s1 = run(applyScenario(a, 'S1'), marketData);
    const sh = marketData.windShares;
    const lost = [5, 6, 7].reduce((s, m) => s + [11, 12, 13, 14].reduce((t, h) => t + sh[m][h], 0), 0) * 0.2;
    expect(s1.kpis.annualGeneration).toBe(r.kpis.annualGeneration);
    const y2030 = (x: typeof r) => x.annual.find((y) => y.year === 2030)!.generation;
    expect(y2030(s1)).toBeCloseTo(y2030(r) * (1 - lost), 3);
  });
  it('S2 raises CAPEX by 10%', () => {
    expect(run(applyScenario(a, 'S2'), marketData).kpis.capexExVat).toBeCloseTo(r.kpis.capexExVat * 1.1, 3);
  });
  it('every stress lowers equity IRR; S4 is the lowest', () => {
    const t = scenarioTable(a, marketData);
    (['S1', 'S2', 'S3'] as const).forEach((k) => expect(t[k].equityIrr).toBeLessThan(t.base.equityIrr));
    expect(t.S4.equityIrr).toBeLessThan(Math.min(t.S1.equityIrr, t.S2.equityIrr, t.S3.equityIrr));
  });
  it('waterfall steps add up to S4', () => {
    const w = waterfall(a, marketData);
    const deltas = w.filter((x) => 'delta' in x).reduce((s, x) => s + (x as { delta: number }).delta, 0);
    expect((w[0] as { value: number }).value + deltas).toBeCloseTo((w[4] as { value: number }).value, 10);
  });
  it('heatmap is 7 × 6 and monotone in price', () => {
    const h = heatmap(a, marketData);
    expect(h.length).toBe(7);
    h.forEach((row) => row.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(row[i])));
  });
  it('risk register has 12 rows with positive expected losses', () => {
    const rr = riskRegister(a, marketData);
    expect(rr.length).toBe(12);
    rr.forEach((x) => expect(x.expected).toBeGreaterThan(0));
  });
});

describe('scaling with the turbine count', () => {
  const half = defaultAssumptions();
  half.project.turbines = 6;
  const q = (x: typeof half, id: string) => itemQty(x, x.capex.items.find((i) => i.id === id)!);
  it('roads and cables scale with turbines, the substation with installed MW', () => {
    expect(q(half, 'roads')).toBeCloseTo(16.37 / 2, 9);
    expect(q(half, 'cables')).toBeCloseTo(25 / 2, 9);
    expect(q(half, 'substation')).toBeCloseTo(0.5, 9);
    const big = defaultAssumptions();
    big.project.turbineMW = 7.5;
    expect(q(big, 'roads')).toBeCloseTo(16.37, 9);
    expect(q(big, 'substation')).toBeCloseTo(1.2, 9);
  });
  it('fixed items do not scale', () => {
    expect(q(half, 'cableSub')).toBe(1);
    expect(q(half, 'scada')).toBe(1);
    expect(q(half, 'relay')).toBe(1);
  });
  it('a manual quantity overrides scaling', () => {
    const m = structuredClone(half);
    m.capex.items.find((i) => i.id === 'roads')!.manualQty = 11;
    expect(q(m, 'roads')).toBe(11);
  });
  it('reference layout gives the reference quantities', () => {
    expect(q(a, 'roads')).toBe(16.37);
  });
});

describe('capacity-driven assumptions (decision 03.11)', () => {
  const n8 = defaultAssumptions();
  n8.project.turbines = 8;
  it('Net AEP and grid capacity scale with installed MW', () => {
    expect(netAEP(n8)).toBeCloseTo(239_600 * 8 / 12, 6);
    expect(gridMW(n8)).toBeCloseTo(72 * 8 / 12, 9);
    const r7 = defaultAssumptions();
    r7.project.turbineMW = 7;
    expect(netAEP(r7)).toBeCloseTo(239_600 * 7 / 6.25, 6);
  });
  it('per-kW items follow the scaled grid capacity; foundations are per turbine', () => {
    const q = (id: string) => itemQty(n8, n8.capex.items.find((i) => i.id === id)!);
    expect(q('grid')).toBeCloseTo(48_000, 6);
    expect(q('site')).toBeCloseTo(48_000, 6);
    expect(q('dev')).toBeCloseTo(48_000, 6);
    expect(q('foundations')).toBeCloseTo(8, 9);
  });
  it('land scales with turbines', () => {
    expect(landHa(n8)).toBeCloseTo(4, 9);
  });
  it('manual overrides win', () => {
    const m = structuredClone(n8);
    m.generation.manualAEP = 200_000;
    m.project.manualGridMW = 50;
    m.opex.manualLandHa = 5;
    expect(netAEP(m)).toBe(200_000);
    expect(gridMW(m)).toBe(50);
    expect(landHa(m)).toBe(5);
  });
  it('staff: 15 people and 230,057 €/yr at 12 turbines, sub-proportional elsewhere', () => {
    const base = defaultAssumptions();
    const heads = (x: typeof base) => x.opex.staffRoles.reduce((s, r) => s + staffCount(x, r), 0);
    expect(heads(base)).toBe(15);
    expect(staffAnnualCost(base)).toBeCloseTo(230_057.14, 1);
    expect(heads(n8)).toBe(14);
    const n24 = defaultAssumptions();
    n24.project.turbines = 24;
    expect(heads(n24)).toBe(20);
    expect(staffAnnualCost(n24) / staffAnnualCost(base)).toBeLessThan(2);
    expect(staffAnnualCost(n8) / staffAnnualCost(base)).toBeGreaterThan(8 / 12);
  });
  it('fewer turbines no longer inflate returns', () => {
    const k8 = run(n8, marketData).kpis;
    expect(k8.annualGeneration).toBeCloseTo(r.kpis.annualGeneration * 8 / 12, 3);
    expect(Math.abs(k8.equityIrr - r.kpis.equityIrr)).toBeLessThan(0.03);
  });
});
