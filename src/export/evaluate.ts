// A small evaluator for the formula subset the export uses. It fills cached values into the workbook so the file
// shows numbers in previews (mail, phone) before Excel recalculates, and doubles as a check against the engine.
import type { Book, CellValue } from './book';
import { colIndex } from './book';

type Scalar = number | string | boolean | null;
type Arr = Scalar[][];
type Val = Scalar | Arr;

class XlError extends Error {}

// ---------- parser ----------
type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'ref'; sheet: string; r1: number; c1: number; r2: number; c2: number }
  | { k: 'name'; n: string }
  | { k: 'fn'; n: string; args: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node };

const CELL = /^\$?([A-Z]{1,3})\$?(\d+)/;

function tokenize(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ') { i++; continue; }
    if (ch === '"') {
      let j = i + 1, s = '';
      while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; } s += src[j++]; }
      out.push('"' + s); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { out.push(two); i += 2; continue; }
    if ('+-*/^&=<>(),:'.includes(ch)) { out.push(ch); i++; continue; }
    if (ch === "'") { const j = src.indexOf("'", i + 1); out.push(src.slice(i, j + 1)); i = j + 1; continue; }
    const m = src.slice(i).match(/^(\d+\.?\d*(?:[eE][+-]?\d+)?|\$?[A-Za-z_][\w.$]*!?)/);
    if (!m) throw new XlError(`token at ${i} in ${src}`);
    out.push(m[0]); i += m[0].length;
  }
  return out;
}

export function parse(formula: string, defaultSheet: string): Node {
  const t = tokenize(formula.startsWith('=') ? formula.slice(1) : formula);
  let p = 0;
  const peek = () => t[p];
  const next = () => t[p++];
  const PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  function expr(min = 1): Node {
    let a = unary();
    for (;;) {
      const op = peek();
      const pr = op !== undefined ? PREC[op] : undefined;
      if (pr === undefined || pr < min) break;
      next();
      const b = expr(pr + 1);
      a = { k: 'bin', op, a, b };
    }
    return a;
  }
  function unary(): Node {
    if (peek() === '-') { next(); return { k: 'un', op: '-', a: unary() }; }
    if (peek() === '+') { next(); return unary(); }
    return primary();
  }
  function refFrom(tok: string, sheet: string): Node | null {
    const m = tok.match(CELL);
    if (!m || m[0].length !== tok.length) return null;
    const c1 = colIndex(m[1]), r1 = Number(m[2]);
    if (peek() === ':') {
      const save = p;
      next();
      const t2 = next();
      const m2 = t2?.match(CELL);
      if (m2 && m2[0].length === t2.length) return { k: 'ref', sheet, r1, c1, r2: Number(m2[2]), c2: colIndex(m2[1]) };
      p = save;
    }
    return { k: 'ref', sheet, r1, c1, r2: r1, c2: c1 };
  }
  function primary(): Node {
    const tok = next();
    if (tok === undefined) throw new XlError('unexpected end');
    if (tok === '(') { const e = expr(); if (next() !== ')') throw new XlError('expected )'); return e; }
    if (tok[0] === '"') return { k: 'str', v: tok.slice(1) };
    if (/^\d/.test(tok)) return { k: 'num', v: Number(tok) };
    if (tok.endsWith('!') || tok.startsWith("'")) {
      const sheet = tok.startsWith("'") ? tok.slice(1, -1) : tok.slice(0, -1);
      if (tok.startsWith("'")) next(); // the '!' token
      const r = refFrom(next(), sheet);
      if (!r) throw new XlError('bad sheet ref');
      return r;
    }
    if (peek() === '(' && /^[A-Za-z_][\w.]*$/.test(tok)) {
      next();
      const args: Node[] = [];
      if (peek() !== ')') { for (;;) { args.push(expr()); if (peek() === ',') { next(); continue; } break; } }
      if (next() !== ')') throw new XlError('expected ) after args');
      return { k: 'fn', n: tok.toUpperCase(), args };
    }
    const up = tok.toUpperCase();
    if (up === 'TRUE' || up === 'FALSE') return { k: 'bool', v: up === 'TRUE' };
    const r = refFrom(tok, defaultSheet);
    if (r) return r;
    return { k: 'name', n: tok };
  }
  const n = expr();
  if (p !== t.length) throw new XlError(`trailing tokens in ${formula}`);
  return n;
}

