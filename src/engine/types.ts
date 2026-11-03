// Octopus Wind Simulation — engine types.
// All money in EUR, ex VAT unless stated. Prices in 2026 terms.

export type Schedule = 'turbine' | 'works' | 'montage' | 'dev';
export type Currency = 'EUR' | 'UAH';

export interface CapexItem {
  id: string;
  nameUk: string;
  nameEn: string;
  /** quantity, e.g. kW, km, pcs */
  qty: number;
  /** unit rate in `currency` */
  rate: number;
  currency: Currency;
  /** VAT 20% applies (works and services); turbines are exempt */
  vat: boolean;
  schedule: Schedule;
  source: string;
}

export interface Assumptions {
  project: {
    name: string;
    turbines: number;
    turbineMW: number;
    /** first day of construction month 1, ISO yyyy-mm-dd */
    startDate: string;
    constructionMonths: number;
    lifeYears: number;
  };
  generation: {
    netAEP_MWh: number;
    /** true if Net AEP already includes availability and technical losses */
    aepIncludesLosses: boolean;
    availability: number;
    techLosses: number;
  };
  market: {
    /** average DAM price over all hours, EUR/MWh, base year */
    basePrice: number;
    priceIndexation: number;
    traderFee: number;
    imbalance: number;
  };
  opex: {
    omPerMW: number;
    staff: number;
    insurancePctCapex: number;
    rentPerHa: number;
    landHa: number;
    dispatchUAHperMWh: number;
    marketOpVarUAHperMWh: number;
    marketOpFixUAHperMonth: number;
    nkrekpPctRevenue: number;
    otherPctRevenue: number;
    adminPerMonth: number;
    indexation: number;
    baseYear: number;
  };
  fx: { uahPerEur: number };
  capex: { items: CapexItem[]; contingencyPct: number };
  schedule: {
    turbinePayments: { month: number; pct: number }[];
    portPct: number;
    firstArrivalMonth: number;
    turbinesPerMonth: number;
    worksFirstPct: number;
    worksFirstEndMonth: number;
    montageStartMonth: number;
    devMonth: number;
  };
  finance: {
    debtShare: number;
    rate: number;
    tenorYears: number;
    feePct: number;
    repayEveryMonths: number;
    costOfEquity: number;
    taxRate: number;
    depreciationYears: number;
    vatRate: number;
  };
  compensation: { enabled: boolean; pct: number; delayMonths: number };
  stress: {
    curtailment: { enabled: boolean; months: number[]; hours: number[]; cut: number };
    capexMult: number;
    priceMult: number;
    opexMult: number;
  };
}

export interface MarketData {
  /** 12 x 24 shares of annual generation, sum = 1; hour h = (h-1):00-h:00 */
  windShares: number[][];
  /** 12 x 24 price shape coefficients, hour-weighted mean = 1 */
  priceShape: number[][];
}

export interface Period {
  label: string;
  months: number[]; // 1-based timeline indices
}

export interface Flows {
  // per timeline month (index 0 = month 1)
  date: string[];
  isOps: boolean[];
  generation: number[];
  revenueGross: number[];
  revenueNet: number[];
  opex: number[];
  ebitda: number[];
  capexExVat: number[];
  capexVat: number[];
  idc: number[];
  fee: number[];
  debtDraw: number[];
  equityIn: number[];
  depreciation: number[];
  interestExpense: number[];
  interestPaid: number[];
  principal: number[];
  debtClose: number[];
  vatRecovered: number[];
  vatBalance: number[];
  grantCash: number[];
  grantIncome: number[];
  grantReceivable: number[];
  deferredIncome: number[];
  taxExpense: number[];
  netProfit: number[];
  dividends: number[];
  cashClose: number[];
  ppeNet: number[];
  interestPayable: number[];
  shareCapital: number[];
  retainedEarnings: number[];
  balanceCheck: number[];
  projectFcf: number[];
  cfads: number[];
}

export interface Kpis {
  capexExVat: number;
  capexPerKW: number;
  debt: number;
  equity: number;
  idc: number;
  fee: number;
  vatPaid: number;
  annualGeneration: number;
  capturePrice: number;
  baselinePrice: number;
  projectIrr: number;
  equityIrr: number;
  npvProject: number;
  wacc: number;
  ebitdaAvg5: number;
  ebitdaToCapex: number;
  npToEquity: number;
  paybackProjectYears: number;
  paybackEquityYears: number;
  lcoe: number;
  dscrMin: number;
  dscrAvg: number;
  llcr: number;
  grant: number;
}

export interface Result {
  flows: Flows;
  kpis: Kpis;
  capexByItem: { id: string; nameUk: string; nameEn: string; exVat: number; vat: number }[];
  debtQuarters: { month: number; date: string; opening: number; interest: number; principal: number; closing: number; cfads: number; dscr: number }[];
  annual: AnnualRow[];
}

export interface AnnualRow {
  year: number;
  generation: number;
  revenueGross: number;
  revenueNet: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  interestExpense: number;
  grantIncome: number;
  pbt: number;
  tax: number;
  netProfit: number;
  capexExVat: number;
  capexVat: number;
  idc: number;
  fee: number;
  debtDraw: number;
  equityIn: number;
  principal: number;
  interestPaid: number;
  vatRecovered: number;
  grantCash: number;
  dividends: number;
  // balance at year end
  ppeNet: number;
  vatBalance: number;
  grantReceivable: number;
  cash: number;
  debt: number;
  interestPayable: number;
  deferredIncome: number;
  shareCapital: number;
  retainedEarnings: number;
  balanceCheck: number;
}
