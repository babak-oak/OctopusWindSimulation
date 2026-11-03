"""Build 12x24 DAM price shape (EUR/MWh) from OREE monthly xls files and NBU daily EUR rates.
Usage: python3 -I build_price_shape.py <oree_dir> <nbu.json> <out.json>
Hour h (1..24) = clock hour (h-1):00-h:00 Kyiv time. DST: 25-hour day -> hours 4 and 5 averaged; 23-hour day -> missing hour skipped."""
import sys, json, glob, os, datetime
import xlrd
src, nbu_path, out = sys.argv[1:4]
rates = {r['exchangedate']: r['rate'] for r in json.load(open(nbu_path))}
acc = {}  # (month 1..12) -> list of 24 lists
meta = []
for f in sorted(glob.glob(os.path.join(src, 'dam_*.xls'))):
    mm, yy = os.path.basename(f)[4:-4].split('.')
    mm, yy = int(mm), int(yy)
    s = xlrd.open_workbook(f, ignore_workbook_corruption=True).sheet_by_index(0)
    ncols = s.ncols
    days = 0
    for r in range(3, s.nrows):
        d = s.cell_value(r, 0)
        if d == '' : continue
        d = int(d); days += 1
        vals = [s.cell_value(r, c) for c in range(1, ncols)]
        vals = [v for v in vals]
        if len(vals) >= 25 and vals[24] != '':  # 25-hour day (DST end)
            v = vals[:25]
            vals = v[:3] + [(v[3] + v[4]) / 2] + v[5:25]
        vals = vals[:24]
        key = f"{d:02d}.{mm:02d}.{yy}"
        fx = rates[key]
        b = acc.setdefault(mm, [[] for _ in range(24)])
        for h, v in enumerate(vals):
            if v == '' or v is None: continue
            b[h].append(float(v) / fx)
    meta.append({'month': f'{yy}-{mm:02d}', 'days': days})
avg = {m: [sum(x) / len(x) for x in acc[m]] for m in acc}
# baseload average weighted by hours present
tot = sum(sum(x) for m in acc for x in acc[m]); n = sum(len(x) for m in acc for x in acc[m])
base = tot / n
shape = [[avg[m][h] / base for h in range(24)] for m in range(1, 13)]
json.dump({'source': 'OREE DAM IPS hourly prices, NBU daily EUR/UAH', 'period': [meta[0]['month'], meta[-1]['month']],
           'months': meta, 'baseload_eur_mwh': base,
           'avg_eur_mwh': [[round(avg[m][h], 4) for h in range(24)] for m in range(1, 13)],
           'shape': [[round(v, 6) for v in row] for row in shape]}, open(out, 'w'), ensure_ascii=False, indent=1)
print('baseload EUR/MWh', round(base, 2), 'hours', n)
