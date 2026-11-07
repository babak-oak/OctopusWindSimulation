// In-memory workbook: sheets of cells (value or formula + style), defined names, column widths.
// Built by build.ts, evaluated by evaluate.ts, written to .xlsx by xlsx.ts.

export type CellValue = number | string | boolean | null;
export type Style = 'in' | 'key' | 'link' | 'norm' | 'bold' | 'head' | 'title' | 'note';

export interface Cell {
  v?: CellValue;
  /** formula with leading '=' */
  f?: string;
  fmt?: string;
  style?: Style;
}

export function colLetter(c: number): string {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export class Sheet {
  private cells = new Map<number, Cell>();
  widths: Record<number, number> = {};
  freeze?: { row: number; col: number };
  constructor(public name: string) {}
  set(r: number, c: number, cell: Cell | CellValue): Cell {
    const x: Cell = cell !== null && typeof cell === 'object' ? cell : typeof cell === 'string' && cell.startsWith('=') ? { f: cell } : { v: cell };
    this.cells.set(r * 16384 + c, x);
    return x;
  }
  get(r: number, c: number): Cell | undefined { return this.cells.get(r * 16384 + c); }
  coords(): [number, number][] {
    return [...this.cells.keys()].sort((a, b) => a - b).map((k) => [Math.floor(k / 16384), k % 16384]);
  }
  width(c: number, w: number) { this.widths[c] = w; }
}

export class Book {
  sheets: Sheet[] = [];
  names: Record<string, string> = {};
  add(name: string, index?: number): Sheet {
    const s = new Sheet(name);
    if (index === undefined) this.sheets.push(s); else this.sheets.splice(index, 0, s);
    return s;
  }
  sheet(name: string): Sheet {
    const s = this.sheets.find((x) => x.name === name);
    if (!s) throw new Error(`no sheet ${name}`);
    return s;
  }
  name(n: string, ref: string) { this.names[n] = ref; }
}
