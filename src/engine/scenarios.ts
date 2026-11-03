import type { Assumptions, Kpis, MarketData } from './types';
import { run } from './model';

const clone = (a: Assumptions): Assumptions => structuredClone(a);

export type ScenarioId = 'base' | 'S1' | 'S2' | 'S3' | 'S4';

export interface StressSizes {
  curtailCut: number; // 0.2 = −20% generation in the curtailment window
  capexUp: number; // 0.1 = +10%
  priceDown: number; // 0.2 = −20%
}
export const defaultStress: StressSizes = { curtailCut: 0.2, capexUp: 0.1, priceDown: 0.2 };

/** ТЗ 6.3 — apply one stress (or all for S4) on top of the user's assumptions. */
export function applyScenario(a: Assumptions, id: ScenarioId, s: StressSizes = defaultStress): Assumptions {
  const b = clone(a);
  const s1 = id === 'S1' || id === 'S4';
  const s2 = id === 'S2' || id === 'S4';
  const s3 = id === 'S3' || id === 'S4';
  if (s1) b.stress.curtailment = { ...b.stress.curtailment, enabled: true, cut: s.curtailCut };
  if (s2) b.stress.capexMult *= 1 + s.capexUp;
  if (s3) b.stress.priceMult *= 1 - s.priceDown;
  return b;
}

export function scenarioTable(a: Assumptions, md: MarketData, s: StressSizes = defaultStress): Record<ScenarioId, Kpis> {
  const ids: ScenarioId[] = ['base', 'S1', 'S2', 'S3', 'S4'];
  return Object.fromEntries(ids.map((id) => [id, run(applyScenario(a, id, s), md).kpis])) as Record<ScenarioId, Kpis>;
}

/** Format Б — equity IRR from base to S4, one step per shock in the order S1, S2, S3. */
export function waterfall(a: Assumptions, md: MarketData, s: StressSizes = defaultStress) {
  const base = run(a, md).kpis.equityIrr;
  const b1 = applyScenario(a, 'S1', s);
  const r1 = run(b1, md).kpis.equityIrr;
  const b2 = applyScenario(b1, 'S2', s);
  const r2 = run(b2, md).kpis.equityIrr;
  const b3 = applyScenario(b2, 'S3', s);
  const r3 = run(b3, md).kpis.equityIrr;
  return [
    { step: 'base', value: base },
    { step: 'S1', delta: r1 - base },
    { step: 'S2', delta: r2 - r1 },
    { step: 'S3', delta: r3 - r2 },
    { step: 'S4', value: r3 },
  ];
}

/** Format В — equity IRR on a price × CAPEX grid. */
export function heatmap(
  a: Assumptions,
  md: MarketData,
  priceSteps = [-0.3, -0.2, -0.1, 0, 0.1, 0.2],
  capexSteps = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2],
) {
  return capexSteps.map((c) =>
    priceSteps.map((p) => {
      const b = clone(a);
      b.stress.priceMult *= 1 + p;
      b.stress.capexMult *= 1 + c;
      return run(b, md).kpis.equityIrr;
    }),
  );
}

export interface RiskRow {
  id: string;
  group: 'construction' | 'operations';
  nameUk: string;
  nameEn: string;
  shock: string;
  probability: number;
  /** EUR: construction = lost EBITDA (+ direct cost); operations = EBITDA per year */
  impact: number;
  expected: number;
}

/** ТЗ 6.4 — probabilities and shocks from the deck, slides 13–14. */
export function riskRegister(a: Assumptions, md: MarketData): RiskRow[] {
  const base = run(a, md).kpis;
  const ebitda = base.ebitdaAvg5;
  const perMonth = ebitda / 12;
  const shocked = (fn: (b: Assumptions) => void) => {
    const b = clone(a);
    fn(b);
    return ebitda - run(b, md).kpis.ebitdaAvg5;
  };
  const rows: Omit<RiskRow, 'expected'>[] = [
    { id: 'capex', group: 'construction', nameUk: 'Перевищення CAPEX', nameEn: 'CAPEX overrun', shock: 'CAPEX +10%', probability: 0.5, impact: 0.1 * base.capexExVat },
    { id: 'grid', group: 'construction', nameUk: 'Затримка приєднання', nameEn: 'Grid connection delay', shock: '6 міс.', probability: 0.35, impact: 6 * perMonth },
    { id: 'permits', group: 'construction', nameUk: 'ОВД, дозволи, аеропорт', nameEn: 'EIA, permits, airport', shock: '6 міс. + 0.2 млн €', probability: 0.25, impact: 6 * perMonth + 200_000 },
    { id: 'turbines', group: 'construction', nameUk: 'Затримка поставки або монтажу турбін', nameEn: 'Turbine delivery or installation delay', shock: '3 міс.', probability: 0.3, impact: 3 * perMonth },
    { id: 'land', group: 'construction', nameUk: 'Земля, суперфіцій, громада', nameEn: 'Land, superficies, community', shock: '6 міс.', probability: 0.15, impact: 6 * perMonth },
    { id: 'price', group: 'operations', nameUk: 'Ціна РДН', nameEn: 'DAM price', shock: '−15%', probability: 0.25, impact: shocked((b) => (b.stress.priceMult *= 0.85)) },
    { id: 'wind', group: 'operations', nameUk: 'Вітер нижче P50', nameEn: 'Wind below P50', shock: '−7% генерації', probability: 0.3, impact: shocked((b) => (b.generation.netAEP_MWh *= 0.93)) },
    { id: 'failure', group: 'operations', nameUk: 'Велика аварія', nameEn: 'Major failure', shock: '1 ВЕУ, 4 міс. + ремонт 0.8 млн €', probability: 0.1, impact: (ebitda / a.project.turbines) * (4 / 12) + 800_000 },
    { id: 'opex', group: 'operations', nameUk: 'OPEX', nameEn: 'OPEX', shock: '+20%', probability: 0.5, impact: shocked((b) => (b.stress.opexMult *= 1.2)) },
    { id: 'regulation', group: 'operations', nameUk: 'Регуляторні зміни', nameEn: 'Regulatory change', shock: '−3% доходу', probability: 0.3, impact: shocked((b) => (b.stress.priceMult *= 0.97)) },
    { id: 'curtail', group: 'operations', nameUk: 'Обмеження Укренерго', nameEn: 'Ukrenergo curtailment', shock: '−2% генерації', probability: 0.5, impact: shocked((b) => (b.generation.netAEP_MWh *= 0.98)) },
    { id: 'eco', group: 'operations', nameUk: 'Екологічні обмеження', nameEn: 'Environmental limits', shock: '−1.5% генерації', probability: 0.4, impact: shocked((b) => (b.generation.netAEP_MWh *= 0.985)) },
  ];
  return rows.map((r) => ({ ...r, expected: r.probability * r.impact }));
}
