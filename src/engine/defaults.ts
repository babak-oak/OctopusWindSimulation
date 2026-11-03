import type { Assumptions } from './types';

const KW = 75_000;
/** Project (grid) capacity in the SANY offer: 72 MW of 75 MW installed. */
const GRID_KW = 72_000;
const SANY = 'просчет Сани для Степана_1.xlsx';

/** Reference case: 12 x 6.25 MW SANY, 75 MW, Volodymyrets (ТЗ, розділ 4). */
export function defaultAssumptions(): Assumptions {
  return {
    project: {
      name: 'Volodymyrets 75 MW SANY',
      turbines: 12,
      turbineMW: 6.25,
      gridMW: 72,
      startDate: '2027-03-01',
      constructionMonths: 18,
      lifeYears: 25,
    },
    generation: { netAEP_MWh: 239_600, aepIncludesLosses: false, availability: 0.97, techLosses: 0.024 },
    market: { basePrice: 87.59, priceIndexation: 0, traderFee: 0.08, imbalance: 0 },
    opex: {
      omPerMW: 20_000,
      staff: 230_057,
      insurancePctCapex: 0.0012,
      rentPerHa: 1_500,
      landHa: 6,
      dispatchUAHperMWh: 118.64,
      marketOpVarUAHperMWh: 6.88,
      marketOpFixUAHperMonth: 3_837.84,
      nkrekpPctRevenue: 0.0006,
      otherPctRevenue: 0.005,
      adminPerMonth: 9_000,
      indexation: 0.02,
      baseYear: 2026,
    },
    fx: { uahPerEur: 51.0527 },
    capex: {
      contingencyPct: 0.02,
      items: [
        { id: 'wtg', nameUk: 'ВЕУ з доставкою', nameEn: 'Wind turbines incl. delivery', qty: KW, qtyBasis: 'installedKW', rate: 655, currency: 'EUR', vat: false, schedule: 'turbine', source: 'SANY offer, 655 €/kW delivered' },
        { id: 'montage', nameUk: 'Монтаж ВЕУ', nameEn: 'Turbine installation', qty: KW, qtyBasis: 'installedKW', rate: 80, currency: 'EUR', vat: true, schedule: 'montage', source: 'Input!K67' },
        { id: 'foundations', nameUk: 'Фундаменти', nameEn: 'Foundations', qty: GRID_KW, qtyBasis: 'gridKW', rate: 100, currency: 'EUR', vat: true, schedule: 'works', source: `${SANY}!E2: 100 €/kW × 72 MW` },
        { id: 'roads', nameUk: 'Дороги', nameEn: 'Roads', qty: 16.37, rate: 16_000_000, currency: 'UAH', vat: true, schedule: 'works', source: 'Decision 03.11.2026' },
        { id: 'cables', nameUk: 'Внутрішні кабелі 35 кВ', nameEn: 'Internal 35 kV cables', qty: 25, rate: 5_000_000, currency: 'UAH', vat: true, schedule: 'works', source: 'Input!K63, M63' },
        { id: 'cableSub', nameUk: 'Кабель до підстанції', nameEn: 'Cable to substation', qty: 1, rate: 8_000_000, currency: 'UAH', vat: true, schedule: 'works', source: 'Input!K64, M64' },
        { id: 'substation', nameUk: 'Підстанція', nameEn: 'Substation', qty: 1, rate: 6_200_000, currency: 'EUR', vat: true, schedule: 'works', source: 'Input!L68' },
        { id: 'grid', nameUk: 'Приєднання до мережі', nameEn: 'Grid connection', qty: GRID_KW, qtyBasis: 'gridKW', rate: 467, currency: 'UAH', vat: true, schedule: 'works', source: `${SANY}!E7: 467 UAH/kW × 72 MW` },
        { id: 'relay', nameUk: 'Релейний захист РАЕС', nameEn: 'Relay protection (RAES)', qty: 1, rate: 42_735, currency: 'EUR', vat: true, schedule: 'works', source: 'Input!K65' },
        { id: 'scada', nameUk: 'АСКОЕ, телемеханіка, відеонагляд', nameEn: 'Metering, SCADA, CCTV', qty: 1, rate: 6_600_000, currency: 'UAH', vat: true, schedule: 'works', source: 'CapEx!G29:G30' },
        { id: 'site', nameUk: 'Підготовка майданчика', nameEn: 'Site preparation', qty: GRID_KW, qtyBasis: 'gridKW', rate: 100, currency: 'EUR', vat: true, schedule: 'works', source: `${SANY}!E11: 100 €/kW × 72 MW` },
        { id: 'dev', nameUk: 'Девелопмент і проєкт', nameEn: 'Development and design', qty: GRID_KW, qtyBasis: 'gridKW', rate: 60, currency: 'EUR', vat: true, schedule: 'dev', source: `${SANY}!E10: 60 €/kW × 72 MW` },
      ],
    },
    schedule: {
      turbinePayments: [
        { month: 1, pct: 0.2 },
        { month: 3, pct: 0.5 },
      ],
      portPct: 0.3,
      firstArrivalMonth: 6,
      turbinesPerMonth: 3,
      worksFirstPct: 0.7,
      worksFirstEndMonth: 9,
      montageStartMonth: 6,
      devMonth: 1,
    },
    finance: {
      debtShare: 0.65,
      rate: 0.07,
      tenorYears: 10,
      feePct: 0.005,
      repayEveryMonths: 3,
      costOfEquity: 0.1,
      taxRate: 0.18,
      depreciationYears: 25,
      vatRate: 0.2,
    },
    compensation: { enabled: false, pct: 0.15, delayMonths: 6 },
    stress: {
      curtailment: { enabled: false, months: [6, 7, 8], hours: [12, 13, 14, 15], cut: 0.2 },
      capexMult: 1,
      priceMult: 1,
      opexMult: 1,
    },
  };
}
