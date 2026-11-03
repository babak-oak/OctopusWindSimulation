// Dumps assumptions + engine results for the cross-check cases (ТЗ, розділ 11).
import { mkdirSync, writeFileSync } from 'node:fs';
import { defaultAssumptions } from '../src/engine/defaults';
import { marketData } from '../src/engine/data';
import { run } from '../src/engine/model';
import { applyScenario } from '../src/engine/scenarios';
const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
const base = defaultAssumptions();
const grant = defaultAssumptions(); grant.compensation.enabled = true;
const cases: Record<string, ReturnType<typeof defaultAssumptions>> = {
  base, grant, S1: applyScenario(base, 'S1'), S2: applyScenario(base, 'S2'), S3: applyScenario(base, 'S3'), S4: applyScenario(base, 'S4'),
};
for (const [k, a] of Object.entries(cases)) {
  const r = run(a, marketData);
  writeFileSync(`${dir}/${k}.assumptions.json`, JSON.stringify(a));
  writeFileSync(`${dir}/${k}.engine.json`, JSON.stringify({ kpis: r.kpis, annual: r.annual }));
}