// ---------- values ----------
const isArr = (v: Val): v is Arr => Array.isArray(v);
const num = (v: Scalar): number => (v === null || v === '' ? 0 : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : (() => { const x = Number(v); if (Number.isNaN(x)) throw new XlError('#VALUE!'); return x; })());
const scalar = (v: Val): Scalar => (isArr(v) ? v[0][0] : v);
function flat(v: Val): Scalar[] { return isArr(v) ? v.flat() : [v]; }
function nums(vals: Val[]): number[] {
  const out: number[] = [];
  for (const v of vals) {
    if (isArr(v)) { for (const x of v.flat()) if (typeof x === 'number') out.push(x); }
    else if (v !== null && v !== '') out.push(num(v));
  }
  return out;
}

function cmp(a: Scalar, b: Scalar): number {
  const an = a === null ? (typeof b === 'string' ? '' : 0) : a;
  const bn = b === null ? (typeof a === 'string' ? '' : 0) : b;
  const ta = typeof an === 'boolean' ? 2 : typeof an === 'string' ? 1 : 0;
  const tb = typeof bn === 'boolean' ? 2 : typeof bn === 'string' ? 1 : 0;
  if (ta !== tb) return ta - tb;
  if (ta === 1) { const x = (an as string).toLowerCase(), y = (bn as string).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  const x = Number(an), y = Number(bn);
  return x < y ? -1 : x > y ? 1 : 0;
}

function binScalar(op: string, a: Scalar, b: Scalar): Scalar {
  switch (op) {
    case '+': return num(a) + num(b);
    case '-': return num(a) - num(b);
    case '*': return num(a) * num(b);
    case '/': { const d = num(b); if (d === 0) throw new XlError('#DIV/0!'); return num(a) / d; }
    case '^': return Math.pow(num(a), num(b));
    case '&': return `${a ?? ''}${b ?? ''}`;
    case '=': return cmp(a, b) === 0;
    case '<>': return cmp(a, b) !== 0;
    case '<': return cmp(a, b) < 0;
    case '>': return cmp(a, b) > 0;
    case '<=': return cmp(a, b) <= 0;
    case '>=': return cmp(a, b) >= 0;
  }
  throw new XlError(`op ${op}`);
}

function broadcast(op: string, a: Val, b: Val): Val {
  if (!isArr(a) && !isArr(b)) return binScalar(op, a, b);
  const A = isArr(a) ? a : null, B = isArr(b) ? b : null;
  const rows = Math.max(A?.length ?? 1, B?.length ?? 1), cols = Math.max(A?.[0].length ?? 1, B?.[0].length ?? 1);
  const out: Arr = [];
  for (let r = 0; r < rows; r++) {
    const row: Scalar[] = [];
    for (let c = 0; c < cols; c++) {
      const x = A ? A[A.length === 1 ? 0 : r][A[0].length === 1 ? 0 : c] : (a as Scalar);
      const y = B ? B[B.length === 1 ? 0 : r][B[0].length === 1 ? 0 : c] : (b as Scalar);
      row.push(binScalar(op, x, y));
    }
    out.push(row);
  }
  return out;
}

// Excel serial dates (1900 system)
const EPOCH = Date.UTC(1899, 11, 30);
export const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - EPOCH) / 864e5;
const fromSerial = (s: number) => new Date(EPOCH + Math.round(s) * 864e5);

