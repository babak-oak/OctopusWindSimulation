// Project workbook with live formulas: a TypeScript port of scripts/build_reference_xlsx.py (the reference model that
// is cross-checked against the engine), extended with the site-wind input, UA/EN labels and value sheets for the
// sensitivity analysis and the risk register.
import type { Assumptions, MarketData } from '../engine/types';
import { netAEP, windShares } from '../engine/model';
import { applyScenario, heatmap, riskRegister, scenarioTable, waterfall, type ScenarioId, type StressSizes } from '../engine/scenarios';
import { CURVES, siteNetAEP } from '../engine/wind';
import { Book, colLetter as CL, type Sheet, type Style } from './book';

export interface ExportCtx {
  /** the user's assumptions, without the scenario applied */
  base: Assumptions;
  md: MarketData;
  lang: 'uk' | 'en';
  scenario: ScenarioId;
  stress: StressSizes;
}

const NUM = '#,##0;(#,##0);"-"';
const NUM2 = '#,##0.00;(#,##0.00);"-"';
const PCT = '0.0%;(0.0%);"-"';
const PCT2 = '0.00%;(0.00%);"-"';

export const HEAT_PRICES = [-0.3, -0.2, -0.1, 0, 0.1, 0.2];
export const HEAT_CAPEX = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];

