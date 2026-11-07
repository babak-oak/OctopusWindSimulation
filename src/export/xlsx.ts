// Writes the in-memory workbook to .xlsx with ExcelJS: formulas plus cached values from the evaluator.
import type ExcelJSNS from 'exceljs';
import { colLetter, type Book, type Style } from './book';
import { buildBook, type ExportCtx } from './build';
import { Evaluator } from './evaluate';

const FONT = 'Arial';
const STYLE: Record<Style, { font: Partial<ExcelJSNS.Font>; fill?: ExcelJSNS.Fill }> = {
  norm: { font: { name: FONT, size: 10 } },
  in: { font: { name: FONT, size: 10, color: { argb: 'FF0000FF' } } },
  key: { font: { name: FONT, size: 10, color: { argb: 'FF0000FF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } } },
  link: { font: { name: FONT, size: 10, color: { argb: 'FF008000' } } },
  bold: { font: { name: FONT, size: 10, bold: true } },
  head: { font: { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2433' } } },
  title: { font: { name: FONT, size: 13, bold: true } },
  note: { font: { name: FONT, size: 10, color: { argb: 'FF555555' } } },
};

export async function bookToBuffer(ExcelJS: typeof ExcelJSNS, book: Book, ev: Evaluator, meta: { title: string; creator: string }): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.creator;
  wb.title = meta.title;
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  for (const sh of book.sheets) {
    const ws = wb.addWorksheet(sh.name);
    for (const [c, w] of Object.entries(sh.widths)) ws.getColumn(Number(c)).width = w;
    if (sh.freeze) ws.views = [{ state: 'frozen', xSplit: sh.freeze.col - 1, ySplit: sh.freeze.row - 1 }];
    for (const [r, c] of sh.coords()) {
      const cell = sh.get(r, c)!;
      const x = ws.getCell(r, c);
      if (cell.f) {
        const v = ev.value(sh.name, r, c);
        const ok = !(typeof v === 'string' && v.startsWith('#'));
        x.value = ok && v !== null ? { formula: cell.f.slice(1), result: v as number | string | boolean } as ExcelJSNS.CellFormulaValue : { formula: cell.f.slice(1) } as ExcelJSNS.CellFormulaValue;
      } else if (cell.v !== undefined && cell.v !== null) {
        x.value = cell.v;
      }
      const st = STYLE[cell.style ?? 'norm'];
      x.font = st.font;
      if (st.fill) x.fill = st.fill;
      if (cell.fmt) x.numFmt = cell.fmt;
    }
  }
  for (const [n, ref] of Object.entries(book.names)) wb.definedNames.add(ref, n);
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Builds, evaluates and writes the project workbook. Returns the bytes; the caller saves them. */
export async function projectWorkbook(ctx: ExportCtx, ExcelJS: typeof ExcelJSNS, creator = 'Octopus Wind Simulation'): Promise<ArrayBuffer> {
  const { book, timelineOrder } = buildBook(ctx);
  const ev = new Evaluator(book);
  ev.run(() => timelineOrder);
  return bookToBuffer(ExcelJS, book, ev, { title: ctx.base.project.name, creator });
}

/** Browser: build the workbook and download it. */
export async function downloadProjectXlsx(ctx: ExportCtx): Promise<void> {
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof ExcelJSNS }).default ?? mod) as typeof ExcelJSNS;
  const buf = await projectWorkbook(ctx, ExcelJS);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const safe = ctx.base.project.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'project';
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([blob], `${safe} ${ctx.scenario} ${date}.xlsx`, { type: blob.type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
}

export { colLetter };
