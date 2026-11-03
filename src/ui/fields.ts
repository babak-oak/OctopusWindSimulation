import type { Assumptions } from '../engine/types';
import { gridMW, landHa, netAEP } from '../engine/model';
import type { T } from './i18n';

export type Kind = 'number' | 'percent' | 'bool' | 'month' | 'date' | 'staff';
export interface Field {
  path: string;
  label: T;
  unit: T;
  kind: Kind;
  source: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  note?: T;
  /** reference value at `path`, effective value scales with the layout unless overridden at `manual` */
  scaled?: { manual: string; eff: (a: Assumptions) => number; basis: 'turbines' | 'installedMW' };
}
export interface Group {
  id: string;
  title: T;
  fields: Field[];
}

const u = (uk: string, en = uk): T => ({ uk, en });
const pctU = u('%');

export const GROUPS: Group[] = [
  {
    id: 'project', title: u('Проєкт', 'Project'), fields: [
      { path: 'project.turbines', label: u('Кількість ВЕУ', 'Turbines'), unit: u('шт.', 'pcs'), kind: 'number', source: 'Input!K26', min: 1, max: 100 },
      { path: 'project.turbineMW', label: u('Потужність ВЕУ', 'Turbine rating'), unit: u('МВт', 'MW'), kind: 'number', source: 'Input!K24', min: 2, max: 10, decimals: 2 },
      { path: 'project.gridMW', label: u('Проєктна потужність (приєднання)', 'Project (grid) capacity'), unit: u('МВт', 'MW'), kind: 'number', source: 'Пропозиція SANY, C16: 72 МВт при 75 МВт встановлених', min: 1, max: 1000, decimals: 1, scaled: { manual: 'project.manualGridMW', eff: gridMW, basis: 'installedMW' } },
      { path: 'project.startDate', label: u('Початок будівництва', 'Construction start'), unit: u('місяць 1', 'month 1'), kind: 'date', source: 'Рішення 03.11.2026' },
      { path: 'project.lifeYears', label: u('Строк експлуатації', 'Operating life'), unit: u('років', 'years'), kind: 'number', source: 'Рішення 03.11.2026', min: 10, max: 35 },
    ],
  },
  {
    id: 'generation', title: u('Генерація', 'Generation'), fields: [
      { path: 'generation.netAEP_MWh', label: u('Net AEP P50', 'Net AEP P50'), unit: u('МВт·год/рік', 'MWh/yr'), kind: 'number', source: 'Пропозиція SANY, C20–C22: Gross 253.5 ГВт·год − затінення 5.5%', min: 1, scaled: { manual: 'generation.manualAEP', eff: netAEP, basis: 'installedMW' } },
      { path: 'generation.aepIncludesLosses', label: u('Net AEP містить доступність і техвтрати', 'Net AEP includes availability and losses'), unit: u('так / ні', 'yes / no'), kind: 'bool', source: 'Презентація, слайд 14; рішення 03.11' },
      { path: 'generation.availability', label: u('Доступність', 'Availability'), unit: pctU, kind: 'percent', source: 'Рішення 03.11.2026', min: 0.85, max: 1, decimals: 1 },
      { path: 'generation.techLosses', label: u('Технологічні втрати', 'Technical losses'), unit: pctU, kind: 'percent', source: 'Input!K25', min: 0, max: 0.1, decimals: 1 },
    ],
  },
  {
    id: 'market', title: u('Ціна і продаж', 'Price and sales'), fields: [
      { path: 'market.basePrice', label: u('Середня ціна РДН за всі години, 2026', 'Average DAM price, all hours, 2026'), unit: u('€/МВт·год', 'EUR/MWh'), kind: 'number', source: '98 $ за курсом ЄЦБ 1.1188 (26.10.2026); рішення 02.11', min: 20, max: 250, decimals: 2 },
      { path: 'market.priceIndexation', label: u('Індексація ціни', 'Price indexation'), unit: u('%/рік', '%/yr'), kind: 'percent', source: 'Рішення 03.11: індексується лише OPEX', min: 0, max: 0.05, decimals: 1 },
      { path: 'market.traderFee', label: u('Комісія трейдера (вкл. небаланси)', 'Trader fee (incl. imbalances)'), unit: u('% доходу', '% of revenue'), kind: 'percent', source: 'Input!K32; рішення 03.11', min: 0, max: 0.2, decimals: 1 },
      { path: 'market.imbalance', label: u('Небаланси окремо', 'Imbalances, separate'), unit: u('% доходу', '% of revenue'), kind: 'percent', source: 'Рішення 03.11: входять у комісію', min: 0, max: 0.1, decimals: 1 },
    ],
  },
  {
    id: 'opex', title: u('OPEX, ціни 2026 р.', 'OPEX, 2026 prices'), fields: [
      { path: 'opex.omPerMW', label: u('Ремонт і сервіс', 'O&M'), unit: u('€/МВт/рік', 'EUR/MW/yr'), kind: 'number', source: 'Input!K38', min: 0, max: 80000 },
      { path: 'opex.staffRoles', label: u('Персонал', 'Staff'), unit: u('осіб', 'people'), kind: 'staff', source: 'Staff!C7:E12, без трейдерів; чисельність частини посад росте сходинками з кількістю ВЕУ' },
      { path: 'opex.insurancePctCapex', label: u('Страхування', 'Insurance'), unit: u('% CAPEX', '% of CAPEX'), kind: 'percent', source: 'Input!K37', min: 0, max: 0.01, decimals: 2 },
      { path: 'opex.rentPerHa', label: u('Оренда землі', 'Land lease'), unit: u('€/га/рік', 'EUR/ha/yr'), kind: 'number', source: 'Input!K36', min: 0 },
      { path: 'opex.landHa', label: u('Площа землі', 'Land area'), unit: u('га', 'ha'), kind: 'number', source: 'Input!K17: 6 га на 12 ВЕУ', min: 0, decimals: 2, scaled: { manual: 'opex.manualLandHa', eff: landHa, basis: 'turbines' } },
      { path: 'opex.dispatchUAHperMWh', label: u('Диспетчеризація Укренерго', 'Ukrenergo dispatch'), unit: u('грн/МВт·год', 'UAH/MWh'), kind: 'number', source: 'НКРЕКП, з 01.07.2026', min: 0, decimals: 2 },
      { path: 'opex.marketOpVarUAHperMWh', label: u('Оператор ринку, змінна', 'Market operator, variable'), unit: u('грн/МВт·год', 'UAH/MWh'), kind: 'number', source: 'НКРЕКП № 2167 від 19.12.2025', min: 0, decimals: 2 },
      { path: 'opex.marketOpFixUAHperMonth', label: u('Оператор ринку, постійна', 'Market operator, fixed'), unit: u('грн/міс.', 'UAH/month'), kind: 'number', source: 'НКРЕКП № 2167 від 19.12.2025', min: 0, decimals: 2 },
      { path: 'opex.nkrekpPctRevenue', label: u('Плата НКРЕКП', 'NEURC fee'), unit: u('% доходу', '% of revenue'), kind: 'percent', source: 'Input!K41', min: 0, max: 0.01, decimals: 2 },
      { path: 'opex.otherPctRevenue', label: u('Інші витрати', 'Other costs'), unit: u('% доходу', '% of revenue'), kind: 'percent', source: 'Input!K43', min: 0, max: 0.05, decimals: 2 },
      { path: 'opex.adminPerMonth', label: u('Адміністративні', 'Administration'), unit: u('€/міс.', 'EUR/month'), kind: 'number', source: 'Input!K44', min: 0 },
      { path: 'opex.indexation', label: u('Індексація OPEX', 'OPEX indexation'), unit: u('%/рік', '%/yr'), kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 0.1, decimals: 1 },
      { path: 'fx.uahPerEur', label: u('Курс', 'Exchange rate'), unit: u('грн/€', 'UAH/EUR'), kind: 'number', source: 'НБУ на 03.11.2026', min: 20, max: 100, decimals: 4 },
    ],
  },
  {
    id: 'schedule', title: u('Будівництво', 'Construction'), fields: [
      { path: 'schedule.portPct', label: u('ВЕУ: платіж при прибутті в порт', 'Turbines: payment on port arrival'), unit: pctU, kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 1, decimals: 0 },
      { path: 'schedule.firstArrivalMonth', label: u('Перше прибуття в порт', 'First port arrival'), unit: u('міс.', 'month'), kind: 'month', source: 'Рішення 03.11.2026', min: 1, max: 18 },
      { path: 'schedule.turbinesPerMonth', label: u('Прибуває ВЕУ на місяць', 'Turbines arriving per month'), unit: u('шт.', 'pcs'), kind: 'number', source: 'Рішення 03.11.2026', min: 1, max: 20 },
      { path: 'schedule.worksFirstPct', label: u('Роботи: частка в місяцях 1–9', 'Works: share in months 1–9'), unit: pctU, kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 1, decimals: 0 },
      { path: 'schedule.montageStartMonth', label: u('Монтаж ВЕУ: початок', 'Turbine installation: start'), unit: u('міс.', 'month'), kind: 'month', source: 'Рішення 03.11.2026', min: 1, max: 18 },
      { path: 'capex.contingencyPct', label: u('Непередбачувані', 'Contingency'), unit: u('% CAPEX', '% of CAPEX'), kind: 'percent', source: 'Input!M14', min: 0, max: 0.2, decimals: 1 },
    ],
  },
  {
    id: 'finance', title: u('Фінансування і податки', 'Financing and tax'), fields: [
      { path: 'finance.debtShare', label: u('Частка боргу', 'Debt share'), unit: pctU, kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 0.9, decimals: 0 },
      { path: 'finance.rate', label: u('Ставка кредиту, EUR', 'Loan rate, EUR'), unit: u('%/рік', '%/yr'), kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 0.2, decimals: 2 },
      { path: 'finance.tenorYears', label: u('Строк погашення після введення', 'Repayment after COD'), unit: u('років', 'years'), kind: 'number', source: 'Рішення 03.11.2026', min: 1, max: 20 },
      { path: 'finance.dividendEveryMonths', label: u('Дивіденди: кожні N місяців (12 = щогрудня)', 'Dividends every N months (12 = each December)'), unit: u('міс.', 'months'), kind: 'number', source: 'Рішення 03.11.2026: щокварталу, у дати платежів за кредитом', min: 1, max: 12 },
      { path: 'finance.feePct', label: u('Комісія (у тілі кредиту)', 'Arrangement fee (capitalised)'), unit: u('% кредиту', '% of loan'), kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 0.03, decimals: 2 },
      { path: 'finance.costOfEquity', label: u('Вартість капіталу', 'Cost of equity'), unit: pctU, kind: 'percent', source: 'Рішення 03.11.2026', min: 0, max: 0.3, decimals: 1 },
      { path: 'finance.taxRate', label: u('Податок на прибуток', 'Corporate income tax'), unit: pctU, kind: 'percent', source: 'Input!K49', min: 0, max: 0.4, decimals: 0 },
      { path: 'finance.depreciationYears', label: u('Амортизація', 'Depreciation'), unit: u('років', 'years'), kind: 'number', source: 'Рішення 03.11.2026', min: 5, max: 40 },
    ],
  },
];

export function getPath(a: Assumptions, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], a);
}
export function setPath(a: Assumptions, path: string, v: unknown): Assumptions {
  const b = structuredClone(a);
  const ks = path.split('.');
  let o = b as unknown as Record<string, unknown>;
  for (const k of ks.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[ks.at(-1)!] = v;
  return b;
}

/** OEM presets (ТЗ 6.2): turbine price incl. delivery to site, EUR/kW. */
export const OEM = [
  { id: 'sany', name: 'SANY', rate: 655, note: u('Пропозиція SANY, з доставкою', 'SANY offer, delivered') },
  { id: 'nordex', name: 'Nordex', rate: 898, note: u('858 CIF Клайпеда + 40 доставка (оцінка)', '858 CIF Klaipeda + 40 delivery (estimate)') },
  { id: 'vestas', name: 'Vestas', rate: 998, note: u('958 CIF Клайпеда + 40 доставка (оцінка)', '958 CIF Klaipeda + 40 delivery (estimate)') },
];
