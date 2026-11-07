import React, { useMemo, useState } from 'react';
import type { Assumptions, Kpis, MarketData, Result } from '../engine/types';
import { annualGeneration, capacityKW, windShares } from '../engine/model';
import { heatmap, riskRegister, scenarioTable, waterfall, type ScenarioId, type StressSizes } from '../engine/scenarios';
import { Bars, Columns, Heatmap12x24, Lines, SensGrid, Waterfall, type Title } from './charts';
import { S, tr, type Lang } from './i18n';
import { mln, num, pct, signed, signedPct } from './format';

export type Tab = 'overview' | 'gen' | 'capex' | 'pl' | 'bs' | 'cf' | 'debt' | 'sens' | 'risk';
export const TABS: { id: Tab; t: keyof typeof S }[] = [
  { id: 'overview', t: 'tabOverview' }, { id: 'gen', t: 'tabGen' }, { id: 'capex', t: 'tabCapex' }, { id: 'pl', t: 'tabPL' },
  { id: 'bs', t: 'tabBS' }, { id: 'cf', t: 'tabCF' }, { id: 'debt', t: 'tabDebt' }, { id: 'sens', t: 'tabSens' }, { id: 'risk', t: 'tabRisk' },
];

interface Props {
  a: Assumptions; md: MarketData; r: Result; base: Result; scenario: ScenarioId; lang: Lang; tab: Tab;
  stress: StressSizes; setStress: (s: StressSizes) => void; projectName: string;
}

const L = (lang: Lang, uk: string, en: string) => (lang === 'uk' ? uk : en);

function scenarioLabel(s: ScenarioId, lang: Lang) {
  return s === 'base' ? tr(S.base, lang) : tr(S[s.toLowerCase() as 's1'], lang);
}

// ---------- KPI tiles ----------
type KpiDef = { k: keyof Kpis; uk: string; en: string; fmt: (v: number) => string; unit: string; higherIsGood: boolean; delta: 'pp' | 'pct' };
const KPIS: KpiDef[] = [
  { k: 'equityIrr', uk: 'IRR капіталу', en: 'Equity IRR', fmt: (v) => pct(v, 1), unit: '', higherIsGood: true, delta: 'pp' },
  { k: 'projectIrr', uk: 'IRR проєкту', en: 'Project IRR', fmt: (v) => pct(v, 1), unit: '', higherIsGood: true, delta: 'pp' },
  { k: 'npvProject', uk: 'NPV проєкту', en: 'Project NPV', fmt: (v) => mln(v, 1), unit: 'EUR m', higherIsGood: true, delta: 'pct' },
  { k: 'ebitdaAvg5', uk: 'EBITDA, середня 5 років', en: 'EBITDA, 5-year average', fmt: (v) => mln(v, 1), unit: 'EUR m', higherIsGood: true, delta: 'pct' },
  { k: 'ebitdaToCapex', uk: 'EBITDA / CAPEX', en: 'EBITDA / CAPEX', fmt: (v) => pct(v, 1), unit: '', higherIsGood: true, delta: 'pp' },
  { k: 'npToEquity', uk: 'Чистий прибуток / капітал', en: 'Net profit / equity', fmt: (v) => pct(v, 1), unit: '', higherIsGood: true, delta: 'pp' },
  { k: 'paybackProjectYears', uk: 'Окупність проєкту від введення', en: 'Project payback from COD', fmt: (v) => num(v, 1), unit: 'yrs', higherIsGood: false, delta: 'pct' },
  { k: 'paybackEquityYears', uk: 'Окупність капіталу від введення', en: 'Equity payback from COD', fmt: (v) => num(v, 1), unit: 'yrs', higherIsGood: false, delta: 'pct' },
  { k: 'lcoe', uk: 'LCOE', en: 'LCOE', fmt: (v) => num(v, 1), unit: 'EUR/MWh', higherIsGood: false, delta: 'pct' },
  { k: 'dscrMin', uk: 'DSCR мінімальний', en: 'Minimum DSCR', fmt: (v) => num(v, 2), unit: '×', higherIsGood: true, delta: 'pct' },
  { k: 'dscrAvg', uk: 'DSCR середній', en: 'Average DSCR', fmt: (v) => num(v, 2), unit: '×', higherIsGood: true, delta: 'pct' },
  { k: 'llcr', uk: 'LLCR', en: 'LLCR', fmt: (v) => num(v, 2), unit: '×', higherIsGood: true, delta: 'pct' },
  { k: 'capexPerKW', uk: 'CAPEX', en: 'CAPEX', fmt: (v) => num(v, 0), unit: 'EUR/kW', higherIsGood: false, delta: 'pct' },
];
const unitUk: Record<string, string> = { 'EUR m': 'млн €', yrs: 'років', 'EUR/MWh': '€/МВт·год', 'EUR/kW': '€/кВт', '×': '×', '': '' };

