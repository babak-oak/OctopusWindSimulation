import { writeFileSync } from 'node:fs';
import { defaultAssumptions } from '../src/engine/defaults';
import { marketData } from '../src/engine/data';
import { run } from '../src/engine/model';

const a = defaultAssumptions();
if (process.argv.includes('--grant')) a.compensation.enabled = true;
const r = run(a, marketData);
console.table(r.kpis);
console.log('max |balance check|', Math.max(...r.flows.balanceCheck.map(Math.abs)));
console.table(r.annual.slice(0, 6).map((y) => ({ y: y.year, gen: Math.round(y.generation), ebitda: Math.round(y.ebitda), np: Math.round(y.netProfit), div: Math.round(y.dividends), debt: Math.round(y.debt), cash: Math.round(y.cash) })));
const out = process.argv.find((x) => x.startsWith('--out='));
if (out) writeFileSync(out.slice(6), JSON.stringify({ kpis: r.kpis, annual: r.annual, capexByItem: r.capexByItem, debtQuarters: r.debtQuarters }, null, 1));
