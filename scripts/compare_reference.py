"""Builds the reference workbook for each case, recalculates it in LibreOffice and compares with the engine.
Usage: python3 -I compare_reference.py <cases_dir> <data_dir> <recalc.py>"""
import json, os, subprocess, sys
import openpyxl
cases, data, recalc = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))
KEYS = ['capexExVat', 'debt', 'equity', 'idc', 'fee', 'vatPaid', 'annualGeneration', 'capturePrice', 'projectIrr', 'equityIrr', 'npvProject',
        'ebitdaAvg5', 'ebitdaToCapex', 'npToEquity', 'paybackProjectYears', 'paybackEquityYears', 'lcoe', 'dscrMin', 'dscrAvg', 'llcr', 'grant']
ANN = [('Генерація, МВт·год', 'generation'), ('EBITDA', 'ebitda'), ('Чистий прибуток', 'netProfit'), ('Дивіденди', 'dividends'), ('Кредит', 'debt'), ('Гроші', 'cash')]
worst = 0.0
report = []
for case in ['base', 'grant', 'S1', 'S2', 'S3', 'S4']:
    out = os.path.join(cases, f'{case}.xlsx')
    subprocess.run([sys.executable, '-I', os.path.join(here, 'build_reference_xlsx.py'), os.path.join(cases, f'{case}.assumptions.json'),
                    os.path.join(data, 'wind_profile.json'), os.path.join(data, 'dam_price_shape.json'), out], check=True, capture_output=True)
    res = json.loads(subprocess.run([sys.executable, recalc, out, '240'], capture_output=True, text=True).stdout)
    assert res.get('status') == 'success', res
    wb = openpyxl.load_workbook(out, data_only=True)
    k = wb['KPI']
    x = {k.cell(row=r, column=1).value: k.cell(row=r, column=3).value for r in range(4, 29)}
    e = json.load(open(os.path.join(cases, f'{case}.engine.json')))
    case_worst = 0.0
    for key in KEYS:
        xv, ev = x[key], e['kpis'][key]
        d = 0.0 if ev == 0 and abs(xv) < 1e-6 else abs(xv / ev - 1)
        case_worst = max(case_worst, d)
        if d > 1e-3:
            report.append(f'{case} {key}: xlsx {xv} engine {ev} diff {d:.2e}')
    a = wb['Annual']
    labels = {a.cell(row=r, column=1).value: r for r in range(4, a.max_row + 1)}
    for lab, key in ANN:
        rr = labels[lab]
        for j, row in enumerate(e['annual']):
            xv, ev = a.cell(row=rr, column=2 + j).value or 0, row[key]
            d = abs(xv - ev) / max(1.0, abs(ev))
            case_worst = max(case_worst, d)
            if d > 1e-3:
                report.append(f'{case} {row["year"]} {key}: xlsx {xv} engine {ev}')
    worst = max(worst, case_worst)
    print(f'{case:6} formulas={res["total_formulas"]} errors={res["total_errors"]} max rel diff={case_worst:.2e} '
          f'balance max={x["balanceMax"]:.2e} debt end={x["debtEnd"]:.2e} equity IRR={x["equityIrr"]:.4%} project IRR={x["projectIrr"]:.4%}')
print('\n'.join(report[:40]) or 'all within 0.1%')
print('WORST', f'{worst:.2e}')
