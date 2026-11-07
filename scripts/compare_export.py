"""Recalculates the browser exports in LibreOffice and compares: LibreOffice vs cached values vs engine KPIs.
Usage: python3 -I compare_export.py <dir> <recalc.py>"""
import json, os, shutil, subprocess, sys
import openpyxl
d, recalc = sys.argv[1:3]
worst = 0.0
for name in ['base', 'S4', 'grant', 'half', 'manual']:
    src = os.path.join(d, f'{name}.xlsx')
    cached = openpyxl.load_workbook(src, data_only=True)['KPI']
    lo = os.path.join(d, f'{name}.lo.xlsx'); shutil.copy(src, lo)
    res = json.loads(subprocess.run([sys.executable, recalc, lo, '240'], capture_output=True, text=True).stdout)
    k = openpyxl.load_workbook(lo, data_only=True)['KPI']
    e = json.load(open(os.path.join(d, f'{name}.engine.json')))
    cw = 0.0
    for r in range(4, 29):
        code = k.cell(row=r, column=1).value
        if code not in e: continue
        x, c, ev = k.cell(row=r, column=3).value, cached.cell(row=r, column=3).value, e[code]
        for v in (x, c):
            dd = abs(v) if ev == 0 else abs(v / ev - 1)
            cw = max(cw, dd)
            if dd > 1e-6: print('DIFF', name, code, 'lo', x, 'cached', c, 'engine', ev)
    worst = max(worst, cw)
    print(f'{name:7} formulas={res.get("total_formulas")} errors={res.get("total_errors")} max rel diff={cw:.2e}')
print('WORST', f'{worst:.2e}')
