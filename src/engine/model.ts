import type { AnnualRow, Assumptions, Flows, Kpis, MarketData, Result } from './types';
import { calMonth, monthEnd, paybackMonths, xirr, xnpv } from './finance';
import { siteNetAEP } from './wind';

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const zeros = (n: number) => new Array<number>(n).fill(0);

export function capacityKW(a: Assumptions): number {
  return a.project.turbines * a.project.turbineMW * 1000;
}

const refMW = (a: Assumptions) => a.project.reference.turbines * a.project.reference.turbineMW;
const mwFactor = (a: Assumptions) => capacityKW(a) / 1000 / refMW(a);
const turbineFactor = (a: Assumptions) => a.project.turbines / a.project.reference.turbines;

/** Net AEP: manual value, or the reference AEP scaled with installed MW (same capacity factor). */
export function netAEP(a: Assumptions): number {
  if (a.generation.manualAEP != null) return a.generation.manualAEP;
  const site = a.generation.site ? siteNetAEP(a.generation.site, a.project.turbines) : undefined;
  return site ?? a.generation.netAEP_MWh * mwFactor(a);
}
/** 12 x 24 generation shares: computed for the site in site mode, otherwise the proposal profile. */
export function windShares(a: Assumptions, md: MarketData): number[][] {
  const s = a.generation.site;
  return s?.mode === 'site' && s.result ? s.result.shares : md.windShares;
}
/** Grid (project) capacity, MW: manual value, or the reference scaled with installed MW. */
export function gridMW(a: Assumptions): number {
  return a.project.manualGridMW ?? a.project.gridMW * mwFactor(a);
}
/** Land, ha: manual value, or the reference scaled with the turbine count. */
export function landHa(a: Assumptions): number {
  return a.opex.manualLandHa ?? a.opex.landHa * turbineFactor(a);
}
export function staffCount(a: Assumptions, r: { count: number; per?: number; manualCount?: number }): number {
  if (r.manualCount !== undefined) return r.manualCount;
  return r.per ? r.count * Math.ceil(a.project.turbines / r.per) : r.count;
}
/** Employer cost per person a month: net / (1 − PIT − military levy) × (1 + ESV). */
export function staffMonthlyCost(a: Assumptions, netMonthly: number): number {
  const p = a.opex.payroll;
  return (netMonthly / (1 - p.pit - p.military)) * (1 + p.esv);
}
export function staffAnnualCost(a: Assumptions): number {
  return a.opex.staffRoles.reduce((s, r) => s + staffCount(a, r) * staffMonthlyCost(a, r.netMonthly) * 12, 0);
}

/** Annual net generation, MWh (ТЗ 5.1). */
export function annualGeneration(a: Assumptions): number {
  const g = a.generation;
  const aep = netAEP(a);
  return g.aepIncludesLosses ? aep : aep * g.availability * (1 - g.techLosses);
}

/** Item amount in EUR ex VAT, before contingency and stress multiplier. */
type QtyItem = { qty: number; qtyBasis?: string; scale?: string; manualQty?: number };

/** Scale factor of an item relative to the reference layout (1 when it does not scale). */
export function scaleFactor(a: Assumptions, i: { scale?: string }): number {
  const ref = a.project.reference;
  if (i.scale === 'turbines') return a.project.turbines / ref.turbines;
  if (i.scale === 'installedMW') return (a.project.turbines * a.project.turbineMW) / (ref.turbines * ref.turbineMW);
  return 1;
}

/** Quantity used in the calculation: per-kW basis, a manual override, or the reference quantity scaled. */
export function itemQty(a: Assumptions, i: QtyItem): number {
  if (i.qtyBasis === 'installedKW') return capacityKW(a);
  if (i.qtyBasis === 'gridKW') return gridMW(a) * 1000;
  if (i.manualQty !== undefined) return i.manualQty;
  return i.qty * scaleFactor(a, i);
}

export function itemAmount(a: Assumptions, i: QtyItem & { rate: number; currency: string }): number {
  const v = itemQty(a, i) * i.rate;
  return i.currency === 'UAH' ? v / a.fx.uahPerEur : v;
}