export function buildBook(ctx: ExportCtx): { book: Book; timelineOrder: [string, number, number][]; kpiRow: Record<string, number> } {
  const uk = ctx.lang === 'uk';
  const T = (u: string, e: string) => (uk ? u : e);
  const A = applyScenario(ctx.base, ctx.scenario, ctx.stress);
  const md = ctx.md;
  const book = new Book();
  const put = (ws: Sheet, r: number, c: number, v: string | number | boolean | null, style?: Style, fmt?: string) => {
    const cell = typeof v === 'string' && v.startsWith('=') ? { f: v } : { v };
    ws.set(r, c, { ...cell, style, fmt });
  };
  const header = (ws: Sheet, row: number, cols: string[]) => cols.forEach((v, i) => put(ws, row, i + 1, v, 'head'));

  const p = A.project, g = A.generation, m = A.market, o = A.opex, fi = A.finance, s = A.schedule, cp = A.compensation, st = A.stress;
  const D = T('Рішення 03.11.2026', 'Decision 03.11.2026');
  const site = g.site?.mode === 'site' && g.site.result ? g.site : undefined;
  const scenarioName: Record<ScenarioId, string> = {
    base: T('База', 'Base'), S1: T('S1 Обмеження Укренерго', 'S1 Ukrenergo curtailment'), S2: T('S2 CAPEX +', 'S2 CAPEX +') + Math.round(ctx.stress.capexUp * 100) + '%',
    S3: T('S3 РДН −', 'S3 DAM −') + Math.round(ctx.stress.priceDown * 100) + '%', S4: T('S4 Комбінований', 'S4 Combined'),
  };

  // ---------------- Inputs ----------------
  const wi = book.add('Inputs');
  put(wi, 1, 1, `${p.name} — ${T('модель з формулами', 'model with formulas')} · ${T('сценарій', 'scenario')}: ${scenarioName[ctx.scenario]}`, 'title');
  put(wi, 2, 1, T(
    'Сині комірки — вхідні дані, жовті — ключові. Усі інші аркуші — формули. EUR без ПДВ, ціни 2026 р. Суму кредиту з капіталізованими відсотками і комісією рахує аркуш Funding послідовними проходами, без циклічних посилань.',
    'Blue cells are inputs, yellow are key assumptions. All other sheets are formulas. EUR ex VAT, 2026 prices. The Funding sheet sizes the loan with capitalised interest and fee by successive passes, without circular references.'), 'note');
  header(wi, 4, [T('Код', 'Code'), T('Параметр', 'Parameter'), T('Значення', 'Value'), T('Одиниця', 'Unit'), T('Джерело', 'Source')]);
  const [sy, sm, sd] = p.startDate.split('-').map(Number);
  const siteAEP = site ? siteNetAEP(site, p.turbines) ?? null : null;
  const siteSrc = site
    ? `${T('За координатами', 'By coordinates')} ${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}: ERA5 ${site.result!.period[0].slice(0, 4)}–${site.result!.period[1].slice(0, 4)}, ${CURVES.find((c) => c.id === site.curveId)?.name ?? T('власна крива', 'custom curve')}, ${T('вісь', 'hub')} ${site.hub} ${T('м', 'm')}, ${T('затінення', 'wake')} ${(site.wake * 100).toFixed(1)}%, ${site.level}`
    : T('Не використовується (режим «Пропозиція виробника»)', 'Not used (manufacturer proposal mode)');
  type Row = [string, string, string, number | string | null | undefined, string, string];
  const rows: (Row | [string, string])[] = [
    [T('Проєкт', 'Project'), ''],
    ['i_turbines', 'Кількість ВЕУ', 'Number of turbines', p.turbines, T('шт.', 'pcs'), 'Input!K26'],
    ['i_turbineMW', 'Потужність ВЕУ', 'Turbine rating', p.turbineMW, T('МВт', 'MW'), 'Input!K24'],
    ['i_gridMW', 'Проєктна потужність при еталонному компонуванні', 'Grid capacity at the reference layout', p.gridMW, T('МВт', 'MW'), T('Пропозиція SANY, C16; масштабується з встановленою потужністю', 'SANY offer, C16; scales with installed MW')],
    ['i_gridMan', 'Проєктна потужність вручну (порожньо = авто)', 'Grid capacity, manual (blank = auto)', p.manualGridMW ?? null, T('МВт', 'MW'), T('Перевизначення користувача', 'User override')],
    ['i_refT', 'Еталонне компонування: кількість ВЕУ', 'Reference layout: turbines', p.reference.turbines, T('шт.', 'pcs'), T('Для масштабування доріг, кабелів, підстанції', 'Scales roads, cables, substation')],
    ['i_refMW', 'Еталонне компонування: потужність ВЕУ', 'Reference layout: turbine rating', p.reference.turbineMW, T('МВт', 'MW'), T('Для масштабування підстанції', 'Scales the substation')],
    ['i_start', 'Початок будівництва (місяць 1)', 'Construction start (month 1)', `=DATE(${sy},${sm},${sd})`, T('дата', 'date'), D],
    ['i_C', 'Тривалість будівництва', 'Construction period', p.constructionMonths, T('міс.', 'months'), D],
    ['i_life', 'Строк експлуатації', 'Operating life', p.lifeYears, T('років', 'years'), D],
    [T('Генерація', 'Generation'), ''],
    ['i_aep', 'Net AEP P50 при еталонному компонуванні (лише затінення)', 'Net AEP P50 at the reference layout (wake only)', g.netAEP_MWh, T('МВт·год/рік', 'MWh/yr'), T('Пропозиція виробника (SANY), C20–C22; масштабується з встановленою потужністю', 'Manufacturer offer (SANY), C20–C22; scales with installed MW')],
    ['i_aepSite', 'Net AEP за координатами (порожньо = не використовується)', 'Net AEP by coordinates (blank = not used)', siteAEP, T('МВт·год/рік', 'MWh/yr'), siteSrc],
    ['i_aepMan', 'Net AEP вручну (порожньо = авто)', 'Net AEP, manual (blank = auto)', g.manualAEP ?? null, T('МВт·год/рік', 'MWh/yr'), T('Перевизначення користувача', 'User override')],
    ['i_aepIncl', 'Net AEP містить доступність і техвтрати (1 = так)', 'Net AEP includes availability and losses (1 = yes)', g.aepIncludesLosses ? 1 : 0, '0/1', D],
    ['i_avail', 'Доступність', 'Availability', g.availability, '%', D],
    ['i_loss', 'Технологічні втрати', 'Technical losses', g.techLosses, '%', 'Input!K25'],
    [T('Ціна і продаж', 'Price and sales'), ''],
    ['i_price', 'Середня ціна РДН за всі години, 2026', 'Average DAM price, all hours, 2026', m.basePrice, T('€/МВт·год', 'EUR/MWh'), T('98 $ за курсом ЄЦБ 1.1188 (26.10.2026); рішення 02.11', 'USD 98 at ECB 1.1188 (26.10.2026); decision 02.11')],
    ['i_priceIdx', 'Індексація ціни', 'Price indexation', m.priceIndexation, T('%/рік', '%/yr'), T('Рішення 03.11.2026: індексується лише OPEX', 'Decision 03.11.2026: only OPEX is indexed')],
    ['i_trader', 'Комісія трейдера (вкл. балансуючу групу і небаланси)', 'Trader fee (incl. balancing group and imbalances)', m.traderFee, T('% доходу', '% of revenue'), 'Input!K32'],
    ['i_imb', 'Небаланси окремо', 'Imbalances, separate', m.imbalance, T('% доходу', '% of revenue'), T('Рішення 03.11: входять у комісію', 'Decision 03.11: inside the fee')],
    [T('OPEX (ціни 2026 р.)', 'OPEX (2026 prices)'), ''],
    ['i_om', 'Ремонт і сервіс', 'O&M and service', o.omPerMW, T('€/МВт/рік', 'EUR/MW/yr'), 'Input!K38'],
    ['i_pit', 'ПДФО', 'Personal income tax', o.payroll.pit, '%', T('ПКУ', 'Tax Code')],
    ['i_mil', 'Військовий збір', 'Military levy', o.payroll.military, '%', T('ПКУ', 'Tax Code')],
    ['i_esv', 'ЄСВ', 'Social contribution (ESV)', o.payroll.esv, '%', T('Закон про ЄСВ', 'ESV law')],
    ['i_ins', 'Страхування', 'Insurance', o.insurancePctCapex, T('% CAPEX', '% of CAPEX'), 'Input!K37'],
    ['i_rent', 'Оренда землі', 'Land lease', o.rentPerHa, T('€/га/рік', 'EUR/ha/yr'), 'Input!K36'],
    ['i_ha', 'Площа землі при еталонному компонуванні', 'Land area at the reference layout', o.landHa, T('га', 'ha'), T('Input!K17; масштабується з кількістю ВЕУ', 'Input!K17; scales with turbines')],
    ['i_haMan', 'Площа землі вручну (порожньо = авто)', 'Land area, manual (blank = auto)', o.manualLandHa ?? null, T('га', 'ha'), T('Перевизначення користувача', 'User override')],
    ['i_disp', 'Диспетчеризація Укренерго', 'Ukrenergo dispatch', o.dispatchUAHperMWh, T('грн/МВт·год', 'UAH/MWh'), T('НКРЕКП, з 01.07.2026', 'NEURC, from 01.07.2026')],
    ['i_moVar', 'Оператор ринку, змінна', 'Market operator, variable', o.marketOpVarUAHperMWh, T('грн/МВт·год', 'UAH/MWh'), T('НКРЕКП № 2167 від 19.12.2025', 'NEURC No. 2167, 19.12.2025')],
    ['i_moFix', 'Оператор ринку, постійна', 'Market operator, fixed', o.marketOpFixUAHperMonth, T('грн/міс.', 'UAH/month'), T('НКРЕКП № 2167 від 19.12.2025', 'NEURC No. 2167, 19.12.2025')],
    ['i_nkrekp', 'Плата за регулювання НКРЕКП', 'NEURC regulatory fee', o.nkrekpPctRevenue, T('% доходу', '% of revenue'), 'Input!K41'],
    ['i_other', 'Інші витрати', 'Other costs', o.otherPctRevenue, T('% доходу', '% of revenue'), 'Input!K43'],
    ['i_admin', 'Адміністративні', 'Administrative', o.adminPerMonth, T('€/міс.', 'EUR/month'), 'Input!K44'],
    ['i_idx', 'Індексація OPEX', 'OPEX indexation', o.indexation, T('%/рік', '%/yr'), D],
    ['i_baseYear', 'Базовий рік цін', 'Price base year', o.baseYear, T('рік', 'year'), T('Ціни 2026 р.', '2026 prices')],
    ['i_fx', 'Курс', 'Exchange rate', A.fx.uahPerEur, T('грн/€', 'UAH/EUR'), T('НБУ на 03.11.2026', 'NBU, 03.11.2026')],
    [T('CAPEX і графік', 'CAPEX and schedule'), ''],
    ['i_cont', 'Непередбачувані', 'Contingency', A.capex.contingencyPct, T('% CAPEX', '% of CAPEX'), 'Input!M14'],
    ['i_tp1m', 'ВЕУ: місяць 1-го платежу', 'Turbines: month of 1st payment', s.turbinePayments[0].month, T('міс.', 'month'), D],
    ['i_tp1', 'ВЕУ: 1-й платіж', 'Turbines: 1st payment', s.turbinePayments[0].pct, '%', D],
    ['i_tp2m', 'ВЕУ: місяць 2-го платежу', 'Turbines: month of 2nd payment', s.turbinePayments[1].month, T('міс.', 'month'), D],
    ['i_tp2', 'ВЕУ: 2-й платіж', 'Turbines: 2nd payment', s.turbinePayments[1].pct, '%', D],
    ['i_port', 'ВЕУ: платіж при прибутті в порт', 'Turbines: payment on port arrival', s.portPct, '%', D],
    ['i_arr', 'Перше прибуття в порт', 'First port arrival', s.firstArrivalMonth, T('міс.', 'month'), D],
    ['i_perM', 'Прибуває ВЕУ на місяць', 'Turbines arriving per month', s.turbinesPerMonth, T('шт.', 'pcs'), D],
    ['i_wPct', 'Роботи: частка в першому періоді', 'Works: share in the first period', s.worksFirstPct, '%', D],
    ['i_wEnd', 'Роботи: кінець першого періоду', 'Works: end of the first period', s.worksFirstEndMonth, T('міс.', 'month'), D],
    ['i_mSt', 'Монтаж ВЕУ: початок', 'Turbine installation: start', s.montageStartMonth, T('міс.', 'month'), D],
    ['i_devM', 'Девелопмент: місяць оплати', 'Development: payment month', s.devMonth, T('міс.', 'month'), D],
    [T('Фінансування і податки', 'Financing and taxes'), ''],
    ['i_dShare', 'Частка боргу', 'Debt share', fi.debtShare, '%', D],
    ['i_rate', 'Ставка', 'Interest rate', fi.rate, T('%/рік', '%/yr'), D],
    ['i_tenor', 'Строк погашення після введення', 'Repayment term after COD', fi.tenorYears, T('років', 'years'), D],
    ['i_feePct', 'Комісія (додається до тіла)', 'Fee (added to principal)', fi.feePct, T('% кредиту', '% of loan'), D],
    ['i_every', 'Періодичність платежів', 'Payment frequency', fi.repayEveryMonths, T('міс.', 'months'), T('Рішення 03.11.2026: щокварталу', 'Decision 03.11.2026: quarterly')],
    ['i_divEvery', 'Періодичність дивідендів (12 = щогрудня)', 'Dividend frequency (12 = every December)', fi.dividendEveryMonths, T('міс.', 'months'), T('Щокварталу, у дати обслуговування боргу', 'Quarterly, on debt service dates')],
    ['i_ke', 'Вартість капіталу', 'Cost of equity', fi.costOfEquity, '%', D],
    ['i_tax', 'Податок на прибуток', 'Corporate income tax', fi.taxRate, '%', 'Input!K49'],
    ['i_dep', 'Амортизація', 'Depreciation period', fi.depreciationYears, T('років', 'years'), D],
    ['i_vat', 'ПДВ', 'VAT', fi.vatRate, '%', T('ПКУ', 'Tax Code')],
    [T('Компенсація 15%', '15% compensation'), ''],
    ['i_gOn', 'Компенсація увімкнена (1 = так)', 'Compensation on (1 = yes)', cp.enabled ? 1 : 0, '0/1', T('Опція', 'Option')],
    ['i_gPct', 'Розмір компенсації', 'Compensation size', cp.pct, T('% CAPEX', '% of CAPEX'), T('Постанова КМУ; база — весь CAPEX', 'CMU resolution; base: whole CAPEX')],
    ['i_gDelay', 'Надходження після введення', 'Received after COD', cp.delayMonths, T('міс.', 'months'), D],
    [T('Стрес-тести', 'Stress tests'), ''],
    ['i_cOn', 'Обмеження Укренерго увімкнене (1 = так)', 'Ukrenergo curtailment on (1 = yes)', st.curtailment.enabled ? 1 : 0, '0/1', 'S1'],
    ['i_cM1', 'Обмеження: перший місяць', 'Curtailment: first month', Math.min(...st.curtailment.months), T('міс.', 'month'), T('Червень', 'June')],
    ['i_cM2', 'Обмеження: останній місяць', 'Curtailment: last month', Math.max(...st.curtailment.months), T('міс.', 'month'), T('Серпень', 'August')],
    ['i_cH1', 'Обмеження: перша година профілю', 'Curtailment: first profile hour', Math.min(...st.curtailment.hours), T('год', 'h'), '11:00–12:00'],
    ['i_cH2', 'Обмеження: остання година профілю', 'Curtailment: last profile hour', Math.max(...st.curtailment.hours), T('год', 'h'), '14:00–15:00'],
    ['i_cCut', 'Обмеження: частка генерації', 'Curtailment: share of generation', st.curtailment.cut, '%', 'S1'],
    ['i_capexMult', 'Множник CAPEX', 'CAPEX multiplier', st.capexMult, '×', 'S2'],
    ['i_priceMult', 'Множник ціни', 'Price multiplier', st.priceMult, '×', 'S3'],
    ['i_opexMult', 'Множник OPEX', 'OPEX multiplier', st.opexMult, '×', T('Реєстр ризиків', 'Risk register')],
  ];
  const pctNames = new Set(['i_pit', 'i_mil', 'i_esv', 'i_avail', 'i_loss', 'i_priceIdx', 'i_trader', 'i_imb', 'i_ins', 'i_nkrekp', 'i_other', 'i_idx', 'i_cont', 'i_tp1', 'i_tp2', 'i_port', 'i_wPct', 'i_dShare', 'i_rate', 'i_feePct', 'i_ke', 'i_tax', 'i_vat', 'i_gPct', 'i_cCut']);
  const keyNames = new Set(['i_aep', 'i_aepSite', 'i_price', 'i_dShare', 'i_rate']);
  let r = 5;
  for (const row of rows) {
    if (row.length === 2) { put(wi, r++, 1, row[0], 'bold'); continue; }
    const [n, lu, le, v, unit, src] = row;
    put(wi, r, 1, n);
    put(wi, r, 2, uk ? lu : le);
    if (n === 'i_start') wi.set(r, 3, { f: v as string, fmt: 'dd.mm.yyyy', style: 'in' });
    else wi.set(r, 3, { v: v ?? null, fmt: pctNames.has(n) ? PCT2 : typeof v === 'number' && !Number.isInteger(v) ? '#,##0.####' : '#,##0', style: keyNames.has(n) ? 'key' : 'in' });
    put(wi, r, 4, unit);
    put(wi, r, 5, src);
    book.name(n, `Inputs!$C$${r}`);
    r++;
  }
  r++;
  put(wi, r++, 1, T('Похідні', 'Derived'), 'bold');
  const derived: [string, string, string, string, string, string][] = [
    ['d_kw', 'Потужність', 'Installed capacity', '=i_turbines*i_turbineMW*1000', T('кВт', 'kW'), NUM],
    ['d_L', 'Місяців експлуатації', 'Operating months', '=i_life*12', T('міс.', 'months'), NUM],
    ['d_T', 'Місяців у моделі', 'Months in the model', '=i_C+d_L', T('міс.', 'months'), NUM],
    ['d_mwF', 'Масштаб: встановлена потужність / еталон', 'Scale: installed MW / reference', '=d_kw/(i_refT*i_refMW*1000)', '×', '0.0000'],
    ['d_tF', 'Масштаб: кількість ВЕУ / еталон', 'Scale: turbines / reference', '=i_turbines/i_refT', '×', '0.0000'],
    ['d_aep', 'Net AEP у розрахунку', 'Net AEP used', '=IF(ISBLANK(i_aepMan),IF(ISBLANK(i_aepSite),i_aep*d_mwF,i_aepSite),i_aepMan)', T('МВт·год/рік', 'MWh/yr'), NUM],
    ['d_grid', 'Проєктна потужність у розрахунку', 'Grid capacity used', '=IF(ISBLANK(i_gridMan),i_gridMW*d_mwF,i_gridMan)', T('МВт', 'MW'), NUM2],
    ['d_ha', 'Площа землі у розрахунку', 'Land area used', '=IF(ISBLANK(i_haMan),i_ha*d_tF,i_haMan)', T('га', 'ha'), NUM2],
    ['d_staff', 'Персонал, € на рік', 'Staff, EUR per year', `=SUM(Staff!H3:H${2 + o.staffRoles.length})`, T('€/рік', 'EUR/yr'), NUM],
    ['d_E', 'Річна генерація', 'Annual generation', '=IF(i_aepIncl=1,d_aep,d_aep*i_avail*(1-i_loss))', T('МВт·год/рік', 'MWh/yr'), NUM],
    ['d_P', 'Ціна з урахуванням стресу', 'Price incl. stress', '=i_price*i_priceMult', T('€/МВт·год', 'EUR/MWh'), NUM2],
    ['d_nRep', 'Кількість платежів тіла', 'Number of principal payments', '=i_tenor*12/i_every', T('шт.', 'pcs'), NUM],
    ['d_wacc', 'WACC після податків', 'WACC after tax', '=(1-i_dShare)*i_ke+i_dShare*i_rate*(1-i_tax)', '%', PCT2],
  ];
  for (const [n, lu, le, f, unit, fmt] of derived) {
    put(wi, r, 1, n); put(wi, r, 2, uk ? lu : le);
    wi.set(r, 3, { f, fmt, style: 'norm' });
    put(wi, r, 4, unit);
    book.name(n, `Inputs!$C$${r}`);
    r++;
  }
  wi.width(1, 12); wi.width(2, 54); wi.width(3, 16); wi.width(4, 14); wi.width(5, 70);

  // ---------------- Staff ----------------
  const wsf = book.add('Staff');
  put(wsf, 1, 1, T('Персонал: чисельність = осіб × ROUNDUP(ВЕУ / N), або фіксована; вартість = чиста ЗП / (1 − ПДФО − ВЗ) × (1 + ЄСВ)',
    'Staff: headcount = people × ROUNDUP(turbines / N), or fixed; cost = net pay / (1 − PIT − levy) × (1 + ESV)'), 'bold');
  header(wsf, 2, ['ID', T('Посада', 'Role'), T('Чиста ЗП, €/міс.', 'Net pay, EUR/month'), T('Осіб', 'People'), T('На кожні N ВЕУ (порожньо = фіксовано)', 'Per N turbines (blank = fixed)'), T('Вручну, осіб', 'Manual, people'), T('Чисельність', 'Headcount'), T('Витрати, €/рік', 'Cost, EUR/yr')]);
  o.staffRoles.forEach((role, j) => {
    const rr = 3 + j;
    put(wsf, rr, 1, role.id); put(wsf, rr, 2, uk ? role.nameUk : role.nameEn);
    [role.netMonthly, role.count, role.per ?? null, role.manualCount ?? null].forEach((v, k) => wsf.set(rr, 3 + k, { v, style: 'in', fmt: '#,##0' }));
    wsf.set(rr, 7, { f: `=IF(ISBLANK(F${rr}),IF(ISBLANK(E${rr}),D${rr},D${rr}*ROUNDUP(i_turbines/E${rr},0)),F${rr})`, fmt: '0' });
    wsf.set(rr, 8, { f: `=G${rr}*C${rr}/(1-i_pit-i_mil)*(1+i_esv)*12`, fmt: NUM });
  });
  wsf.width(2, 34); wsf.width(5, 24);

  // ---------------- Profiles ----------------
  const wp = book.add('Profiles');
  put(wp, 1, 1, T('Профілі 12 × 24: година h = (h−1):00–h:00 за Києвом', 'Profiles 12 × 24: hour h = (h−1):00–h:00 Kyiv time'), 'bold');
  const sharesTitle = site
    ? T(`Частки генерації за координатами (ERA5, ${site.result!.period[0].slice(0, 4)}–${site.result!.period[1].slice(0, 4)})`, `Generation shares by coordinates (ERA5, ${site.result!.period[0].slice(0, 4)}–${site.result!.period[1].slice(0, 4)})`)
    : T("Частки генерації ('Wind Profile'!C20:Z31, GEO-NET)", "Generation shares ('Wind Profile'!C20:Z31, GEO-NET)");
  const blocks: [string, number, number[][]][] = [
    [sharesTitle, 3, windShares(A, md)],
    [T('Коефіцієнт форми ціни РДН (ОРЕЕ, 11.2025–10.2026; середнє = 1)', 'DAM price shape (OREE, 11.2025–10.2026; mean = 1)'), 18, md.priceShape],
  ];
  for (const [title, top, mat] of blocks) {
    put(wp, top, 1, title, 'bold');
    for (let h = 0; h < 24; h++) put(wp, top + 1, 2 + h, h + 1, 'bold');
    for (let mi = 0; mi < 12; mi++) {
      put(wp, top + 2 + mi, 1, mi + 1, 'bold');
      for (let h = 0; h < 24; h++) wp.set(top + 2 + mi, 2 + h, { v: mat[mi][h], style: 'in', fmt: '0.000000' });
    }
  }
  const ct = 33;
  put(wp, ct, 1, T('Частка втраченої генерації (стрес S1)', 'Share of generation lost (stress S1)'), 'bold');
  for (let h = 0; h < 24; h++) put(wp, ct + 1, 2 + h, h + 1, 'bold');
  for (let mi = 0; mi < 12; mi++) {
    const rr = ct + 2 + mi;
    put(wp, rr, 1, mi + 1, 'bold');
    for (let h = 0; h < 24; h++) {
      const col = CL(2 + h);
      wp.set(rr, 2 + h, { f: `=IF(AND(i_cOn=1,$A${rr}>=i_cM1,$A${rr}<=i_cM2,${col}$34>=i_cH1,${col}$34<=i_cH2),i_cCut,0)`, fmt: '0.00' });
    }
  }
  const t2 = 48;
  put(wp, t2, 1, T('Місячні коефіцієнти', 'Monthly factors'), 'bold');
  [T('Місяць', 'Month'), T('Частка генерації', 'Generation share'), T('Дохід / (E × ціна)', 'Revenue / (E × price)'), T('Частка без стресу', 'Share without stress'), T('Capture без стресу', 'Capture without stress')]
    .forEach((v, k) => put(wp, t2 + 1, 1 + k, v, 'bold'));
  for (let mi = 0; mi < 12; mi++) {
    const rr = t2 + 2 + mi, sr = 5 + mi, pr = 20 + mi, cr = 35 + mi;
    put(wp, rr, 1, mi + 1);
    wp.set(rr, 2, { f: `=SUMPRODUCT(B${sr}:Y${sr},1-B${cr}:Y${cr})`, fmt: '0.000000' });
    wp.set(rr, 3, { f: `=SUMPRODUCT(B${sr}:Y${sr},1-B${cr}:Y${cr},B${pr}:Y${pr})`, fmt: '0.000000' });
    wp.set(rr, 4, { f: `=SUM(B${sr}:Y${sr})`, fmt: '0.000000' });
    wp.set(rr, 5, { f: `=SUMPRODUCT(B${sr}:Y${sr},B${pr}:Y${pr})`, fmt: '0.000000' });
  }
  book.name('p_gen', `Profiles!$B$${t2 + 2}:$B$${t2 + 13}`);
  book.name('p_rev', `Profiles!$C$${t2 + 2}:$C$${t2 + 13}`);
  put(wp, t2 + 15, 1, T('Capture price без стресу, €/МВт·год', 'Capture price without stress, EUR/MWh'), 'bold');
  wp.set(t2 + 15, 3, { f: `=d_P*SUM(E${t2 + 2}:E${t2 + 13})/SUM(D${t2 + 2}:D${t2 + 13})`, fmt: NUM2 });
  book.name('p_capture', `Profiles!$C$${t2 + 15}`);

  // ---------------- CAPEX ----------------
  const wc = book.add('Capex');
  put(wc, 1, 1, T('CAPEX за статтями і місяцями будівництва, EUR без ПДВ', 'CAPEX by item and construction month, EUR ex VAT'), 'bold');
  const C = p.constructionMonths;
  header(wc, 3, ['ID', T('Стаття', 'Item'), T('Кількість', 'Quantity'), T('Ставка', 'Rate'), T('Валюта', 'Currency'), T('ПДВ (1/0)', 'VAT (1/0)'), T('Графік', 'Schedule'), T('Сума, €', 'Amount, EUR'), T('ПДВ, €', 'VAT, EUR'), T('Джерело', 'Source')]
    .concat(Array.from({ length: C }, (_, k) => `${T('М', 'M')}${k + 1}`)));
  const MC = 11, first = 4, items = A.capex.items;
  items.forEach((it, j) => {
    const rr = first + j;
    let qty: number | string;
    let auto = false;
    if (it.qtyBasis === 'installedKW') { qty = '=d_kw'; auto = true; }
    else if (it.qtyBasis === 'gridKW') { qty = '=d_grid*1000'; auto = true; }
    else if (it.manualQty !== undefined) qty = it.manualQty;
    else if (it.scale === 'turbines') { qty = `=${it.qty}*i_turbines/i_refT`; auto = true; }
    else if (it.scale === 'installedMW') { qty = `=${it.qty}*d_kw/(i_refT*i_refMW*1000)`; auto = true; }
    else qty = it.qty;
    put(wc, rr, 1, it.id); put(wc, rr, 2, uk ? it.nameUk : it.nameEn);
    wc.set(rr, 3, typeof qty === 'string' ? { f: qty, fmt: NUM, style: 'norm' } : { v: qty, fmt: NUM, style: auto ? 'norm' : 'in' });
    wc.set(rr, 4, { v: it.rate, style: 'in', fmt: '#,##0.##' });
    wc.set(rr, 5, { v: it.currency, style: 'in' });
    wc.set(rr, 6, { v: it.vat ? 1 : 0, style: 'in' });
    wc.set(rr, 7, { v: it.schedule, style: 'in' });
    wc.set(rr, 8, { f: `=C${rr}*D${rr}/IF(E${rr}="UAH",i_fx,1)*i_capexMult`, fmt: NUM });
    wc.set(rr, 9, { f: `=H${rr}*F${rr}*i_vat`, fmt: NUM });
    put(wc, rr, 10, it.source);
  });
  const lastItem = first + items.length - 1, rc = lastItem + 1, rt = rc + 1;
  put(wc, rc, 1, 'contingency'); put(wc, rc, 2, T('Непередбачувані', 'Contingency'));
  wc.set(rc, 6, { v: 1, style: 'in' }); wc.set(rc, 7, { v: 'works', style: 'in' });
  wc.set(rc, 8, { f: `=SUM(H${first}:H${lastItem})*i_cont`, fmt: NUM });
  wc.set(rc, 9, { f: `=H${rc}*F${rc}*i_vat`, fmt: NUM });
  put(wc, rc, 10, 'Input!M14');
  put(wc, rt, 2, T('Разом', 'Total'), 'bold');
  wc.set(rt, 8, { f: `=SUM(H${first}:H${rc})`, fmt: NUM, style: 'bold' });
  wc.set(rt, 9, { f: `=SUM(I${first}:I${rc})`, fmt: NUM, style: 'bold' });
  book.name('c_total', `Capex!$H$${rt}`);
  const rw = rt + 3;
  put(wc, rw - 1, 2, T('Графік оплати, частка суми', 'Payment schedule, share of amount'), 'bold');
  const sched = ['turbine', 'works', 'montage', 'dev'];
  sched.forEach((sname, j) => {
    const rr = rw + j;
    put(wc, rr, 7, sname);
    for (let k = 1; k <= C; k++) {
      const col = MC + k - 1;
      const f = sname === 'turbine'
        ? `=IF(${k}=i_tp1m,i_tp1,0)+IF(${k}=i_tp2m,i_tp2,0)+IF(${k}<i_arr,0,i_port*MAX(0,MIN(i_perM,i_turbines-(${k}-i_arr)*i_perM))/i_turbines)`
        : sname === 'works' ? `=IF(${k}<=i_wEnd,i_wPct/i_wEnd,(1-i_wPct)/(i_C-i_wEnd))`
          : sname === 'montage' ? `=IF(${k}>=i_mSt,1/(i_C-i_mSt+1),0)` : `=IF(${k}=i_devM,1,0)`;
      wc.set(rr, col, { f, fmt: '0.0000' });
    }
    wc.set(rr, 8, { f: `=SUM(${CL(MC)}${rr}:${CL(MC + C - 1)}${rr})`, fmt: '0.0000' });
  });
  const wfirst = rw, wlast = rw + 3;
  for (let j = 0; j <= items.length; j++) {
    const rr = first + j;
    for (let k = 1; k <= C; k++) {
      const col = CL(MC + k - 1);
      wc.set(rr, MC + k - 1, { f: `=$H${rr}*INDEX(${col}$${wfirst}:${col}$${wlast},MATCH($G${rr},$G$${wfirst}:$G$${wlast},0))`, fmt: NUM });
    }
  }
  for (let k = 1; k <= C; k++) {
    const col = CL(MC + k - 1);
    wc.set(rt, MC + k - 1, { f: `=SUM(${col}${first}:${col}${rc})`, fmt: NUM, style: 'bold' });
  }
  const rv = wlast + 2, rd = rv + 1;
  put(wc, rv, 2, T('ПДВ за місяцями', 'VAT by month'), 'bold');
  for (let k = 1; k <= C; k++) {
    const col = CL(MC + k - 1);
    wc.set(rv, MC + k - 1, { f: `=SUMPRODUCT(${col}${first}:${col}${rc},$F$${first}:$F$${rc})*i_vat`, fmt: NUM });
  }
  put(wc, rd, 2, T('Девелопмент з ПДВ (фінансується капіталом)', 'Development incl. VAT (equity-funded)'), 'bold');
  wc.set(rd, 8, { f: `=SUMPRODUCT(($G$${first}:$G$${rc}="dev")*$H$${first}:$H$${rc}*(1+$F$${first}:$F$${rc}*i_vat))`, fmt: NUM });
  book.name('c_dev', `Capex!$H$${rd}`);
  book.name('c_month', `Capex!$${CL(MC)}$${rt}:$${CL(MC + C - 1)}$${rt}`);
  book.name('c_vat', `Capex!$${CL(MC)}$${rv}:$${CL(MC + C - 1)}$${rv}`);
  wc.width(2, 36); wc.width(10, 30);
  for (let col = 3; col < MC + C; col++) if (col !== 10) wc.width(col, 12);

  // ---------------- Funding ----------------
  const wf = book.add('Funding');
  put(wf, 1, 1, T('Фінансування будівництва послідовними наближеннями: кожен прохід бере суму кредиту з попереднього. Похибка падає приблизно в 20 разів за прохід; 8 проходів дають збіжність до центів.',
    'Construction financing by successive passes: each pass takes the loan amount from the previous one. The error falls about 20 times per pass; 8 passes converge to cents.'), 'bold');
  const NP = 8;
  put(wf, 3, 1, T('Місяць будівництва', 'Construction month'), 'bold');
  for (let k = 1; k <= C; k++) put(wf, 3, 3 + k, k, 'bold');
  put(wf, 4, 1, T('CAPEX без ПДВ', 'CAPEX ex VAT')); put(wf, 5, 1, T('ПДВ', 'VAT')); put(wf, 6, 1, T('Девелопмент з ПДВ (капітал)', 'Development incl. VAT (equity)'));
  for (let k = 1; k <= C; k++) {
    const col = CL(3 + k);
    wf.set(4, 3 + k, { f: `=INDEX(c_month,1,${col}$3)`, fmt: NUM });
    wf.set(5, 3 + k, { f: `=INDEX(c_vat,1,${col}$3)`, fmt: NUM });
    wf.set(6, 3 + k, { f: `=IF(${col}$3=i_devM,c_dev,0)`, fmt: NUM });
  }
  const lastCol = CL(3 + C);
  put(wf, 8, 1, T('Прохід 0: потреба без відсотків і комісії', 'Pass 0: need without interest and fee'), 'bold');
  put(wf, 9, 1, T('F (потреба)', 'F (need)')); wf.set(9, 2, { f: `=SUM(D4:${lastCol}5)`, fmt: NUM });
  put(wf, 10, 1, T('D (кредит)', 'D (loan)')); wf.set(10, 2, { f: '=i_dShare*B9', fmt: NUM });
  put(wf, 11, 1, T('d (частка кредиту без девелопменту)', 'd (loan share ex development)')); wf.set(11, 2, { f: '=B10/(B9-c_dev)', fmt: '0.000000' });
  let prevD = 'B10', prevd = 'B11';
  let row = 13;
  let last = { idc: 0, fee: 0, need: 0, draw: 0, F: 0, D: 0 };
  for (let pn = 1; pn <= NP; pn++) {
    put(wf, row, 1, `${T('Прохід', 'Pass')} ${pn}`, 'bold');
    const ro = row + 1, ri = row + 2, rf = row + 3, rn = row + 4, rdw = row + 5, rcl = row + 6;
    [T('Кредит на початок', 'Loan, opening'), T('Відсотки (капіталізовані)', 'Interest (capitalised)'), T('Комісія', 'Fee'), T('Потреба', 'Need'), T('Вибірка кредиту', 'Loan draw'), T('Кредит на кінець', 'Loan, closing')]
      .forEach((lab, k) => put(wf, ro + k, 1, lab));
    for (let k = 1; k <= C; k++) {
      const c = CL(3 + k), pc = CL(2 + k);
      wf.set(ro, 3 + k, { f: k === 1 ? '=0' : `=${pc}${rcl}`, fmt: NUM });
      wf.set(ri, 3 + k, { f: `=${c}${ro}*i_rate/12`, fmt: NUM });
      wf.set(rf, 3 + k, { f: `=IF(${c}$3=1,i_feePct*${prevD},0)`, fmt: NUM });
      wf.set(rn, 3 + k, { f: `=${c}$4+${c}$5+${c}${ri}+${c}${rf}`, fmt: NUM });
      wf.set(rdw, 3 + k, { f: `=${prevd}*(${c}${rn}-${c}$6)`, fmt: NUM });
      wf.set(rcl, 3 + k, { f: `=${c}${ro}+${c}${rdw}`, fmt: NUM });
    }
    const rF = row + 7, rD = row + 8, rdd = row + 9;
    put(wf, rF, 1, T('F (потреба)', 'F (need)')); wf.set(rF, 2, { f: `=SUM(D${rn}:${lastCol}${rn})`, fmt: NUM });
    put(wf, rD, 1, T('D (кредит)', 'D (loan)')); wf.set(rD, 2, { f: `=i_dShare*B${rF}`, fmt: NUM });
    put(wf, rdd, 1, 'd'); wf.set(rdd, 2, { f: `=B${rD}/(B${rF}-c_dev)`, fmt: '0.000000' });
    last = { idc: ri, fee: rf, need: rn, draw: rdw, F: rF, D: rD };
    prevD = `B${rD}`; prevd = `B${rdd}`;
    row += 11;
  }
  put(wf, row, 1, T('Збіжність: зміна F за останній прохід, €', 'Convergence: change of F in the last pass, EUR'), 'bold');
  wf.set(row, 2, { f: `=B${last.F}-B${last.F - 11}`, fmt: NUM2 });
  for (const key of ['idc', 'fee', 'need', 'draw'] as const) book.name(`f_${key}`, `Funding!$D$${last[key]}:$${lastCol}$${last[key]}`);
  wf.width(1, 44); wf.width(2, 16);

  // ---------------- Timeline ----------------
  const wt = book.add('Timeline');
  const TM = C + p.lifeYears * 12;
  const c0 = 4;
  type Fn = ((c: string, pr: string, k: number) => string | number) | null;
  const L: { key: string; label: string; fn: Fn; fmt: string; bold: boolean }[] = [];
  const R: Record<string, number> = {};
  const add = (key: string, lu: string, le: string, fn: Fn, fmt = NUM, bold = false) => { R[key] = L.length + 3; L.push({ key, label: uk ? lu : le, fn, fmt, bold }); };
  const cum = (key: string, expr: (c: string) => string) => (c: string, pr: string, k: number) => (k === 1 ? `=${expr(c)}` : `=${pr}${R[key]}+${expr(c)}`);
  add('t', 't, місяць', 't, month', (_c, _p, k) => k, '0');
  add('date', 'Кінець місяця', 'Month end', (c) => `=EOMONTH(i_start,${c}${R.t}-1)`, 'mm.yyyy');
  add('year', 'Рік', 'Year', (c) => `=YEAR(${c}${R.date})`, '0');
  add('mon', 'Місяць року', 'Calendar month', (c) => `=MONTH(${c}${R.date})`, '0');
  add('o', 'Місяць експлуатації', 'Operating month', (c) => `=MAX(0,${c}${R.t}-i_C)`, '0');
  add('ops', 'Експлуатація (1/0)', 'Operating (1/0)', (c) => `=IF(${c}${R.o}>0,1,0)`, '0');
  add('q', 'Квартал платежу (1/0)', 'Payment period (1/0)', (c) => `=IF(AND(${c}${R.o}>0,MOD(${c}${R.o},i_every)=0),1,0)`, '0');
  add('book', 'Нарахування податку (1/0)', 'Tax booking (1/0)', (c) => `=IF(OR(${c}${R.mon}=12,${c}${R.t}=d_T),1,0)`, '0');
  add('h1', 'БУДІВНИЦТВО', 'CONSTRUCTION', null);
  add('capex', 'CAPEX без ПДВ', 'CAPEX ex VAT', (c) => `=IF(${c}${R.t}<=i_C,INDEX(c_month,1,${c}${R.t}),0)`);
  add('vat', 'ПДВ на CAPEX', 'VAT on CAPEX', (c) => `=IF(${c}${R.t}<=i_C,INDEX(c_vat,1,${c}${R.t}),0)`);
  add('dev', 'Девелопмент з ПДВ (капітал)', 'Development incl. VAT (equity)', (c) => `=IF(${c}${R.t}=i_devM,c_dev,0)`);
  add('dOpen', 'Кредит на початок', 'Loan, opening', (_c, pr, k) => (k === 1 ? '=0' : `=${pr}${R.dClose}`));
  add('idc', 'Відсотки за будівництво (капіталізовані)', 'Construction interest (capitalised)', (c) => `=IF(${c}${R.ops}=0,INDEX(f_idc,1,${c}${R.t}),0)`);
  add('fee', 'Комісія за кредит', 'Loan fee', (c) => `=IF(${c}${R.ops}=0,INDEX(f_fee,1,${c}${R.t}),0)`);
  add('need', 'Потреба фінансування', 'Funding need', (c) => `=IF(${c}${R.ops}=0,${c}${R.capex}+${c}${R.vat}+${c}${R.idc}+${c}${R.fee},0)`);
  add('draw', 'Вибірка кредиту', 'Loan draw', (c) => `=IF(${c}${R.ops}=0,INDEX(f_draw,1,${c}${R.t}),0)`);
  add('eq', 'Внесок капіталу', 'Equity contribution', (c) => `=IF(${c}${R.ops}=0,${c}${R.need}-${c}${R.draw},0)`);
  add('h2', 'ЕКСПЛУАТАЦІЯ', 'OPERATIONS', null);
  add('idxO', 'Індекс OPEX', 'OPEX index', (c) => `=(1+i_idx)^(${c}${R.year}-i_baseYear)`, '0.0000');
  add('gen', 'Генерація, МВт·год', 'Generation, MWh', (c) => `=${c}${R.ops}*d_E*INDEX(p_gen,${c}${R.mon})`);
  add('revG', 'Дохід валовий', 'Gross revenue', (c) => `=${c}${R.ops}*d_E*d_P*INDEX(p_rev,${c}${R.mon})*(1+i_priceIdx)^(${c}${R.year}-i_baseYear)`);
  add('revN', 'Чистий дохід', 'Net revenue', (c) => `=${c}${R.revG}*(1-i_trader-i_imb)`);
  add('opex', 'OPEX', 'OPEX', (c) => `=${c}${R.ops}*i_opexMult*((i_om*d_kw/1000+d_staff+i_ins*c_total+i_rent*d_ha+i_admin*12+i_moFix*12/i_fx)/12*${c}${R.idxO}+(i_disp+i_moVar)/i_fx*${c}${R.gen}*${c}${R.idxO}+(i_nkrekp+i_other)*${c}${R.revG})`);
  add('ebitda', 'EBITDA', 'EBITDA', (c) => `=${c}${R.revN}-${c}${R.opex}`, NUM, true);
  add('dep', 'Амортизація', 'Depreciation', (c) => `=${c}${R.ops}*k_ppe/(i_dep*12)`);
  add('intExp', 'Відсотки (витрати)', 'Interest expense', (c) => `=${c}${R.ops}*${c}${R.dOpen}*i_rate/12`);
  add('ipOpen', 'Відсотки до сплати, на початок', 'Interest payable, opening', (_c, pr, k) => (k === 1 ? '=0' : `=${pr}${R.ipClose}`));
  add('intPaid', 'Відсотки сплачені', 'Interest paid', (c) => `=${c}${R.q}*(${c}${R.ipOpen}+${c}${R.intExp})`);
  add('ipClose', 'Відсотки до сплати, на кінець', 'Interest payable, closing', (c) => `=${c}${R.ipOpen}+${c}${R.intExp}-${c}${R.intPaid}`);
  add('princ', 'Погашення тіла', 'Principal repaid', (c) => `=IF(AND(${c}${R.q}=1,${c}${R.o}/i_every<=d_nRep),MIN(k_D/d_nRep,${c}${R.dOpen}),0)`);
  add('dClose', 'Кредит на кінець', 'Loan, closing', (c) => `=${c}${R.dOpen}+${c}${R.draw}-${c}${R.princ}`);
  add('vOpen', 'ПДВ до відшкодування, на початок', 'VAT receivable, opening', (_c, pr, k) => (k === 1 ? '=0' : `=${pr}${R.vClose}`));
  add('vatRec', 'ПДВ зараховано', 'VAT recovered', (c, _p, k) => `=${c}${R.q}*MIN(${c}${R.vOpen}+${c}${R.vat},i_vat*SUM(${CL(Math.max(c0, k + c0 - 3))}${R.revN}:${c}${R.revN}))`);
  add('vClose', 'ПДВ до відшкодування, на кінець', 'VAT receivable, closing', (c) => `=${c}${R.vOpen}+${c}${R.vat}-${c}${R.vatRec}`);
  add('gRecog', 'Компенсація визнана', 'Compensation recognised', (c) => `=IF(${c}${R.o}=1,k_G,0)`);
  add('gCash', 'Компенсація отримана', 'Compensation received', (c) => `=IF(AND(${c}${R.o}=i_gDelay,k_G>0),k_G,0)`);
  add('gInc', 'Дохід від компенсації (IAS 20)', 'Compensation income (IAS 20)', (c) => `=${c}${R.ops}*k_G/d_L`);
  add('gRec', 'Компенсація до отримання', 'Compensation receivable', cum('gRec', (c) => `${c}${R.gRecog}-${c}${R.gCash}`));
  add('defInc', 'Відстрочений дохід', 'Deferred income', cum('defInc', (c) => `${c}${R.gRecog}-${c}${R.gInc}`));
  add('h3', 'ПОДАТКИ', 'TAXES', null);
  add('txb', 'Оподатковуваний результат місяця', 'Taxable result of the month', (c) => `=${c}${R.ebitda}-${c}${R.dep}-${c}${R.intExp}`);
  add('ytd', 'Наростаючий з початку року', 'Year to date', (c, pr, k) => (k === 1 ? `=${c}${R.txb}` : `=IF(${pr}${R.book}=1,0,${pr}${R.ytd})+${c}${R.txb}`));
  add('lcfO', 'Збиток минулих років, на початок', 'Loss carried forward, opening', (_c, pr, k) => (k === 1 ? '=0' : `=${pr}${R.lcfC}`));
  add('tax', 'Податок на прибуток', 'Income tax', (c) => `=${c}${R.book}*MAX(0,${c}${R.ytd}+${c}${R.lcfO})*i_tax`);
  add('lcfC', 'Збиток минулих років, на кінець', 'Loss carried forward, closing', (c) => `=IF(${c}${R.book}=1,MIN(0,${c}${R.ytd}+${c}${R.lcfO}),${c}${R.lcfO})`);
  add('txbU', 'Без боргового щита: результат місяця', 'Unlevered: result of the month', (c) => `=${c}${R.ebitda}-${c}${R.ops}*c_total/(i_dep*12)`);
  add('ytdU', 'Без боргового щита: наростаючий', 'Unlevered: year to date', (c, pr, k) => (k === 1 ? `=${c}${R.txbU}` : `=IF(${pr}${R.book}=1,0,${pr}${R.ytdU})+${c}${R.txbU}`));
  add('lcfUO', 'Без боргового щита: збиток, на початок', 'Unlevered: loss, opening', (_c, pr, k) => (k === 1 ? '=0' : `=${pr}${R.lcfUC}`));
  add('taxU', 'Податок без боргового щита', 'Unlevered tax', (c) => `=${c}${R.book}*MAX(0,${c}${R.ytdU}+${c}${R.lcfUO})*i_tax`);
  add('lcfUC', 'Без боргового щита: збиток, на кінець', 'Unlevered: loss, closing', (c) => `=IF(${c}${R.book}=1,MIN(0,${c}${R.ytdU}+${c}${R.lcfUO}),${c}${R.lcfUO})`);
  add('np', 'Чистий прибуток', 'Net profit', (c) => `=${c}${R.ebitda}-${c}${R.dep}-${c}${R.intExp}+${c}${R.gInc}-${c}${R.tax}`, NUM, true);
  add('h4', 'ГРОШІ', 'CASH', null);
  add('cfads', 'Грошовий потік для обслуговування боргу', 'Cash flow available for debt service', (c) => `=${c}${R.ebitda}-${c}${R.tax}+${c}${R.vatRec}`);
  add('cOpen', 'Гроші на початок', 'Cash, opening', (_c, pr, k) => (k === 1 ? '=0' : `=${pr}${R.cClose}`));
  add('cPre', 'Гроші до дивідендів', 'Cash before dividends', (c) => `=${c}${R.cOpen}+${c}${R.ops}*(${c}${R.cfads}+${c}${R.gCash}-${c}${R.intPaid}-${c}${R.princ})`);
  add('minC', 'Мінімальний залишок', 'Minimum balance', (c) => `=${c}${R.opex}+${c}${R.dClose}*i_rate/12`);
  add('pre', 'Гроші за місяць до дивідендів', 'Cash of the month before dividends', (c) => `=${c}${R.ops}*(${c}${R.cfads}+${c}${R.gCash}-${c}${R.intPaid}-${c}${R.princ})`);
  add('cumPre', 'Наростаючим до дивідендів', 'Cumulative before dividends', cum('cumPre', (c) => `${c}${R.pre}`));
  add('hReq', 'Мінімальний залишок мінус наростаючий потік', 'Minimum balance less cumulative flow', (c) => `=${c}${R.minC}-${c}${R.cumPre}`);
  add('keep', 'Резерв: залишок, що покриває всі наступні місяці', 'Reserve covering all later months', (c, _p, k) => (k === TM ? `=${c}${R.minC}` : `=MAX(${c}${R.minC},MAX(${CL(c0 + k)}${R.hReq}:${CL(c0 + TM - 1)}${R.hReq})+${c}${R.cumPre})`));
  add('dDate', 'Дата дивідендів (1/0)', 'Dividend date (1/0)', (c) => `=IF(OR(${c}${R.t}=d_T,AND(${c}${R.ops}=1,IF(i_divEvery=12,${c}${R.mon}=12,MOD(${c}${R.o},i_divEvery)=0))),1,0)`, '0');
  add('div', 'Дивіденди', 'Dividends', (c) => `=IF(${c}${R.t}=d_T,MAX(0,${c}${R.cPre}),IF(${c}${R.dDate}=1,MAX(0,${c}${R.cPre}-${c}${R.keep}),0))`);
  add('cClose', 'Гроші на кінець', 'Cash, closing', (c) => `=${c}${R.cPre}-${c}${R.div}`);
  add('h5', 'БАЛАНС', 'BALANCE SHEET', null);
  add('ppe', 'Основні засоби', 'PP&E', cum('ppe', (c) => `${c}${R.capex}+${c}${R.idc}+${c}${R.fee}-${c}${R.dep}`));
  add('share', 'Статутний капітал', 'Share capital', cum('share', (c) => `${c}${R.eq}`));
  add('re', 'Нерозподілений прибуток', 'Retained earnings', cum('re', (c) => `${c}${R.np}-${c}${R.div}`));
  add('assets', 'Активи', 'Assets', (c) => `=${c}${R.ppe}+${c}${R.vClose}+${c}${R.gRec}+${c}${R.cClose}`);
  add('liab', "Зобов'язання і капітал", 'Liabilities and equity', (c) => `=${c}${R.dClose}+${c}${R.ipClose}+${c}${R.defInc}+${c}${R.share}+${c}${R.re}`);
  add('check', 'Перевірка балансу', 'Balance check', (c) => `=${c}${R.assets}-${c}${R.liab}`, NUM2);
  add('h6', 'ПОКАЗНИКИ', 'METRICS', null);
  add('fcf', 'Потік проєкту', 'Project cash flow', (c) => `=IF(${c}${R.ops}=0,-(${c}${R.capex}+${c}${R.vat}),${c}${R.ebitda}-${c}${R.taxU}+${c}${R.vatRec}+${c}${R.gCash})`);
  add('eqf', 'Потік капіталу', 'Equity cash flow', (c) => `=${c}${R.div}-${c}${R.eq}`);
  add('cumF', 'Потік проєкту наростаючим', 'Project flow, cumulative', cum('cumF', (c) => `${c}${R.fcf}`));
  add('cumE', 'Потік капіталу наростаючим', 'Equity flow, cumulative', cum('cumE', (c) => `${c}${R.eqf}`));
  add('pbF', 'Окупність проєкту, міс.', 'Project payback, months', (c, pr, k) => (k === 1 ? '=""' : `=IF(AND(${pr}${R.cumF}<0,${c}${R.cumF}>=0),${c}${R.t}-1-${pr}${R.cumF}/${c}${R.fcf},"")`), NUM2);
  add('pbE', 'Окупність капіталу, міс.', 'Equity payback, months', (c, pr, k) => (k === 1 ? '=""' : `=IF(AND(${pr}${R.cumE}<0,${c}${R.cumE}>=0),${c}${R.t}-1-${pr}${R.cumE}/${c}${R.eqf},"")`), NUM2);
  add('cost', 'CAPEX + OPEX (для LCOE)', 'CAPEX + OPEX (for LCOE)', (c) => `=${c}${R.capex}+${c}${R.opex}`);
  add('ly', 'Рік кредиту', 'Loan year', (c) => `=IF(AND(${c}${R.o}>=1,${c}${R.o}<=i_tenor*12),INT((${c}${R.o}-1)/12)+1,0)`, '0');
  add('ds', 'Обслуговування боргу', 'Debt service', (c) => `=${c}${R.intPaid}+${c}${R.princ}`);
  add('cfL', 'CFADS у строк кредиту', 'CFADS within the loan term', (c) => `=IF(${c}${R.ly}>0,${c}${R.cfads},0)`);

  put(wt, 1, 1, T(`Місячна модель: стовпець D = місяць 1, останній стовпець = місяць ${TM}`, `Monthly model: column D = month 1, the last column = month ${TM}`), 'bold');
  put(wt, 2, 3, T('Разом', 'Total'), 'bold');
  const lastc = CL(c0 + TM - 1);
  for (const { key, label, fn, fmt, bold } of L) {
    const rr = R[key];
    put(wt, rr, 1, label, bold || !fn ? 'bold' : undefined);
    if (!fn) continue;
    for (let k = 1; k <= TM; k++) {
      const col = CL(c0 + k - 1), prev = k > 1 ? CL(c0 + k - 2) : '';
      const v = fn(col, prev, k);
      wt.set(rr, c0 + k - 1, typeof v === 'number' ? { v, fmt } : { f: v, fmt, style: bold ? 'bold' : undefined });
    }
    if (!['0', 'mm.yyyy', '0.0000'].includes(fmt)) wt.set(rr, 3, { f: `=SUM(D${rr}:${lastc}${rr})`, fmt });
  }
  wt.width(1, 46);
  wt.freeze = { row: 3, col: 4 };
  const rng = (key: string) => `Timeline!$D$${R[key]}:$${lastc}$${R[key]}`;

  // ---------------- Calc ----------------
  const wk = book.add('Calc', 1);
  put(wk, 1, 1, T('Фінансування будівництва і ключові суми', 'Construction financing and key totals'), 'bold');
  const calc: [string, string, string, string][] = [
    ['k_D', 'Сума кредиту = вибірки (аркуш Funding)', 'Loan = draws (Funding sheet)', `=SUM(${rng('draw')})`],
    ['k_shareCheck', 'Частка кредиту у фінансуванні (перевірка)', 'Debt share of funding (check)', `=k_D/SUM(${rng('need')})`],
    ['k_ppe', 'Основні засоби = CAPEX + відсотки + комісія', 'PP&E = CAPEX + interest + fee', `=c_total+SUM(${rng('idc')})+SUM(${rng('fee')})`],
    ['k_G', 'Компенсація 15%', '15% compensation', '=IF(i_gOn=1,i_gPct*c_total,0)'],
  ];
  calc.forEach(([n, lu, le, f], j) => {
    const rr = 3 + j;
    put(wk, rr, 1, n); put(wk, rr, 2, uk ? lu : le);
    wk.set(rr, 3, { f, fmt: n === 'k_shareCheck' ? PCT2 : NUM });
    book.name(n, `Calc!$C$${rr}`);
  });
  wk.width(2, 50); wk.width(3, 18);

  // ---------------- KPI ----------------
  const wkpi = book.add('KPI', 1);
  put(wkpi, 1, 1, `${T('Показники проєкту', 'Project metrics')} · ${scenarioName[ctx.scenario]}`, 'title');
  header(wkpi, 3, [T('Код', 'Code'), T('Показник', 'Metric'), T('Значення', 'Value'), T('Одиниця', 'Unit')]);
  const colCod = CL(c0 + C - 1), colLastLoan = CL(c0 + C + fi.tenorYears * 12 - 1);
  const kpiRow: Record<string, number> = {};
  const kp: [string, string, string, string, string, string][] = [
    ['capexExVat', 'CAPEX без ПДВ', 'CAPEX ex VAT', '=c_total', '€', NUM],
    ['capexPerKW', 'CAPEX на кВт', 'CAPEX per kW', '=c_total/d_kw', T('€/кВт', 'EUR/kW'), NUM],
    ['debt', 'Кредит', 'Loan', '=k_D', '€', NUM],
    ['equity', 'Капітал', 'Equity', `=SUM(${rng('eq')})`, '€', NUM],
    ['idc', 'Капіталізовані відсотки', 'Capitalised interest', `=SUM(${rng('idc')})`, '€', NUM],
    ['fee', 'Комісія', 'Fee', `=SUM(${rng('fee')})`, '€', NUM],
    ['vatPaid', 'ПДВ на CAPEX', 'VAT on CAPEX', `=SUM(${rng('vat')})`, '€', NUM],
    ['annualGeneration', 'Річна генерація', 'Annual generation', '=d_E', T('МВт·год', 'MWh'), NUM],
    ['capturePrice', 'Capture price вітру', 'Wind capture price', '=p_capture', T('€/МВт·год', 'EUR/MWh'), NUM2],
    ['projectIrr', 'IRR проєкту', 'Project IRR', `=XIRR(${rng('fcf')},${rng('date')})`, '%', PCT2],
    ['equityIrr', 'IRR капіталу', 'Equity IRR', `=XIRR(${rng('eqf')},${rng('date')})`, '%', PCT2],
    ['npvProject', 'NPV проєкту за WACC', 'Project NPV at WACC', `=XNPV(d_wacc,${rng('fcf')},${rng('date')})`, '€', NUM],
    ['wacc', 'WACC після податків', 'WACC after tax', '=d_wacc', '%', PCT2],
    ['ebitdaAvg5', 'EBITDA середня, перші 5 років', 'Average EBITDA, first 5 years', `=SUMIFS(${rng('ebitda')},${rng('o')},">=1",${rng('o')},"<=60")/5`, T('€/рік', 'EUR/yr'), NUM],
    ['ebitdaToCapex', 'EBITDA / CAPEX', 'EBITDA / CAPEX', '', '%', PCT2],
    ['npToEquity', 'Чистий прибуток / капітал, середнє', 'Net profit / equity, average', '', '%', PCT2],
    ['paybackProjectYears', 'Окупність проєкту, пряма, від введення в експлуатацію', 'Project payback, simple, from COD', `=(MIN(${rng('pbF')})-i_C)/12`, T('років', 'years'), NUM2],
    ['paybackEquityYears', 'Окупність капіталу, пряма, від введення в експлуатацію', 'Equity payback, simple, from COD', `=(MIN(${rng('pbE')})-i_C)/12`, T('років', 'years'), NUM2],
    ['lcoe', 'LCOE', 'LCOE', `=XNPV(d_wacc,${rng('cost')},${rng('date')})/XNPV(d_wacc,${rng('gen')},${rng('date')})`, T('€/МВт·год', 'EUR/MWh'), NUM2],
    ['dscrMin', 'DSCR мінімальний (роки кредиту)', 'Minimum DSCR (loan years)', '', '×', '0.00'],
    ['dscrAvg', 'DSCR середній (роки кредиту)', 'Average DSCR (loan years)', '', '×', '0.00'],
    ['llcr', 'LLCR на дату введення', 'LLCR at COD', `=XNPV(i_rate,Timeline!$${colCod}$${R.cfL}:$${colLastLoan}$${R.cfL},Timeline!$${colCod}$${R.date}:$${colLastLoan}$${R.date})/k_D`, '×', '0.00'],
    ['grant', 'Компенсація 15%', '15% compensation', '=k_G', '€', NUM],
    ['balanceMax', 'Макс. розбіжність балансу', 'Max balance difference', `=MAX(MAX(${rng('check')}),-MIN(${rng('check')}))`, '€', NUM2],
    ['debtEnd', 'Кредит на кінець строку', 'Loan at the end of the term', `=Timeline!${colLastLoan}${R.dClose}`, '€', NUM2],
  ];
  kp.forEach(([code], j) => { kpiRow[code] = 4 + j; });
  const dscrTop = 4 + kp.length + 2, years = fi.tenorYears;
  const dFirst = dscrTop + 2, dLast = dscrTop + 1 + years;
  const fill: Record<string, string> = {
    ebitdaToCapex: `=C${kpiRow.ebitdaAvg5}/C${kpiRow.capexExVat}`,
    npToEquity: `=SUM(${rng('np')})/i_life/C${kpiRow.equity}`,
    dscrMin: `=MIN(C${dFirst}:C${dLast})`,
    dscrAvg: `=AVERAGE(C${dFirst}:C${dLast})`,
  };
  kp.forEach(([code, lu, le, f, unit, fmt], j) => {
    const rr = 4 + j;
    put(wkpi, rr, 1, code); put(wkpi, rr, 2, uk ? lu : le);
    wkpi.set(rr, 3, { f: f || fill[code], fmt, style: ['equityIrr', 'projectIrr'].includes(code) ? 'bold' : undefined });
    put(wkpi, rr, 4, unit);
  });
  put(wkpi, dscrTop, 1, T('DSCR за роками кредиту', 'DSCR by loan year'), 'bold');
  header(wkpi, dscrTop + 1, [T('Рік', 'Year'), 'CFADS', 'DSCR', T('Обслуговування боргу', 'Debt service')]);
  for (let y = 1; y <= years; y++) {
    const rr = dscrTop + 1 + y;
    put(wkpi, rr, 1, y);
    wkpi.set(rr, 2, { f: `=SUMIFS(${rng('cfL')},${rng('ly')},A${rr})`, fmt: NUM });
    wkpi.set(rr, 4, { f: `=SUMIFS(${rng('ds')},${rng('ly')},A${rr})`, fmt: NUM });
    wkpi.set(rr, 3, { f: `=IF(D${rr}>0,B${rr}/D${rr},"")`, fmt: '0.00' });
  }
  wkpi.width(1, 20); wkpi.width(2, 50); wkpi.width(3, 18); wkpi.width(4, 18);

  // ---------------- Annual ----------------
  const wa = book.add('Annual', 2);
  put(wa, 1, 1, T('Звіти за календарними роками, EUR', 'Statements by calendar year, EUR'), 'title');
  const y0 = sy;
  const endMonth = sm - 1 + TM - 1;
  const y1 = sy + Math.floor(endMonth / 12);
  const yrs = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  yrs.forEach((y, j) => put(wa, 3, 2 + j, String(y), 'head'));
  put(wa, 3, 1, '', 'head');
  const flowsRows: ([string] | [string, string])[] = [
    ['P&L'], [T('Генерація, МВт·год', 'Generation, MWh'), 'gen'], [T('Дохід валовий', 'Gross revenue'), 'revG'], [T('Чистий дохід', 'Net revenue'), 'revN'],
    ['OPEX', 'opex'], ['EBITDA', 'ebitda'], [T('Амортизація', 'Depreciation'), 'dep'], [T('Відсотки', 'Interest'), 'intExp'],
    [T('Дохід від компенсації', 'Compensation income'), 'gInc'], [T('Податок', 'Income tax'), 'tax'], [T('Чистий прибуток', 'Net profit'), 'np'],
    [T('Рух грошових коштів', 'Cash flow')], [T('CAPEX без ПДВ', 'CAPEX ex VAT'), 'capex'], [T('ПДВ на CAPEX', 'VAT on CAPEX'), 'vat'],
    [T('Капіталізовані відсотки', 'Capitalised interest'), 'idc'], [T('Комісія', 'Fee'), 'fee'], [T('Вибірка кредиту', 'Loan draw'), 'draw'],
    [T('Внесок капіталу', 'Equity contribution'), 'eq'], [T('Погашення тіла', 'Principal repaid'), 'princ'], [T('Відсотки сплачені', 'Interest paid'), 'intPaid'],
    [T('ПДВ зараховано', 'VAT recovered'), 'vatRec'], [T('Компенсація отримана', 'Compensation received'), 'gCash'], [T('Дивіденди', 'Dividends'), 'div'],
  ];
  const balRows: ([string] | [string, string])[] = [
    [T('Баланс на кінець року', 'Balance sheet at year end')], [T('Основні засоби', 'PP&E'), 'ppe'], [T('ПДВ до відшкодування', 'VAT receivable'), 'vClose'],
    [T('Компенсація до отримання', 'Compensation receivable'), 'gRec'], [T('Гроші', 'Cash'), 'cClose'], [T('Кредит', 'Loan'), 'dClose'],
    [T('Відсотки до сплати', 'Interest payable'), 'ipClose'], [T('Відстрочений дохід', 'Deferred income'), 'defInc'], [T('Статутний капітал', 'Share capital'), 'share'],
    [T('Нерозподілений прибуток', 'Retained earnings'), 're'], [T('Перевірка балансу', 'Balance check'), 'check'],
  ];
  let ar = 4;
  for (const rowA of flowsRows) {
    if (rowA.length === 1) { put(wa, ar++, 1, rowA[0], 'bold'); continue; }
    const [label, key] = rowA;
    put(wa, ar, 1, label, key === 'ebitda' || key === 'np' ? 'bold' : undefined);
    yrs.forEach((y, j) => wa.set(ar, 2 + j, { f: `=SUMIFS(${rng(key)},${rng('year')},${y})`, fmt: NUM, style: key === 'ebitda' || key === 'np' ? 'bold' : undefined }));
    ar++;
  }
  for (const rowB of balRows) {
    if (rowB.length === 1) { put(wa, ar++, 1, rowB[0], 'bold'); continue; }
    const [label, key] = rowB;
    put(wa, ar, 1, label);
    yrs.forEach((y, j) => wa.set(ar, 2 + j, { f: `=INDEX(${rng(key)},1,MATCH(${y},${rng('year')},1))`, fmt: key === 'check' ? NUM2 : NUM }));
    ar++;
  }
  wa.width(1, 32);
  for (let j = 0; j < yrs.length; j++) wa.width(2 + j, 13);
  wa.freeze = { row: 4, col: 2 };

  // ---------------- Sensitivity and risks (values) ----------------
  const ws = book.add('Sensitivity');
  put(ws, 1, 1, T('Сенситивність — значення, розраховані моделлю сайту (не формули)', 'Sensitivity: values computed by the web model (not formulas)'), 'title');
  put(ws, 2, 1, T(`Стрес-тести від бази користувача. Розміри: обмеження −${Math.round(ctx.stress.curtailCut * 100)}% генерації червень–серпень 11:00–15:00, CAPEX +${Math.round(ctx.stress.capexUp * 100)}%, РДН −${Math.round(ctx.stress.priceDown * 100)}%.`,
    `Stress tests from the user's base. Sizes: curtailment −${Math.round(ctx.stress.curtailCut * 100)}% of generation June–August 11:00–15:00, CAPEX +${Math.round(ctx.stress.capexUp * 100)}%, DAM −${Math.round(ctx.stress.priceDown * 100)}%.`), 'note');
  const tbl = scenarioTable(ctx.base, md, ctx.stress);
  const ids: ScenarioId[] = ['base', 'S1', 'S2', 'S3', 'S4'];
  put(ws, 4, 1, T('A. Показники за сценаріями', 'A. Metrics by scenario'), 'bold');
  header(ws, 5, [T('Показник', 'Metric'), ...ids.map((i) => scenarioName[i])]);
  const sensKpis: [keyof typeof tbl.base, string, string][] = [
    ['equityIrr', T('IRR капіталу', 'Equity IRR'), PCT2], ['projectIrr', T('IRR проєкту', 'Project IRR'), PCT2], ['npvProject', T('NPV проєкту, €', 'Project NPV, EUR'), NUM],
    ['ebitdaAvg5', T('EBITDA середня 5 років, €', 'Average EBITDA 5 years, EUR'), NUM], ['capexExVat', T('CAPEX без ПДВ, €', 'CAPEX ex VAT, EUR'), NUM],
    ['dscrMin', T('DSCR мінімальний', 'Minimum DSCR'), '0.00'], ['llcr', 'LLCR', '0.00'], ['lcoe', T('LCOE, €/МВт·год', 'LCOE, EUR/MWh'), NUM2],
    ['paybackEquityYears', T('Окупність капіталу від введення, років', 'Equity payback from COD, years'), NUM2],
  ];
  sensKpis.forEach(([k, label, fmt], j) => {
    put(ws, 6 + j, 1, label);
    ids.forEach((id, c) => ws.set(6 + j, 2 + c, { v: tbl[id][k] as number, fmt }));
  });
  let sr = 6 + sensKpis.length + 2;
  put(ws, sr++, 1, T('Б. Водоспад IRR капіталу: база → S4', 'B. Equity IRR waterfall: base → S4'), 'bold');
  header(ws, sr++, [T('Крок', 'Step'), T('Значення / зміна', 'Value / change')]);
  for (const w of waterfall(ctx.base, md, ctx.stress)) {
    put(ws, sr, 1, w.step === 'base' ? T('База', 'Base') : w.step === 'S4' ? T('Після всіх шоків (S4)', 'After all shocks (S4)') : `${w.step} (${T('зміна', 'change')})`);
    ws.set(sr++, 2, { v: (w.value ?? w.delta) as number, fmt: PCT2 });
  }
  sr += 1;
  put(ws, sr++, 1, T('В. IRR капіталу: ціна РДН × CAPEX', 'C. Equity IRR: DAM price × CAPEX'), 'bold');
  header(ws, sr, [T('CAPEX \\ ціна', 'CAPEX \\ price'), ...HEAT_PRICES.map((x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`)]);
  sr++;
  heatmap(ctx.base, md, HEAT_PRICES, HEAT_CAPEX).forEach((rowH, i) => {
    put(ws, sr, 1, `${HEAT_CAPEX[i] > 0 ? '+' : ''}${Math.round(HEAT_CAPEX[i] * 100)}%`, 'bold');
    rowH.forEach((v, j) => ws.set(sr, 2 + j, { v, fmt: PCT }));
    sr++;
  });
  ws.width(1, 46);
  for (let c = 2; c <= 8; c++) ws.width(c, 20);

  const wr = book.add('Risks');
  put(wr, 1, 1, T('Реєстр ризиків — значення моделі сайту (імовірності з презентації, слайди 13–14)', 'Risk register: web model values (probabilities from the deck, slides 13–14)'), 'title');
  header(wr, 3, [T('Група', 'Group'), T('Ризик', 'Risk'), T('Шок', 'Shock'), T('Імовірність', 'Probability'), T('Вплив, €', 'Impact, EUR'), T('Очікувані втрати, €', 'Expected loss, EUR')]);
  const risks = riskRegister(ctx.base, md);
  let rr2 = 4;
  for (const grp of ['construction', 'operations'] as const) {
    const list = risks.filter((x) => x.group === grp);
    const firstR = rr2;
    for (const x of list) {
      put(wr, rr2, 1, grp === 'construction' ? T('Будівництво', 'Construction') : T('Експлуатація, на рік', 'Operations, per year'));
      put(wr, rr2, 2, uk ? x.nameUk : x.nameEn); put(wr, rr2, 3, x.shock);
      wr.set(rr2, 4, { v: x.probability, fmt: '0%' });
      wr.set(rr2, 5, { v: x.impact, fmt: NUM });
      wr.set(rr2, 6, { f: `=D${rr2}*E${rr2}`, fmt: NUM });
      rr2++;
    }
    put(wr, rr2, 2, T('Разом', 'Total'), 'bold');
    wr.set(rr2, 6, { f: `=SUM(F${firstR}:F${rr2 - 1})`, fmt: NUM, style: 'bold' });
    rr2 += 2;
  }
  wr.width(1, 22); wr.width(2, 40); wr.width(3, 30); wr.width(4, 12); wr.width(5, 16); wr.width(6, 18);

  // timeline column-major order keeps the evaluator's recursion shallow
  const timelineOrder: [string, number, number][] = [];
  for (const shn of ['Inputs', 'Staff', 'Profiles', 'Capex', 'Funding']) {
    const sh = book.sheet(shn);
    for (const [r0, c] of sh.coords()) if (sh.get(r0, c)?.f) timelineOrder.push([shn, r0, c]);
  }
  for (let k = 1; k <= TM; k++) for (const { key, fn } of L) if (fn) timelineOrder.push(['Timeline', R[key], c0 + k - 1]);
  void netAEP;
  return { book, timelineOrder, kpiRow };
}
