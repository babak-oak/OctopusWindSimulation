// Writes the browser export for the cross-check cases so LibreOffice can recalculate it independently.
// Usage: npx tsx scripts/export-check.ts <dir>   then   python3 -I scripts/compare_export.py <dir> <recalc.py>
import { mkdirSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { defaultAssumptions } from '../src/engine/defaults';
import { marketData } from '../src/engine/data';
import { run } from '../src/engine/model';
import { applyScenario, defaultStress, type ScenarioId } from '../src/engine/scenarios';
import { projectWorkbook } from '../src/export/xlsx';

const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
const half = defaultAssumptions(); half.project.turbines = 8;
const manual = structuredClone(half); manual.capex.items.find((i) => i.id === 'roads')!.manualQty = 14;
manual.generation.manualAEP = 150_000; manual.project.manualGridMW = 45; manual.opex.manualLandHa = 3.5;
const grant = defaultAssumptions(); grant.compensation.enabled = true;
const cases: [string, ReturnType<typeof defaultAssumptions>, ScenarioId, 'uk' | 'en'][] = [
  ['base', defaultAssumptions(), 'base', 'uk'], ['S4', defaultAssumptions(), 'S4', 'en'], ['grant', grant, 'S1', 'uk'], ['half', half, 'S2', 'en'], ['manual', manual, 'S3', 'uk'],
];
(async () => {
  for (const [name, a, sc, lang] of cases) {
    const buf = await projectWorkbook({ base: a, md: marketData, lang, scenario: sc, stress: defaultStress }, ExcelJS);
    writeFileSync(`${dir}/${name}.xlsx`, Buffer.from(buf));
    writeFileSync(`${dir}/${name}.engine.json`, JSON.stringify(run(applyScenario(a, sc, defaultStress), marketData).kpis));
    console.log(name, sc, lang, Buffer.from(buf).length, 'bytes');
  }
})();