function deltaText(d: KpiDef, v: number, b: number) {
  if (!Number.isFinite(v) || !Number.isFinite(b)) return '';
  return d.delta === 'pp' ? `${signed((v - b) * 100, 1)} pp` : signedPct(v / b - 1, 1);
}

const fmtDate = (iso: string) => iso.split('-').reverse().join('.');

/** Method notes shown by the small (i) next to a KPI. */
function kpiNote(k: keyof Kpis, r: Result, a: Assumptions, lang: Lang): string | null {
  const C = a.project.constructionMonths;
  const start = fmtDate(a.project.startDate);
  const cod = fmtDate(r.flows.date[C - 1]);
  const div = a.finance.dividendEveryMonths === 12 ? L(lang, 'щогрудня', 'every December') : a.finance.dividendEveryMonths === 3 ? L(lang, 'щокварталу', 'quarterly') : L(lang, `кожні ${a.finance.dividendEveryMonths} міс.`, `every ${a.finance.dividendEveryMonths} months`);
  if (k === 'paybackProjectYears') return L(lang,
    `Пряма окупність, без дисконтування. Наростаючий потік проєкту рахується з початку будівництва (${start}): мінус CAPEX з ПДВ, далі EBITDA мінус податок без боргового щита, плюс повернення ПДВ і компенсація. Окупність — момент, коли сума стає ≥ 0 (з інтерполяцією всередині місяця). Показник — роки від введення в експлуатацію (${cod}) до цього моменту; ${C} міс. будівництва в нього не входять.`,
    `Simple payback, undiscounted. The cumulative project flow starts at construction start (${start}): minus CAPEX incl. VAT, then EBITDA less unlevered tax, plus VAT recovered and the grant. Payback is when the sum turns ≥ 0 (interpolated within the month). The figure is the years from COD (${cod}) to that point; the ${C} construction months are not counted.`);
  if (k === 'paybackEquityYears') return L(lang,
    `Пряма окупність, без дисконтування. Наростаючий потік інвестора рахується з першого внеску (${start}): мінус внески капіталу за ${C} міс. будівництва, плюс дивіденди (${div}). Окупність — момент, коли отримані дивіденди зрівнюються з внесеним капіталом (з інтерполяцією всередині місяця). Показник — роки від введення в експлуатацію (${cod}) до цього моменту.`,
    `Simple payback, undiscounted. The cumulative investor flow starts at the first contribution (${start}): minus equity contributed over ${C} construction months, plus dividends (${div}). Payback is when dividends received equal equity contributed (interpolated within the month). The figure is the years from COD (${cod}) to that point.`);
  const f = a.finance;
  const wacc = pct(r.kpis.wacc, 2);
  const notes: Partial<Record<keyof Kpis, [string, string]>> = {
    equityIrr: [
      `Номінальна ставка в EUR (XIRR за датами кінця місяця), за якої NPV потоку інвестора дорівнює нулю. Потік інвестора: мінус внески капіталу помісячно за ${C} міс. будівництва (з ${start}), плюс дивіденди (${div}) за весь строк. Дивіденди — усі гроші понад мінімальний залишок і сезонний резерв; після податків.`,
      `Nominal EUR rate (XIRR on month-end dates) at which the NPV of the investor flow is zero. Investor flow: minus monthly equity contributions over ${C} construction months (from ${start}), plus dividends (${div}) over the whole life. Dividends are all cash above the minimum balance and the seasonal reserve; after tax.`],
    projectIrr: [
      `Номінальна ставка в EUR (XIRR) потоку проєкту без кредиту: мінус CAPEX з ПДВ на будівництві, далі EBITDA мінус податок без боргового щита, плюс повернення ПДВ і компенсація. Не залежить від структури фінансування.`,
      `Nominal EUR rate (XIRR) of the unlevered project flow: minus CAPEX incl. VAT during construction, then EBITDA less unlevered tax, plus VAT recovered and the grant. Independent of the financing structure.`],
    npvProject: [
      `Потік проєкту (як для IRR проєкту), дисконтований за WACC після податків ${wacc} = ${pct(1 - f.debtShare, 0)} × ${pct(f.costOfEquity, 1)} + ${pct(f.debtShare, 0)} × ${pct(f.rate, 1)} × (1 − ${pct(f.taxRate, 0)}). Дисконтування за датами (XNPV) до кінця першого місяця будівництва.`,
      `Project flow (as for project IRR) discounted at the after-tax WACC ${wacc} = ${pct(1 - f.debtShare, 0)} × ${pct(f.costOfEquity, 1)} + ${pct(f.debtShare, 0)} × ${pct(f.rate, 1)} × (1 − ${pct(f.taxRate, 0)}). Date-based discounting (XNPV) to the end of the first construction month.`],
    ebitdaAvg5: [
      `Сума EBITDA за перші 60 місяців експлуатації (від ${cod}), поділена на 5. EBITDA = чистий дохід після комісії трейдера мінус OPEX.`,
      `Sum of EBITDA over the first 60 months of operation (from ${cod}) divided by 5. EBITDA = revenue after the trader fee less OPEX.`],
    ebitdaToCapex: [
      `Середня EBITDA за перші 5 років, поділена на CAPEX без ПДВ і без фінансування (без капіталізованих відсотків і комісії, з непередбачуваними).`,
      `Average EBITDA over the first 5 years divided by CAPEX ex VAT and ex financing (no capitalised interest or fee; contingency included).`],
    npToEquity: [
      `Середній річний чистий прибуток за ${a.project.lifeYears} років експлуатації (сума прибутку / ${a.project.lifeYears}), поділений на весь внесений капітал.`,
      `Average annual net profit over ${a.project.lifeYears} operating years (total profit / ${a.project.lifeYears}) divided by total equity contributed.`],
    lcoe: [
      `Дисконтовані за WACC ${wacc} витрати (CAPEX без ПДВ + OPEX за весь строк), поділені на дисконтовану генерацію. Без податків, ПДВ і витрат на фінансування.`,
      `Costs (CAPEX ex VAT + lifetime OPEX) discounted at WACC ${wacc}, divided by discounted generation. Excludes taxes, VAT and financing costs.`],
    dscrMin: [
      `Найменший річний DSCR за ${f.tenorYears} років кредиту. Рік кредиту — 4 квартали від введення. DSCR = (EBITDA − податок + повернення ПДВ) / (тіло + відсотки). Квартальні значення — на вкладці «Борг».`,
      `Lowest annual DSCR over the ${f.tenorYears} loan years. A loan year is 4 quarters from COD. DSCR = (EBITDA − tax + VAT recovered) / (principal + interest). Quarterly values are on the Debt tab.`],
    dscrAvg: [
      `Середнє річних DSCR за ${f.tenorYears} років кредиту; рік кредиту — 4 квартали від введення. DSCR = (EBITDA − податок + повернення ПДВ) / (тіло + відсотки).`,
      `Average of annual DSCRs over the ${f.tenorYears} loan years; a loan year is 4 quarters from COD. DSCR = (EBITDA − tax + VAT recovered) / (principal + interest).`],
    llcr: [
      `Грошовий потік для обслуговування боргу за строк кредиту, дисконтований за ставкою кредиту ${pct(f.rate, 1)} до дати введення (${cod}), поділений на залишок кредиту на цю дату.`,
      `Cash flow available for debt service over the loan life, discounted at the loan rate ${pct(f.rate, 1)} to COD (${cod}), divided by the debt outstanding at COD.`],
    capexPerKW: [
      `CAPEX без ПДВ (з непередбачуваними, без капіталізованих відсотків і комісії), поділений на встановлену потужність ${num(capacityKW(a) / 1000, 1)} МВт.`,
      `CAPEX ex VAT (contingency included, capitalised interest and fee excluded) divided by installed capacity of ${num(capacityKW(a) / 1000, 1)} MW.`],
  };
  const n = notes[k];
  return n ? L(lang, n[0], n[1]) : null;
}