/** Monthly weights (index 0 = month 1) for a payment schedule (ТЗ 5.4). */
export function scheduleWeights(a: Assumptions, kind: string): number[] {
  const n = a.project.constructionMonths;
  const s = a.schedule;
  const w = zeros(n);
  if (kind === 'turbine') {
    for (const p of s.turbinePayments) w[p.month - 1] += p.pct;
    const total = a.project.turbines;
    let left = total;
    let m = s.firstArrivalMonth;
    while (left > 0 && m <= n) {
      const k = Math.min(s.turbinesPerMonth, left);
      w[m - 1] += (s.portPct * k) / total;
      left -= k;
      m++;
    }
  } else if (kind === 'works') {
    const e = s.worksFirstEndMonth;
    for (let k = 1; k <= e; k++) w[k - 1] += s.worksFirstPct / e;
    for (let k = e + 1; k <= n; k++) w[k - 1] += (1 - s.worksFirstPct) / (n - e);
  } else if (kind === 'montage') {
    const st = s.montageStartMonth;
    for (let k = st; k <= n; k++) w[k - 1] += 1 / (n - st + 1);
  } else if (kind === 'dev') {
    w[s.devMonth - 1] = 1;
  }
  return w;
}

export function run(a: Assumptions, md: MarketData): Result {
  const ws = windShares(a, md);
  const C = a.project.constructionMonths;
  const L = a.project.lifeYears * 12;
  const T = C + L;
  const f = a.finance;
  const fx = a.fx.uahPerEur;
  const kw = capacityKW(a);

  // ---------- CAPEX by item and month ----------
  const items = a.capex.items.map((i) => ({ ...i, amount: itemAmount(a, i) * a.stress.capexMult }));
  const baseSum = sum(items.map((i) => i.amount));
  const contingency = baseSum * a.capex.contingencyPct;
  const lines = [
    ...items.map((i) => ({ id: i.id, nameUk: i.nameUk, nameEn: i.nameEn, amount: i.amount, vat: i.vat, schedule: i.schedule as string })),
    { id: 'contingency', nameUk: 'Непередбачувані', nameEn: 'Contingency', amount: contingency, vat: true, schedule: 'works' },
  ];
  const capexM = zeros(C);
  const vatM = zeros(C);
  let devCash = 0; // development paid by equity, incl. VAT
  const capexByItem = lines.map((l) => {
    const w = scheduleWeights(a, l.schedule);
    w.forEach((x, k) => {
      capexM[k] += l.amount * x;
      if (l.vat) vatM[k] += l.amount * x * f.vatRate;
    });
    if (l.schedule === 'dev') devCash += l.amount * (1 + (l.vat ? f.vatRate : 0));
    return { id: l.id, nameUk: l.nameUk, nameEn: l.nameEn, exVat: l.amount, vat: l.vat ? l.amount * f.vatRate : 0 };
  });
  const capexTotal = sum(capexM);

  // ---------- Construction financing (ТЗ 5.5), fixed point on total funding ----------
  const r12 = f.rate / 12;
  let F = capexTotal + sum(vatM);
  let draw = zeros(C), eq = zeros(C), idc = zeros(C), fee = zeros(C), need = zeros(C);
  for (let it = 0; it < 200; it++) {
    const D = f.debtShare * F;
    const d = D / (F - devCash); // debt share of non-development needs
    draw = zeros(C); eq = zeros(C); idc = zeros(C); fee = zeros(C); need = zeros(C);
    let bal = 0;
    for (let k = 0; k < C; k++) {
      idc[k] = bal * r12;
      fee[k] = k === 0 ? f.feePct * D : 0;
      need[k] = capexM[k] + vatM[k] + idc[k] + fee[k];
      const dev = k === a.schedule.devMonth - 1 ? devCash : 0;
      draw[k] = d * (need[k] - dev);
      eq[k] = need[k] - draw[k];
      bal += draw[k];
    }
    const F2 = sum(need);
    if (Math.abs(F2 - F) < 1e-6) { F = F2; break; }
    F = F2;
  }
  const debt0 = sum(draw);
  const ppeGross = capexTotal + sum(idc) + sum(fee);

  // ---------- Timeline ----------
  const E = annualGeneration(a);
  const staffCost = staffAnnualCost(a);
  const land = landHa(a);
  const price = a.market.basePrice * a.stress.priceMult;
  const cur = a.stress.curtailment;
  const fl: Flows = {
    date: [], isOps: [], generation: zeros(T), revenueGross: zeros(T), revenueNet: zeros(T), opex: zeros(T), ebitda: zeros(T),
    capexExVat: zeros(T), capexVat: zeros(T), idc: zeros(T), fee: zeros(T), debtDraw: zeros(T), equityIn: zeros(T),
    depreciation: zeros(T), interestExpense: zeros(T), interestPaid: zeros(T), principal: zeros(T), debtClose: zeros(T),
    vatRecovered: zeros(T), vatBalance: zeros(T), grantCash: zeros(T), grantIncome: zeros(T), grantReceivable: zeros(T),
    deferredIncome: zeros(T), taxExpense: zeros(T), netProfit: zeros(T), dividends: zeros(T), cashClose: zeros(T),
    ppeNet: zeros(T), interestPayable: zeros(T), shareCapital: zeros(T), retainedEarnings: zeros(T), balanceCheck: zeros(T),
    projectFcf: zeros(T), cfads: zeros(T),
  };
  const grant = a.compensation.enabled ? a.compensation.pct * capexTotal : 0;
  const repayN = (f.tenorYears * 12) / f.repayEveryMonths;
  const principalPer = debt0 / repayN;
  const depM = ppeGross / (f.depreciationYears * 12);
  const depUnlev = capexTotal / (f.depreciationYears * 12);

  let debt = 0, cash = 0, ppe = 0, vatBal = 0, grantRec = 0, defInc = 0, intPayable = 0, share = 0, re = 0;
  let lcf = 0, lcfU = 0, yearTaxable = 0, yearTaxableU = 0;
  const unlevTax = zeros(T);
  const preCash = zeros(T), minCash = zeros(T);
  const divDate = new Array<boolean>(T).fill(false);

  for (let t = 1; t <= T; t++) {
    const i = t - 1;
    const { year, month } = calMonth(a.project.startDate, t);
    fl.date.push(monthEnd(a.project.startDate, i));
    const ops = t > C;
    fl.isOps.push(ops);
    if (!ops) {
      fl.capexExVat[i] = capexM[i]; fl.capexVat[i] = vatM[i]; fl.idc[i] = idc[i]; fl.fee[i] = fee[i];
      fl.debtDraw[i] = draw[i]; fl.equityIn[i] = eq[i];
      fl.projectFcf[i] = -(capexM[i] + vatM[i]);
      debt += draw[i]; share += eq[i]; ppe += capexM[i] + idc[i] + fee[i]; vatBal += vatM[i];
    } else {
      const o = t - C; // ops month 1..L
      // generation and revenue
      const shares = ws[month - 1];
      const shape = md.priceShape[month - 1];
      let gen = 0, rev = 0;
      for (let h = 0; h < 24; h++) {
        const cut = cur.enabled && cur.months.includes(month) && cur.hours.includes(h + 1) ? cur.cut : 0;
        const e = E * shares[h] * (1 - cut);
        gen += e;
        rev += e * price * shape[h];
      }
      const pIdx = Math.pow(1 + a.market.priceIndexation, year - a.opex.baseYear);
      rev *= pIdx;
      const idx = Math.pow(1 + a.opex.indexation, year - a.opex.baseYear);
      const op = a.opex;
      const fixedAnnual = op.omPerMW * (kw / 1000) + staffCost + op.insurancePctCapex * capexTotal + op.rentPerHa * land
        + op.adminPerMonth * 12 + (op.marketOpFixUAHperMonth * 12) / fx;
      const opex = a.stress.opexMult * ((fixedAnnual / 12) * idx + ((op.dispatchUAHperMWh + op.marketOpVarUAHperMWh) / fx) * gen * idx
        + (op.nkrekpPctRevenue + op.otherPctRevenue) * rev);
      const revNet = rev * (1 - a.market.traderFee - a.market.imbalance);
      const ebitda = revNet - opex;
      fl.generation[i] = gen; fl.revenueGross[i] = rev; fl.revenueNet[i] = revNet; fl.opex[i] = opex; fl.ebitda[i] = ebitda;

      // grant (IAS 20): receivable at COD, cash after delay, income over life
      if (o === 1 && grant > 0) { grantRec += grant; defInc += grant; }
      if (o === a.compensation.delayMonths && grant > 0) { fl.grantCash[i] = grant; grantRec -= grant; }
      const gInc = grant / L;
      fl.grantIncome[i] = gInc; defInc -= gInc;

      // depreciation
      fl.depreciation[i] = depM; ppe -= depM;

      // interest accrual, quarterly payments
      const intExp = debt * r12;
      fl.interestExpense[i] = intExp; intPayable += intExp;
      let vatRec = 0, princ = 0, intPaid = 0;
      if (o % f.repayEveryMonths === 0) {
        intPaid = intPayable; intPayable = 0;
        if (o / f.repayEveryMonths <= repayN) princ = Math.min(principalPer, debt);
        // VAT offset against output VAT of the quarter
        let outVat = 0;
        for (let q = 0; q < f.repayEveryMonths; q++) outVat += fl.revenueNet[i - q] * f.vatRate;
        vatRec = Math.min(vatBal, outVat);
      }
      fl.interestPaid[i] = intPaid; fl.principal[i] = princ; fl.vatRecovered[i] = vatRec;
      debt -= princ; vatBal -= vatRec;

      // tax: annual on calendar year, booked and paid in December or the final month
      yearTaxable += ebitda - depM - intExp;
      yearTaxableU += ebitda - depUnlev;
      let tax = 0;
      if (month === 12 || t === T) {
        const base = yearTaxable + lcf;
        if (base > 0) { tax = f.taxRate * base; lcf = 0; } else { lcf = base; }
        const baseU = yearTaxableU + lcfU;
        if (baseU > 0) { unlevTax[i] = f.taxRate * baseU; lcfU = 0; } else { lcfU = baseU; }
        yearTaxable = 0; yearTaxableU = 0;
      }
      fl.taxExpense[i] = tax;
      const np = ebitda - depM - intExp + gInc - tax;
      fl.netProfit[i] = np;

      // cash before dividends (dividends change nothing else, so they are set in a second pass)
      preCash[i] = ebitda - tax + vatRec + fl.grantCash[i] - intPaid - princ;
      minCash[i] = opex + debt * r12;
      divDate[i] = t === T || (f.dividendEveryMonths === 12 ? month === 12 : o % f.dividendEveryMonths === 0);
      fl.cfads[i] = ebitda - tax + vatRec;
      fl.projectFcf[i] = ebitda - unlevTax[i] + vatRec + fl.grantCash[i];
    }
    fl.debtClose[i] = debt; fl.ppeNet[i] = ppe; fl.vatBalance[i] = vatBal;
    fl.grantReceivable[i] = grantRec; fl.deferredIncome[i] = defInc; fl.interestPayable[i] = intPayable;
    fl.shareCapital[i] = share;
  }

  // ---------- Dividends (ТЗ 5.7): all cash above the minimum balance, paid on dividend dates.
  // Seasonal reserve: what stays must keep cash at or above the minimum balance in every later month
  // even if no further dividends were paid, so low-wind summer quarters can still meet debt service.
  const cumPre: number[] = [];
  preCash.reduce((s2, v, i) => (cumPre[i] = s2 + v), 0);
  for (let i = 0; i < T; i++) {
    cash += preCash[i];
    let div = 0;
    if (fl.isOps[i] && divDate[i]) {
      if (i === T - 1) div = Math.max(0, cash);
      else {
        let keep = minCash[i];
        for (let k = i + 1; k < T; k++) keep = Math.max(keep, minCash[k] - (cumPre[k] - cumPre[i]));
        div = Math.max(0, cash - keep);
      }
    }
    fl.dividends[i] = div; cash -= div; re += fl.netProfit[i] - div;
    fl.cashClose[i] = cash; fl.retainedEarnings[i] = re;
    const assets = fl.ppeNet[i] + fl.vatBalance[i] + fl.grantReceivable[i] + cash;
    const liab = fl.debtClose[i] + fl.interestPayable[i] + fl.deferredIncome[i] + fl.shareCapital[i] + re;
    fl.balanceCheck[i] = assets - liab;
  }

  // ---------- Debt quarters ----------
  const debtQuarters: Result['debtQuarters'] = [];
  let opening = debt0;
  for (let t = C + 1; t <= T; t++) {
    const i = t - 1;
    if ((t - C) % f.repayEveryMonths !== 0 || fl.principal[i] === 0 && fl.interestPaid[i] === 0) continue;
    if (opening <= 1e-6) break;
    let cf = 0;
    for (let q = 0; q < f.repayEveryMonths; q++) cf += fl.cfads[i - q];
    const ds = fl.principal[i] + fl.interestPaid[i];
    debtQuarters.push({ month: t, date: fl.date[i], opening, interest: fl.interestPaid[i], principal: fl.principal[i], closing: fl.debtClose[i], cfads: cf, dscr: ds > 0 ? cf / ds : NaN });
    opening = fl.debtClose[i];
  }

  // ---------- KPIs ----------
  const wacc = (1 - f.debtShare) * f.costOfEquity + f.debtShare * f.rate * (1 - f.taxRate);
  const equityFlows = fl.equityIn.map((v, i) => fl.dividends[i] - v);
  const opsIdx = fl.isOps.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const first60 = opsIdx.slice(0, 60);
  const ebitdaAvg5 = sum(first60.map((i) => fl.ebitda[i])) / 5;
  const equity = sum(fl.equityIn);
  const npAvg = sum(fl.netProfit) / a.project.lifeYears;
  const disc = (v: number[]) => xnpv(wacc, v, fl.date);
  const lcoe = disc(fl.capexExVat.map((v, i) => v + fl.opex[i])) / disc(fl.generation);
  // LLCR at COD: CFADS over the loan life discounted at the loan rate
  const lastDebtMonth = debtQuarters.length ? debtQuarters[debtQuarters.length - 1].month : C;
  const cfLoan = fl.cfads.map((v, i) => (i + 1 > C && i + 1 <= lastDebtMonth ? v : 0));
  const codDates = fl.date.slice(C - 1);
  const llcr = xnpv(f.rate, cfLoan.slice(C - 1), codDates) / debt0;
  // DSCR on loan years (4 quarters from COD): quarterly values swing with wind seasonality
  const perYear = 12 / f.repayEveryMonths;
  const dscrs: number[] = [];
  for (let k = 0; k + perYear <= debtQuarters.length; k += perYear) {
    const qs = debtQuarters.slice(k, k + perYear);
    const ds = sum(qs.map((q) => q.interest + q.principal));
    if (ds > 0) dscrs.push(sum(qs.map((q) => q.cfads)) / ds);
  }
  const genYear = E; // full-year generation without curtailment
  let capRev = 0, capGen = 0;
  for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h++) { capGen += ws[m][h]; capRev += ws[m][h] * md.priceShape[m][h]; }

  const kpis: Kpis = {
    capexExVat: capexTotal,
    capexPerKW: capexTotal / kw,
    debt: debt0,
    equity,
    idc: sum(idc),
    fee: sum(fee),
    vatPaid: sum(vatM),
    annualGeneration: genYear,
    capturePrice: price * capRev / capGen,
    baselinePrice: price,
    projectIrr: xirr(fl.projectFcf, fl.date),
    equityIrr: xirr(equityFlows, fl.date),
    npvProject: disc(fl.projectFcf),
    wacc,
    ebitdaAvg5,
    ebitdaToCapex: ebitdaAvg5 / capexTotal,
    npToEquity: npAvg / equity,
    // simple payback, counted from COD; the cumulative flow starts with construction outflows
    paybackProjectYears: (paybackMonths(fl.projectFcf) - C) / 12,
    paybackEquityYears: (paybackMonths(equityFlows) - C) / 12,
    lcoe,
    dscrMin: Math.min(...dscrs),
    dscrAvg: sum(dscrs) / dscrs.length,
    llcr,
    grant,
  };

  // ---------- Annual (calendar years) ----------
  const years = new Map<number, number[]>();
  for (let t = 1; t <= T; t++) {
    const y = calMonth(a.project.startDate, t).year;
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(t - 1);
  }
  const annual: AnnualRow[] = [...years.entries()].map(([year, idxs]) => {
    const s = (k: keyof Flows) => sum(idxs.map((i) => (fl[k] as number[])[i]));
    const last = idxs[idxs.length - 1];
    const ebitda = s('ebitda');
    const pbt = ebitda - s('depreciation') - s('interestExpense') + s('grantIncome');
    return {
      year, generation: s('generation'), revenueGross: s('revenueGross'), revenueNet: s('revenueNet'), opex: s('opex'), ebitda,
      depreciation: s('depreciation'), interestExpense: s('interestExpense'), grantIncome: s('grantIncome'), pbt, tax: s('taxExpense'),
      netProfit: s('netProfit'), capexExVat: s('capexExVat'), capexVat: s('capexVat'), idc: s('idc'), fee: s('fee'),
      debtDraw: s('debtDraw'), equityIn: s('equityIn'), principal: s('principal'), interestPaid: s('interestPaid'),
      vatRecovered: s('vatRecovered'), grantCash: s('grantCash'), dividends: s('dividends'),
      ppeNet: fl.ppeNet[last], vatBalance: fl.vatBalance[last], grantReceivable: fl.grantReceivable[last], cash: fl.cashClose[last],
      debt: fl.debtClose[last], interestPayable: fl.interestPayable[last], deferredIncome: fl.deferredIncome[last],
      shareCapital: fl.shareCapital[last], retainedEarnings: fl.retainedEarnings[last], balanceCheck: fl.balanceCheck[last],
    };
  });

  return { flows: fl, kpis, capexByItem, debtQuarters, annual };
}