function xnpv(rate: number, v: number[], d: number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] / Math.pow(1 + rate, (d[i] - d[0]) / 365);
  return s;
}
function xirr(v: number[], d: number[]): number {
  let r = 0.1;
  for (let it = 0; it < 100; it++) {
    let f = 0, df = 0;
    for (let i = 0; i < v.length; i++) {
      const tt = (d[i] - d[0]) / 365;
      const g = Math.pow(1 + r, tt);
      f += v[i] / g; df -= (tt * v[i]) / (g * (1 + r));
    }
    const nr = r - f / df;
    if (!Number.isFinite(nr)) break;
    if (Math.abs(nr - r) < 1e-12) return nr;
    r = nr <= -0.999 ? (r - 0.999) / 2 : nr;
  }
  // bisection fallback
  let lo = -0.99, hi = 10;
  const f = (x: number) => xnpv(x, v, d);
  if (f(lo) * f(hi) > 0) throw new XlError('#NUM!');
  for (let it = 0; it < 300; it++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

function criteria(c: Scalar): (x: Scalar) => boolean {
  if (typeof c === 'string') {
    const m = c.match(/^(<=|>=|<>|<|>|=)?(.*)$/)!;
    const op = m[1] ?? '=';
    const rhs: Scalar = m[2] !== '' && !Number.isNaN(Number(m[2])) ? Number(m[2]) : m[2];
    return (x) => binScalar(op, x, rhs) as boolean;
  }
  return (x) => cmp(x, c) === 0;
}

// ---------- evaluation ----------
export class Evaluator {
  private memo = new Map<string, Scalar>();
  private busy = new Set<string>();
  private ast = new Map<string, Node>();
  private names = new Map<string, Node>();
  private ranges = new Map<string, Arr>();

  constructor(private book: Book) {
    for (const [n, ref] of Object.entries(book.names)) this.names.set(n, parse(ref, ''));
  }

  cell(sheet: string, r: number, c: number): Scalar {
    const key = `${sheet}!${r}:${c}`;
    const m = this.memo.get(key);
    if (m !== undefined) return m;
    const sh = this.book.sheet(sheet);
    const cell = sh.get(r, c);
    let v: Scalar = null;
    if (cell?.f) {
      if (this.busy.has(key)) throw new XlError(`circular at ${key}`);
      this.busy.add(key);
      try {
        let node = this.ast.get(key);
        if (!node) { node = parse(cell.f, sheet); this.ast.set(key, node); }
        const x = this.eval(node);
        v = isArr(x) ? x[0][0] : x;
      } catch (e) {
        v = e instanceof XlError && e.message.startsWith('#') ? e.message : (() => { throw e; })();
      } finally {
        this.busy.delete(key);
      }
    } else if (cell) {
      v = (cell.v as Scalar) ?? null;
    }
    this.memo.set(key, v);
    return v;
  }

  private range(n: Extract<Node, { k: 'ref' }>): Val {
    if (n.r1 === n.r2 && n.c1 === n.c2) return this.cell(n.sheet, n.r1, n.c1);
    const key = `${n.sheet}!${n.r1}:${n.c1}:${n.r2}:${n.c2}`;
    const hit = this.ranges.get(key);
    if (hit) return hit;
    const out: Arr = [];
    for (let r = Math.min(n.r1, n.r2); r <= Math.max(n.r1, n.r2); r++) {
      const row: Scalar[] = [];
      for (let c = Math.min(n.c1, n.c2); c <= Math.max(n.c1, n.c2); c++) row.push(this.cell(n.sheet, r, c));
      out.push(row);
    }
    this.ranges.set(key, out);
    return out;
  }

  eval(n: Node): Val {
    switch (n.k) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'bool': return n.v;
      case 'ref': return this.range(n);
      case 'name': {
        const t = this.names.get(n.n);
        if (!t) throw new XlError(`#NAME? ${n.n}`);
        return this.eval(t);
      }
      case 'un': { const a = this.eval(n.a); return isArr(a) ? a.map((r) => r.map((x) => -num(x))) : -num(a); }
      case 'bin': {
        const a = this.eval(n.a), b = this.eval(n.b);
        for (const x of [a, b]) if (typeof x === 'string' && x.startsWith('#')) throw new XlError(x);
        return broadcast(n.op, a, b);
      }
      case 'fn': return this.fn(n.n, n.args);
    }
  }

  private fn(name: string, args: Node[]): Val {
    const ev = (i: number) => this.eval(args[i]);
    const s = (i: number) => scalar(ev(i));
    switch (name) {
      case 'IF': { const c = s(0); return num(c) !== 0 ? ev(1) : args.length > 2 ? ev(2) : false; }
      case 'AND': return args.every((_, i) => flat(ev(i)).every((x) => num(x) !== 0));
      case 'OR': return args.some((_, i) => flat(ev(i)).some((x) => num(x) !== 0));
      case 'NOT': return num(s(0)) === 0;
      case 'ISBLANK': { const v = s(0); return v === null; }
      case 'SUM': return nums(args.map((_, i) => ev(i))).reduce((a, b) => a + b, 0);
      case 'AVERAGE': { const x = nums(args.map((_, i) => ev(i))); if (!x.length) throw new XlError('#DIV/0!'); return x.reduce((a, b) => a + b, 0) / x.length; }
      case 'MIN': { const x = nums(args.map((_, i) => ev(i))); return x.length ? Math.min(...x) : 0; }
      case 'MAX': { const x = nums(args.map((_, i) => ev(i))); return x.length ? x.reduce((a, b) => (b > a ? b : a), -Infinity) : 0; }
      case 'SUMPRODUCT': {
        const arrs = args.map((_, i) => ev(i)).map((v) => (isArr(v) ? v.flat() : [v]));
        let total = 0;
        for (let k = 0; k < arrs[0].length; k++) {
          let p = 1;
          for (const a of arrs) { const x = a[k]; p *= typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : 0; }
          total += p;
        }
        return total;
      }
      case 'SUMIFS': {
        const sum = flat(ev(0));
        const tests: [Scalar[], (x: Scalar) => boolean][] = [];
        for (let i = 1; i < args.length; i += 2) tests.push([flat(ev(i)), criteria(s(i + 1))]);
        let total = 0;
        for (let k = 0; k < sum.length; k++) if (tests.every(([r, f]) => f(r[k]))) total += typeof sum[k] === 'number' ? (sum[k] as number) : 0;
        return total;
      }
      case 'INDEX': {
        const a = ev(0);
        const arr: Arr = isArr(a) ? a : [[a]];
        const r = num(s(1));
        if (args.length < 3) return arr.length === 1 ? arr[0][r - 1] : arr[r - 1][0];
        return arr[r - 1][num(s(2)) - 1];
      }
      case 'MATCH': {
        const v = s(0), arr = flat(ev(1)), type = args.length > 2 ? num(s(2)) : 1;
        if (type === 0) { const i = arr.findIndex((x) => cmp(x, v) === 0); if (i < 0) throw new XlError('#N/A'); return i + 1; }
        let pos = -1;
        for (let i = 0; i < arr.length; i++) { if (arr[i] !== null && cmp(arr[i], v) <= 0) pos = i; else if (arr[i] !== null) break; }
        if (pos < 0) throw new XlError('#N/A');
        return pos + 1;
      }
      case 'MOD': { const a = num(s(0)), b = num(s(1)); return a - b * Math.floor(a / b); }
      case 'INT': return Math.floor(num(s(0)));
      case 'ROUNDUP': { const f = Math.pow(10, num(s(1))); const x = num(s(0)) * f; return (x >= 0 ? Math.ceil(x - 1e-12) : Math.floor(x + 1e-12)) / f; }
      case 'DATE': return serial(num(s(0)), num(s(1)), num(s(2)));
      case 'EOMONTH': { const d = fromSerial(num(s(0))); const m = d.getUTCMonth() + num(s(1)); return serial(d.getUTCFullYear(), m + 2, 0); }
      case 'YEAR': return fromSerial(num(s(0))).getUTCFullYear();
      case 'MONTH': return fromSerial(num(s(0))).getUTCMonth() + 1;
      case 'XNPV': return xnpv(num(s(0)), flat(ev(1)).map((x) => num(x)), flat(ev(2)).map((x) => num(x)));
      case 'XIRR': return xirr(flat(ev(0)).map((x) => num(x)), flat(ev(1)).map((x) => num(x)));
    }
    throw new XlError(`#NAME? ${name}`);
  }

  /** Evaluates every formula; `order` lets callers evaluate long chains (timeline columns) first to keep recursion shallow. */
  run(order?: (book: Book) => [string, number, number][]): void {
    const cells = order ? order(this.book) : [];
    for (const [sh, r, c] of cells) this.cell(sh, r, c);
    for (const sh of this.book.sheets) for (const [r, c] of sh.coords()) if (sh.get(r, c)?.f) this.cell(sh.name, r, c);
  }

  value(sheet: string, r: number, c: number): CellValue { return this.cell(sheet, r, c); }
}