function Overview({ r, base, scenario, lang, a }: Props) {
  const k = r.kpis, b = base.kpis;
  const [note, setNote] = useState<keyof Kpis | null>(null);
  return (
    <div>
      <div className="oc-kpis">
        {KPIS.map((d, i) => {
          const v = k[d.k] as number, bv = b[d.k] as number;
          const diff = scenario !== 'base' ? v - bv : 0;
          const good = d.higherIsGood ? diff >= 0 : diff <= 0;
          const shown = deltaText(d, v, bv);
          const zero = !/[1-9]/.test(shown);
          return (
            <div key={d.k} className={`oc-kpi${i === 0 ? ' oc-kpi--action' : ''}`}>
              <div className="kpi-head">
                <p className="oc-overline">{L(lang, d.uk, d.en)}{d.unit ? `, ${lang === 'uk' ? unitUk[d.unit] : d.unit}` : ''}</p>
                {kpiNote(d.k, r, a, lang) && (
                  <button className="icon" aria-expanded={note === d.k} aria-label={L(lang, 'Як рахується', 'How it is calculated')}
                    onClick={() => setNote(note === d.k ? null : d.k)}>i</button>
                )}
              </div>
              <p className="oc-kpi__value">{d.fmt(v)}</p>
              {note === d.k && <p className="kpi-note">{kpiNote(d.k, r, a, lang)}</p>}
              {scenario !== 'base' && !zero ? (
                <p className={`oc-kpi__delta ${good ? 'oc-good' : 'oc-bad'}`}>{diff > 0 ? '▲' : '▼'} {shown} {L(lang, 'до бази', 'vs base')}</p>
              ) : (
                <p className="oc-kpi__delta oc-muted">{scenario === 'base' ? tr(S.base, lang) : L(lang, 'як у базі', 'as base')}</p>
              )}
            </div>
          );
        })}
      </div>
      <table className="oc-table compact" style={{ marginTop: 24 }}>
        <caption className="oc-overline">{L(lang, 'Ключові суми', 'Key amounts')}</caption>
        <thead><tr><th>{L(lang, 'Показник', 'Item')}</th><th className="n">{L(lang, 'млн €', 'EUR m')}</th></tr></thead>
        <tbody>
          <tr><td>{L(lang, 'CAPEX без ПДВ', 'CAPEX ex VAT')}</td><td className="n">{mln(k.capexExVat)}</td></tr>
          <tr><td>{L(lang, 'ПДВ на роботи', 'VAT on works')}</td><td className="n">{mln(k.vatPaid)}</td></tr>
          <tr><td>{L(lang, 'Капіталізовані відсотки', 'Capitalised interest')}</td><td className="n">{mln(k.idc)}</td></tr>
          <tr><td>{L(lang, 'Комісія за кредит', 'Arrangement fee')}</td><td className="n">{mln(k.fee)}</td></tr>
          <tr><td>{L(lang, 'Кредит', 'Debt')}</td><td className="n">{mln(k.debt)}</td></tr>
          <tr><td>{L(lang, 'Капітал', 'Equity')}</td><td className="n">{mln(k.equity)}</td></tr>
          {k.grant > 0 && <tr><td>{L(lang, 'Компенсація 15%', '15% compensation')}</td><td className="n">{mln(k.grant)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Gen({ a, md, r, scenario, lang, projectName }: Props) {
  const E = annualGeneration(a);
  const sc = scenarioLabel(scenario, lang);
  const genM = windShares(a, md).map((row) => row.map((s) => s * E));
  const priceM = md.priceShape.map((row) => row.map((c) => c * a.market.basePrice * a.stress.priceMult));
  const full = r.annual.find((y) => y.generation > 0 && r.annual.indexOf(y) > 1) ?? r.annual[2];
  const months = r.flows.date.map((d, i) => ({ d, i })).filter(({ d }) => d.startsWith(String(full.year)));
  const ml = months.map(({ d }) => d.slice(5, 7));
  return (
    <div>
      <p className="lead">
        {L(lang, 'Capture price вітру', 'Wind capture price')}: <b>{num(r.kpis.capturePrice, 2)} €/MWh</b> · {L(lang, 'середня ціна за всі години', 'average over all hours')}: {num(r.kpis.baselinePrice, 2)} €/MWh ({signedPct(r.kpis.capturePrice / r.kpis.baselinePrice - 1, 1)})
      </p>
      <Heatmap12x24 title={{ entity: projectName, measure: L(lang, 'Генерація, МВт·год (місяць × година)', 'Generation, MWh (month × hour)'), scenario: `FC ${L(lang, 'рік повної роботи', 'full year')}` }} m={genM} decimals={1} unit="MWh" />
      <Heatmap12x24 title={{ entity: L(lang, 'РДН ОЕС України', 'Ukraine IPS DAM'), measure: L(lang, 'Ціна, €/МВт·год (місяць × година)', 'Price, EUR/MWh (month × hour)'), scenario: L(lang, 'Форма ОРЕЕ 11.2025–10.2026, рівень моделі', 'OREE shape 11.2025–10.2026, model level') }} m={priceM} decimals={1} unit="€/MWh" />
      <Columns title={{ entity: projectName, measure: L(lang, 'Генерація, тис. МВт·год', 'Generation, MWh k'), scenario: `FC ${full.year}, ${sc}` }}
        labels={ml} values={months.map(({ i }) => r.flows.generation[i] / 1000)} decimals={1} />
      <Columns title={{ entity: projectName, measure: L(lang, 'Чистий дохід, млн €', 'Net revenue, EUR m'), scenario: `FC ${full.year}, ${sc}` }}
        labels={ml} values={months.map(({ i }) => r.flows.revenueNet[i] / 1e6)} decimals={2} />
    </div>
  );
}

function Capex({ r, scenario, lang, projectName, a }: Props) {
  const sc = scenarioLabel(scenario, lang);
  const C = a.project.constructionMonths;
  const lab = r.flows.date.slice(0, C).map((d) => d.slice(5, 7) + '.' + d.slice(2, 4));
  return (
    <div>
      <Bars title={{ entity: projectName, measure: L(lang, 'CAPEX за статтями, млн € без ПДВ', 'CAPEX by item, EUR m ex VAT'), scenario: `FC, ${sc}` }}
        items={r.capexByItem.map((i) => ({ label: lang === 'uk' ? i.nameUk : i.nameEn, value: i.exVat / 1e6 }))} decimals={2} />
      <Columns title={{ entity: projectName, measure: L(lang, 'Платежі будівництва з ПДВ, млн €', 'Construction payments incl. VAT, EUR m'), scenario: `FC ${lab[0]}–${lab[C - 1]}, ${sc}` }}
        labels={lab} values={r.flows.capexExVat.slice(0, C).map((v, i) => (v + r.flows.capexVat[i]) / 1e6)} decimals={1} />
      <table className="oc-table compact">
        <caption className="oc-overline">{L(lang, 'Фінансування будівництва за місяцями, млн €', 'Construction funding by month, EUR m')}</caption>
        <thead><tr><th>{L(lang, 'Місяць', 'Month')}</th>{lab.map((l) => <th key={l} className="n">{l}</th>)}<th className="n">{L(lang, 'Разом', 'Total')}</th></tr></thead>
        <tbody>
          {([['capexExVat', 'CAPEX без ПДВ', 'CAPEX ex VAT'], ['capexVat', 'ПДВ', 'VAT'], ['idc', 'Відсотки', 'Interest'], ['fee', 'Комісія', 'Fee'], ['debtDraw', 'Кредит', 'Debt'], ['equityIn', 'Капітал', 'Equity']] as const).map(([k, uk, en]) => (
            <tr key={k}><td>{L(lang, uk, en)}</td>{r.flows[k].slice(0, C).map((v, i) => <td key={i} className="n">{num(v / 1e6, 2)}</td>)}<td className="n"><b>{num(r.flows[k].slice(0, C).reduce((s, v) => s + v, 0) / 1e6, 2)}</b></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RowDef = [string, string, (y: Result['annual'][number]) => number, boolean?];
function Statement({ r, lang, rows, caption }: { r: Result; lang: Lang; rows: RowDef[]; caption: string }) {
  return (
    <div className="table-scroll">
      <table className="oc-table statement">
        <caption className="oc-overline">{caption}</caption>
        <thead><tr><th>{L(lang, 'Тис. €', 'EUR k')}</th>{r.annual.map((y) => <th key={y.year} className="n">{`FC ${y.year}`}</th>)}</tr></thead>
        <tbody>
          {rows.map(([uk, en, f, bold]) => (
            <tr key={uk} className={bold ? 'total' : ''}><td>{L(lang, uk, en)}</td>{r.annual.map((y) => <td key={y.year} className="n">{num(f(y) / 1000, 0)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PL: RowDef[] = [
  ['Генерація, МВт·год', 'Generation, MWh', (y) => y.generation * 1000],
  ['Дохід від продажу е/е, валовий', 'Electricity revenue, gross', (y) => y.revenueGross],
  ['Комісія трейдера', 'Trader fee', (y) => y.revenueNet - y.revenueGross],
  ['Чистий дохід', 'Revenue', (y) => y.revenueNet, true],
  ['Операційні витрати', 'Operating expenses', (y) => -y.opex],
  ['EBITDA', 'EBITDA', (y) => y.ebitda, true],
  ['Амортизація', 'Depreciation', (y) => -y.depreciation],
  ['Інший дохід (державна допомога, IAS 20)', 'Other income (government grant, IAS 20)', (y) => y.grantIncome],
  ['Фінансові витрати', 'Finance costs', (y) => -y.interestExpense],
  ['Прибуток до оподаткування', 'Profit before tax', (y) => y.pbt, true],
  ['Податок на прибуток', 'Income tax', (y) => -y.tax],
  ['Чистий прибуток', 'Net profit', (y) => y.netProfit, true],
];
const BS: RowDef[] = [
  ['Основні засоби', 'Property, plant and equipment', (y) => y.ppeNet],
  ['ПДВ до відшкодування', 'VAT receivable', (y) => y.vatBalance],
  ['Компенсація до отримання', 'Grant receivable', (y) => y.grantReceivable],
  ['Грошові кошти', 'Cash', (y) => y.cash],
  ['Усього активів', 'Total assets', (y) => y.ppeNet + y.vatBalance + y.grantReceivable + y.cash, true],
  ['Статутний капітал', 'Share capital', (y) => y.shareCapital],
  ['Нерозподілений прибуток', 'Retained earnings', (y) => y.retainedEarnings],
  ['Власний капітал', 'Total equity', (y) => y.shareCapital + y.retainedEarnings, true],
  ['Кредит', 'Borrowings', (y) => y.debt],
  ['Відсотки до сплати', 'Interest payable', (y) => y.interestPayable],
  ['Відстрочений дохід', 'Deferred income', (y) => y.deferredIncome],
  ['Усього зобов\'язань і капіталу', 'Total equity and liabilities', (y) => y.debt + y.interestPayable + y.deferredIncome + y.shareCapital + y.retainedEarnings, true],
  ['Перевірка балансу', 'Balance check', (y) => y.balanceCheck],
];
const CF: RowDef[] = [
  ['EBITDA', 'EBITDA', (y) => y.ebitda],
  ['Податок сплачений', 'Income tax paid', (y) => -y.tax],
  ['ПДВ зараховано', 'VAT recovered', (y) => y.vatRecovered],
  ['Компенсація отримана', 'Grant received', (y) => y.grantCash],
  ['Операційна діяльність', 'Operating activities', (y) => y.ebitda - y.tax + y.vatRecovered + y.grantCash, true],
  ['CAPEX без ПДВ', 'CAPEX ex VAT', (y) => -y.capexExVat],
  ['ПДВ на CAPEX', 'VAT on CAPEX', (y) => -y.capexVat],
  ['Інвестиційна діяльність', 'Investing activities', (y) => -y.capexExVat - y.capexVat, true],
  ['Внесок капіталу', 'Equity contributed', (y) => y.equityIn],
  ['Вибірка кредиту', 'Debt drawn', (y) => y.debtDraw],
  ['Відсотки й комісія за будівництво', 'Construction interest and fee', (y) => -y.idc - y.fee],
  ['Погашення тіла', 'Principal repaid', (y) => -y.principal],
  ['Відсотки сплачені', 'Interest paid', (y) => -y.interestPaid],
  ['Дивіденди', 'Dividends', (y) => -y.dividends],
  ['Фінансова діяльність', 'Financing activities', (y) => y.equityIn + y.debtDraw - y.idc - y.fee - y.principal - y.interestPaid - y.dividends, true],
  ['Гроші на кінець року', 'Cash at year end', (y) => y.cash, true],
];

function Debt({ r, scenario, lang, projectName }: Props) {
  const sc = scenarioLabel(scenario, lang);
  const years = r.annual.filter((y) => y.debt > 1 || y.principal > 0);
  const dscr: number[] = [];
  for (let k = 0; k + 4 <= r.debtQuarters.length; k += 4) {
    const q = r.debtQuarters.slice(k, k + 4);
    dscr.push(q.reduce((s, x) => s + x.cfads, 0) / q.reduce((s, x) => s + x.interest + x.principal, 0));
  }
  return (
    <div>
      <Lines title={{ entity: projectName, measure: L(lang, 'Залишок кредиту на кінець року, млн €', 'Debt at year end, EUR m'), scenario: `FC ${years[0]?.year}–${years.at(-1)?.year}, ${sc}` }}
        labels={years.map((y) => String(y.year))} series={[{ name: L(lang, 'Кредит', 'Debt'), values: years.map((y) => y.debt / 1e6) }]} decimals={1} />
      <Columns title={{ entity: projectName, measure: L(lang, 'DSCR за роками кредиту, ×', 'DSCR by loan year, ×'), scenario: `FC, ${sc}` }}
        labels={dscr.map((_, i) => String(i + 1))} values={dscr} decimals={2} />
      <div className="table-scroll">
        <table className="oc-table compact">
          <caption className="oc-overline">{L(lang, 'Графік обслуговування боргу за кварталами, тис. €', 'Quarterly debt service, EUR k')}</caption>
          <thead><tr><th>{L(lang, 'Дата', 'Date')}</th><th className="n">{L(lang, 'Залишок на початок', 'Opening')}</th><th className="n">{L(lang, 'Відсотки', 'Interest')}</th><th className="n">{L(lang, 'Тіло', 'Principal')}</th><th className="n">{L(lang, 'Залишок на кінець', 'Closing')}</th><th className="n">CFADS</th><th className="n">DSCR</th></tr></thead>
          <tbody>
            {r.debtQuarters.map((q) => (
              <tr key={q.month}><td>{q.date.split('-').reverse().join('.')}</td><td className="n">{num(q.opening / 1000)}</td><td className="n">{num(q.interest / 1000)}</td><td className="n">{num(q.principal / 1000)}</td><td className="n">{num(q.closing / 1000)}</td><td className="n">{num(q.cfads / 1000)}</td><td className={`n ${q.dscr < 1 ? 'oc-bad' : ''}`}>{num(q.dscr, 2)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">{L(lang, 'Квартальний DSCR влітку нижчий через сезонність вітру; ковенант зазвичай перевіряють за 12 місяців.', 'Quarterly DSCR dips in summer with wind seasonality; covenants are usually tested on 12 months.')}</p>
    </div>
  );
}

function Sens({ a, md, lang, stress, setStress, projectName }: Props) {
  const tbl = useMemo(() => scenarioTable(a, md, stress), [a, md, stress]);
  const wf = useMemo(() => waterfall(a, md, stress), [a, md, stress]);
  const prices = [-0.3, -0.2, -0.1, 0, 0.1, 0.2], capexes = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];
  const hm = useMemo(() => heatmap(a, md, prices, capexes), [a, md]);
  const ids: ScenarioId[] = ['base', 'S1', 'S2', 'S3', 'S4'];
  const rows = KPIS.filter((d) => d.k !== 'capexPerKW');
  const setS = (k: keyof StressSizes, v: number) => setStress({ ...stress, [k]: v });
  return (
    <div>
      <div className="stress-inputs">
        <label>{L(lang, 'S1: втрата генерації, червень–серпень 11:00–15:00', 'S1: generation lost, Jun–Aug 11:00–15:00')}
          <input type="number" step="5" value={Math.round(stress.curtailCut * 100)} onChange={(e) => setS('curtailCut', Number(e.target.value) / 100)} />%</label>
        <label>{L(lang, 'S2: CAPEX', 'S2: CAPEX')} +<input type="number" step="5" value={Math.round(stress.capexUp * 100)} onChange={(e) => setS('capexUp', Number(e.target.value) / 100)} />%</label>
        <label>{L(lang, 'S3: ціна РДН', 'S3: DAM price')} −<input type="number" step="5" value={Math.round(stress.priceDown * 100)} onChange={(e) => setS('priceDown', Number(e.target.value) / 100)} />%</label>
      </div>
      <div className="table-scroll">
        <table className="oc-table compact">
          <caption className="oc-overline">{L(lang, 'А. Показники за сценаріями (FC), відхилення від бази', 'A. KPIs by scenario (FC), variance to base')}</caption>
          <thead><tr><th>{L(lang, 'Показник', 'KPI')}</th>{ids.map((s) => <th key={s} className="n">{s === 'base' ? tr(S.base, lang) : s}</th>)}{ids.slice(1).map((s) => <th key={'d' + s} className="n">Δ {s}</th>)}</tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.k}>
                <td>{L(lang, d.uk, d.en)}{d.unit ? `, ${lang === 'uk' ? unitUk[d.unit] : d.unit}` : ''}</td>
                {ids.map((s) => <td key={s} className="n">{d.fmt(tbl[s][d.k] as number)}</td>)}
                {ids.slice(1).map((s) => {
                  const v = tbl[s][d.k] as number, b = tbl.base[d.k] as number;
                  const good = d.higherIsGood ? v >= b : v <= b;
                  const txt = deltaText(d, v, b);
                  return <td key={'d' + s} className={`n ${!/[1-9]/.test(txt) ? 'oc-muted' : good ? 'oc-good' : 'oc-bad'}`}>{txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Waterfall title={{ entity: projectName, measure: L(lang, 'Б. IRR капіталу, % — від бази до S4', 'B. Equity IRR, % — base to S4'), scenario: 'FC' }}
        steps={wf.map((w) => ({ label: w.step === 'base' ? tr(S.base, lang) : w.step, value: 'value' in w ? w.value : undefined, delta: 'delta' in w ? w.delta : undefined }))} decimals={1} />
      <SensGrid title={{ entity: projectName, measure: L(lang, 'В. IRR капіталу, % — ціна РДН × CAPEX', 'C. Equity IRR, % — DAM price × CAPEX'), scenario: L(lang, 'FC; ▲ ≥ вартості капіталу ', 'FC; ▲ ≥ cost of equity ') + pct(a.finance.costOfEquity, 0) }}
        rowHead="CAPEX" colHead={L(lang, 'Ціна РДН', 'DAM price')} rowLabels={capexes.map((c) => signedPct(c, 0))} colLabels={prices.map((p) => signedPct(p, 0))} m={hm} threshold={a.finance.costOfEquity} />
    </div>
  );
}

function Risks({ a, md, lang, projectName }: Props) {
  const rr = useMemo(() => riskRegister(a, md), [a, md]);
  const cons = rr.filter((x) => x.group === 'construction'), ops = rr.filter((x) => x.group === 'operations');
  const sum = (x: typeof rr) => x.reduce((s, v) => s + v.expected, 0);
  const table = (rows: typeof rr, cap: string, unit: string) => (
    <table className="oc-table compact">
      <caption className="oc-overline">{cap}</caption>
      <thead><tr><th>{L(lang, 'Ризик', 'Risk')}</th><th>{L(lang, 'Шок', 'Shock')}</th><th className="n">{L(lang, 'Імовірність', 'Probability')}</th><th className="n">{L(lang, 'Вплив', 'Impact')}, {unit}</th><th className="n">{L(lang, 'Очікувана втрата', 'Expected loss')}, {unit}</th></tr></thead>
      <tbody>
        {rows.map((x) => <tr key={x.id}><td>{L(lang, x.nameUk, x.nameEn)}</td><td>{x.shock}</td><td className="n">{pct(x.probability, 0)}</td><td className="n">{mln(x.impact)}</td><td className="n oc-bad">−{mln(x.expected)}</td></tr>)}
      </tbody>
      <tfoot><tr><td colSpan={4}>{L(lang, 'Разом', 'Total')}</td><td className="n">−{mln(sum(rows))}</td></tr></tfoot>
    </table>
  );
  return (
    <div>
      <Bars title={{ entity: projectName, measure: L(lang, 'Очікувані втрати експлуатації, млн € EBITDA на рік', 'Expected operating losses, EUR m EBITDA a year'), scenario: L(lang, 'FC; імовірність × вплив', 'FC; probability × impact') }}
        items={ops.map((x) => ({ label: L(lang, x.nameUk, x.nameEn), value: x.expected / 1e6 }))} decimals={2} />
      {table(cons, L(lang, 'Будівництво: втрати EBITDA від затримок і перевищення CAPEX', 'Construction: lost EBITDA from delays and CAPEX overrun'), L(lang, 'млн €', 'EUR m'))}
      {table(ops, L(lang, 'Експлуатація: втрати EBITDA на рік', 'Operations: EBITDA lost a year'), L(lang, 'млн €/рік', 'EUR m/yr'))}
      <p className="muted small">{L(lang, 'Імовірності — експертна оцінка з презентації, слайди 13–14. Воєнні ризики не враховано.', 'Probabilities are expert estimates from the deck, slides 13–14. War risks are excluded.')}</p>
    </div>
  );
}

export function Results(p: Props) {
  const { r, lang, tab } = p;
  const ok = Math.max(...r.flows.balanceCheck.map(Math.abs)) < 1;
  return (
    <main className="results">
      {!ok && <p className="banner oc-bad">{tr(S.balanceBad, lang)}</p>}
      {tab === 'overview' && <Overview {...p} />}
      {tab === 'gen' && <Gen {...p} />}
      {tab === 'capex' && <Capex {...p} />}
      {tab === 'pl' && <Statement r={r} lang={lang} rows={PL} caption={L(lang, 'Звіт про прибутки і збитки (IAS 1), FC', 'Statement of profit or loss (IAS 1), FC')} />}
      {tab === 'bs' && <Statement r={r} lang={lang} rows={BS} caption={L(lang, 'Звіт про фінансовий стан на кінець року, FC', 'Statement of financial position at year end, FC')} />}
      {tab === 'cf' && <Statement r={r} lang={lang} rows={CF} caption={L(lang, 'Звіт про рух грошових коштів (IAS 7), FC', 'Statement of cash flows (IAS 7), FC')} />}
      {tab === 'debt' && <Debt {...p} />}
      {tab === 'sens' && <Sens {...p} />}
      {tab === 'risk' && <Risks {...p} />}
      <p className="muted small foot">{capacityKW(p.a) / 1000} MW · {tr(S.ivoryNote, lang)} {ok ? tr(S.balanceOk, lang) : ''}</p>
    </main>
  );
}
