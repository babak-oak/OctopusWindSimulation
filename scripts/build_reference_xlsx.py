"""Corrected reference model (ТЗ, розділ 11): an independent Excel implementation of the engine logic.
Usage: python3 -I build_reference_xlsx.py <default_assumptions.json> <wind_profile.json> <dam_price_shape.json> <out.xlsx>
Every number on 'Inputs' is an input (blue); every other number is a formula."""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.workbook.properties import CalcProperties
from openpyxl.comments import Comment

A = json.load(open(sys.argv[1]))
W = json.load(open(sys.argv[2]))
P = json.load(open(sys.argv[3]))
OUT = sys.argv[4]

F = 'Arial'
f_in = Font(name=F, color='0000FF')
f_link = Font(name=F, color='008000')
f_norm = Font(name=F)
f_bold = Font(name=F, bold=True)
f_head = Font(name=F, bold=True, color='FFFFFF')
fill_head = PatternFill('solid', fgColor='0B2433')
fill_key = PatternFill('solid', fgColor='FFFF00')
NUM = '#,##0;(#,##0);"-"'
NUM2 = '#,##0.00;(#,##0.00);"-"'
PCT = '0.0%;(0.0%);"-"'
PCT2 = '0.00%;(0.00%);"-"'

wb = Workbook()
wb.calculation = CalcProperties(fullCalcOnLoad=True)

def name(n, ref):
    wb.defined_names[n] = DefinedName(n, attr_text=ref)

def header(ws, row, cols):
    for c, v in enumerate(cols, 1):
        cell = ws.cell(row=row, column=c, value=v)
        cell.font = f_head
        cell.fill = fill_head

# ---------------- Inputs ----------------
wi = wb.active
wi.title = 'Inputs'
wi['A1'] = 'Octopus Wind Simulation — виправлений еталон (ТЗ, розділ 11)'
wi['A1'].font = Font(name=F, bold=True, size=13)
wi['A2'] = 'Сині комірки — вхідні дані; жовті — ключові припущення. Усі інші аркуші — лише формули. EUR без ПДВ, ціни 2026 р. Сума кредиту залежить від капіталізованих відсотків і комісії: її рахує аркуш Funding послідовними проходами, без циклічних посилань.'
wi['A2'].font = f_norm
header(wi, 4, ['Код', 'Параметр', 'Значення', 'Одиниця', 'Джерело'])
p, g, m, o, fi, s, cp, st = A['project'], A['generation'], A['market'], A['opex'], A['finance'], A['schedule'], A['compensation'], A['stress']
rows = [
    ('Проєкт',),
    ('i_turbines', 'Кількість ВЕУ', p['turbines'], 'шт.', 'Input!K26'),
    ('i_turbineMW', 'Потужність ВЕУ', p['turbineMW'], 'МВт', 'Input!K24'),
    ('i_gridMW', 'Проєктна потужність при еталонному компонуванні', p['gridMW'], 'МВт', 'Пропозиція SANY, C16; масштабується з встановленою потужністю'),
    ('i_gridMan', 'Проєктна потужність вручну (порожньо = авто)', p.get('manualGridMW'), 'МВт', 'Перевизначення користувача'),
    ('i_refT', 'Еталонне компонування: кількість ВЕУ', p['reference']['turbines'], 'шт.', 'Для масштабування доріг, кабелів, підстанції'),
    ('i_refMW', 'Еталонне компонування: потужність ВЕУ', p['reference']['turbineMW'], 'МВт', 'Для масштабування підстанції'),
    ('i_start', 'Початок будівництва (місяць 1)', '2027-03-01', 'дата', 'Рішення 03.11.2026'),
    ('i_C', 'Тривалість будівництва', p['constructionMonths'], 'міс.', 'Рішення 03.11.2026'),
    ('i_life', 'Строк експлуатації', p['lifeYears'], 'років', 'Рішення 03.11.2026'),
    ('Генерація',),
    ('i_aep', 'Net AEP P50 при еталонному компонуванні (лише затінення 5.5%)', g['netAEP_MWh'], 'МВт·год/рік', 'Пропозиція SANY: просчет Сани для Степана_1.xlsx, C20–C22; масштабується з встановленою потужністю'),
    ('i_aepMan', 'Net AEP вручну (порожньо = авто)', g.get('manualAEP'), 'МВт·год/рік', 'Перевизначення користувача'),
    ('i_aepIncl', 'Net AEP містить доступність і техвтрати (1 = так)', 1 if g['aepIncludesLosses'] else 0, '0/1', 'Рішення 03.11.2026'),
    ('i_avail', 'Доступність', g['availability'], '%', 'Рішення 03.11.2026'),
    ('i_loss', 'Технологічні втрати', g['techLosses'], '%', 'Input!K25'),
    ('Ціна і продаж',),
    ('i_price', 'Середня ціна РДН за всі години, 2026', m['basePrice'], '€/МВт·год', '98 $ за курсом ЄЦБ 1.1188 (26.10.2026); рішення 02.11'),
    ('i_priceIdx', 'Індексація ціни', m['priceIndexation'], '%/рік', 'Рішення 03.11.2026: індексується лише OPEX'),
    ('i_trader', 'Комісія трейдера (вкл. балансуючу групу і небаланси)', m['traderFee'], '% доходу', 'Input!K32; рішення 03.11'),
    ('i_imb', 'Небаланси окремо', m['imbalance'], '% доходу', 'Рішення 03.11: входять у комісію'),
    ('OPEX (ціни 2026 р.)',),
    ('i_om', 'Ремонт і сервіс', o['omPerMW'], '€/МВт/рік', 'Input!K38'),
    ('i_pit', 'ПДФО', o['payroll']['pit'], '%', 'ПКУ'),
    ('i_mil', 'Військовий збір', o['payroll']['military'], '%', 'ПКУ'),
    ('i_esv', 'ЄСВ', o['payroll']['esv'], '%', 'Закон про ЄСВ'),
    ('i_ins', 'Страхування', o['insurancePctCapex'], '% CAPEX', 'Input!K37'),
    ('i_rent', 'Оренда землі', o['rentPerHa'], '€/га/рік', 'Input!K36'),
    ('i_ha', 'Площа землі при еталонному компонуванні', o['landHa'], 'га', 'Input!K17; масштабується з кількістю ВЕУ'),
    ('i_haMan', 'Площа землі вручну (порожньо = авто)', o.get('manualLandHa'), 'га', 'Перевизначення користувача'),
    ('i_disp', 'Диспетчеризація Укренерго', o['dispatchUAHperMWh'], 'грн/МВт·год', 'НКРЕКП, з 01.07.2026'),
    ('i_moVar', 'Оператор ринку, змінна', o['marketOpVarUAHperMWh'], 'грн/МВт·год', 'НКРЕКП № 2167 від 19.12.2025'),
    ('i_moFix', 'Оператор ринку, постійна', o['marketOpFixUAHperMonth'], 'грн/міс.', 'НКРЕКП № 2167 від 19.12.2025'),
    ('i_nkrekp', 'Плата за регулювання НКРЕКП', o['nkrekpPctRevenue'], '% доходу', 'Input!K41'),
    ('i_other', 'Інші витрати', o['otherPctRevenue'], '% доходу', 'Input!K43'),
    ('i_admin', 'Адміністративні', o['adminPerMonth'], '€/міс.', 'Input!K44'),
    ('i_idx', 'Індексація OPEX', o['indexation'], '%/рік', 'Рішення 03.11.2026'),
    ('i_baseYear', 'Базовий рік цін', o['baseYear'], 'рік', 'Ціни 2026 р.'),
    ('i_fx', 'Курс', A['fx']['uahPerEur'], 'грн/€', 'НБУ на 03.11.2026'),
    ('CAPEX і графік',),
    ('i_cont', 'Непередбачувані', A['capex']['contingencyPct'], '% CAPEX', 'Input!M14'),
    ('i_tp1m', 'ВЕУ: місяць 1-го платежу', s['turbinePayments'][0]['month'], 'міс.', 'Рішення 03.11.2026'),
    ('i_tp1', 'ВЕУ: 1-й платіж', s['turbinePayments'][0]['pct'], '%', 'Рішення 03.11.2026'),
    ('i_tp2m', 'ВЕУ: місяць 2-го платежу', s['turbinePayments'][1]['month'], 'міс.', 'Рішення 03.11.2026'),
    ('i_tp2', 'ВЕУ: 2-й платіж', s['turbinePayments'][1]['pct'], '%', 'Рішення 03.11.2026'),
    ('i_port', 'ВЕУ: платіж при прибутті в порт', s['portPct'], '%', 'Рішення 03.11.2026'),
    ('i_arr', 'Перше прибуття в порт', s['firstArrivalMonth'], 'міс.', 'Рішення 03.11.2026'),
    ('i_perM', 'Прибуває ВЕУ на місяць', s['turbinesPerMonth'], 'шт.', 'Рішення 03.11.2026'),
    ('i_wPct', 'Роботи: частка в першому періоді', s['worksFirstPct'], '%', 'Рішення 03.11.2026'),
    ('i_wEnd', 'Роботи: кінець першого періоду', s['worksFirstEndMonth'], 'міс.', 'Рішення 03.11.2026'),
    ('i_mSt', 'Монтаж ВЕУ: початок', s['montageStartMonth'], 'міс.', 'Рішення 03.11.2026'),
    ('i_devM', 'Девелопмент: місяць оплати', s['devMonth'], 'міс.', 'Рішення 03.11.2026'),
    ('Фінансування і податки',),
    ('i_dShare', 'Частка боргу', fi['debtShare'], '%', 'Рішення 03.11.2026'),
    ('i_rate', 'Ставка', fi['rate'], '%/рік', 'Рішення 03.11.2026'),
    ('i_tenor', 'Строк погашення після введення', fi['tenorYears'], 'років', 'Рішення 03.11.2026'),
    ('i_feePct', 'Комісія (додається до тіла)', fi['feePct'], '% кредиту', 'Рішення 03.11.2026'),
    ('i_every', 'Періодичність платежів', fi['repayEveryMonths'], 'міс.', 'Рішення 03.11.2026: щокварталу'),
    ('i_ke', 'Вартість капіталу', fi['costOfEquity'], '%', 'Рішення 03.11.2026'),
    ('i_tax', 'Податок на прибуток', fi['taxRate'], '%', 'Input!K49'),
    ('i_dep', 'Амортизація', fi['depreciationYears'], 'років', 'Рішення 03.11.2026'),
    ('i_vat', 'ПДВ', fi['vatRate'], '%', 'ПКУ'),
    ('Компенсація 15%',),
    ('i_gOn', 'Компенсація увімкнена (1 = так)', 1 if cp['enabled'] else 0, '0/1', 'Опція'),
    ('i_gPct', 'Розмір компенсації', cp['pct'], '% CAPEX', 'Постанова КМУ; рішення 03.11: база — весь CAPEX'),
    ('i_gDelay', 'Надходження після введення', cp['delayMonths'], 'міс.', 'Рішення 03.11.2026'),
    ('Стрес-тести',),
    ('i_cOn', 'Обмеження Укренерго увімкнене (1 = так)', 1 if st['curtailment']['enabled'] else 0, '0/1', 'S1'),
    ('i_cM1', 'Обмеження: перший місяць', min(st['curtailment']['months']), 'міс.', 'Червень'),
    ('i_cM2', 'Обмеження: останній місяць', max(st['curtailment']['months']), 'міс.', 'Серпень'),
    ('i_cH1', 'Обмеження: перша година профілю', min(st['curtailment']['hours']), 'год', '11:00–12:00'),
    ('i_cH2', 'Обмеження: остання година профілю', max(st['curtailment']['hours']), 'год', '14:00–15:00'),
    ('i_cCut', 'Обмеження: частка генерації', st['curtailment']['cut'], '%', 'S1'),
    ('i_capexMult', 'Множник CAPEX', st['capexMult'], '×', 'S2: 1.1'),
    ('i_priceMult', 'Множник ціни', st['priceMult'], '×', 'S3: 0.8'),
    ('i_opexMult', 'Множник OPEX', st['opexMult'], '×', 'Реєстр ризиків'),
]
r = 5
pct_names = {'i_pit', 'i_mil', 'i_esv', 'i_avail', 'i_loss', 'i_priceIdx', 'i_trader', 'i_imb', 'i_ins', 'i_nkrekp', 'i_other', 'i_idx', 'i_cont', 'i_tp1', 'i_tp2', 'i_port', 'i_wPct', 'i_dShare', 'i_rate', 'i_feePct', 'i_ke', 'i_tax', 'i_vat', 'i_gPct', 'i_cCut'}
key_names = {'i_aep', 'i_price', 'i_dShare', 'i_rate'}
for row in rows:
    if len(row) == 1:
        wi.cell(row=r, column=1, value=row[0]).font = f_bold
        r += 1
        continue
    n, label, v, unit, src = row
    wi.cell(row=r, column=1, value=n).font = f_norm
    wi.cell(row=r, column=2, value=label).font = f_norm
    if n == 'i_start':
        c = wi.cell(row=r, column=3, value='=DATE(2027,3,1)')
        c.number_format = 'dd.mm.yyyy'
    else:
        c = wi.cell(row=r, column=3, value=v)
        c.number_format = PCT2 if n in pct_names else ('#,##0.####' if isinstance(v, float) else '#,##0')
    c.font = f_in
    if n in key_names:
        c.fill = fill_key
    wi.cell(row=r, column=4, value=unit).font = f_norm
    wi.cell(row=r, column=5, value=src).font = f_norm
    name(n, f"Inputs!$C${r}")
    r += 1
# derived
r += 1
wi.cell(row=r, column=1, value='Похідні').font = f_bold
r += 1
derived = [
    ('d_kw', 'Потужність', '=i_turbines*i_turbineMW*1000', 'кВт', NUM),
    ('d_L', 'Місяців експлуатації', '=i_life*12', 'міс.', NUM),
    ('d_T', 'Місяців у моделі', '=i_C+d_L', 'міс.', NUM),
    ('d_mwF', 'Масштаб: встановлена потужність / еталон', '=d_kw/(i_refT*i_refMW*1000)', '×', '0.0000'),
    ('d_tF', 'Масштаб: кількість ВЕУ / еталон', '=i_turbines/i_refT', '×', '0.0000'),
    ('d_aep', 'Net AEP у розрахунку', '=IF(ISBLANK(i_aepMan),i_aep*d_mwF,i_aepMan)', 'МВт·год/рік', NUM),
    ('d_grid', 'Проєктна потужність у розрахунку', '=IF(ISBLANK(i_gridMan),i_gridMW*d_mwF,i_gridMan)', 'МВт', NUM2),
    ('d_ha', 'Площа землі у розрахунку', '=IF(ISBLANK(i_haMan),i_ha*d_tF,i_haMan)', 'га', NUM2),
    ('d_staff', 'Персонал, € на рік', '=SUM(Staff!H3:H20)', '€/рік', NUM),
    ('d_E', 'Річна генерація', '=IF(i_aepIncl=1,d_aep,d_aep*i_avail*(1-i_loss))', 'МВт·год/рік', NUM),
    ('d_P', 'Ціна з урахуванням стресу', '=i_price*i_priceMult', '€/МВт·год', NUM2),
    ('d_nRep', 'Кількість платежів тіла', '=i_tenor*12/i_every', 'шт.', NUM),
    ('d_wacc', 'WACC після податків', '=(1-i_dShare)*i_ke+i_dShare*i_rate*(1-i_tax)', '%', PCT2),
]
for n, label, fml, unit, fmt in derived:
    wi.cell(row=r, column=1, value=n).font = f_norm
    wi.cell(row=r, column=2, value=label).font = f_norm
    c = wi.cell(row=r, column=3, value=fml)
    c.font = f_norm
    c.number_format = fmt
    wi.cell(row=r, column=4, value=unit).font = f_norm
    name(n, f"Inputs!$C${r}")
    r += 1
wi.column_dimensions['A'].width = 12
wi.column_dimensions['B'].width = 52
wi.column_dimensions['C'].width = 16
wi.column_dimensions['D'].width = 14
wi.column_dimensions['E'].width = 58

# ---------------- Staff ----------------
wsf = wb.create_sheet('Staff')
header(wsf, 2, ['ID', 'Посада', 'Чиста ЗП, €/міс.', 'Осіб', 'На кожні N ВЕУ (порожньо = фіксовано)', 'Вручну, осіб', 'Чисельність', 'Витрати, €/рік'])
wsf['A1'] = 'Персонал: чисельність = осіб × ROUNDUP(ВЕУ / N), або фіксована; вартість = чиста ЗП / (1 − ПДФО − ВЗ) × (1 + ЄСВ)'
wsf['A1'].font = f_bold
for j, role in enumerate(o['staffRoles']):
    rr = 3 + j
    for c, v in enumerate([role['id'], role['nameUk'], role['netMonthly'], role['count'], role.get('per'), role.get('manualCount')], 1):
        cell = wsf.cell(row=rr, column=c, value=v)
        cell.font = f_in if c >= 3 else f_norm
    wsf.cell(row=rr, column=7, value=f'=IF(ISBLANK(F{rr}),IF(ISBLANK(E{rr}),D{rr},D{rr}*ROUNDUP(i_turbines/E{rr},0)),F{rr})').number_format = '0'
    wsf.cell(row=rr, column=8, value=f'=G{rr}*C{rr}/(1-i_pit-i_mil)*(1+i_esv)*12').number_format = NUM
wsf.column_dimensions['B'].width = 34
wsf.column_dimensions['E'].width = 22

# ---------------- Profiles ----------------
wp = wb.create_sheet('Profiles')
wp['A1'] = 'Профілі 12 × 24: година h = (h−1):00–h:00 за Києвом'
wp['A1'].font = f_bold
blocks = [('Частки генерації (\'Wind Profile\'!C20:Z31)', 3, W['shares'], True),
          (f"Коефіцієнт форми ціни РДН (ОРЕЕ, {P['period'][0]}–{P['period'][1]}; середнє = 1)", 18, P['shape'], True)]
for title, top, mat, is_in in blocks:
    wp.cell(row=top, column=1, value=title).font = f_bold
    for h in range(24):
        wp.cell(row=top + 1, column=2 + h, value=h + 1).font = f_bold
    for mi in range(12):
        wp.cell(row=top + 2 + mi, column=1, value=mi + 1).font = f_bold
        for h in range(24):
            c = wp.cell(row=top + 2 + mi, column=2 + h, value=mat[mi][h])
            c.font = f_in
            c.number_format = '0.000000'
# curtailment cut matrix
top = 33
wp.cell(row=top, column=1, value='Частка втраченої генерації (стрес S1)').font = f_bold
for h in range(24):
    wp.cell(row=top + 1, column=2 + h, value=h + 1).font = f_bold
for mi in range(12):
    rr = top + 2 + mi
    wp.cell(row=rr, column=1, value=mi + 1).font = f_bold
    for h in range(24):
        col = CL(2 + h)
        wp.cell(row=rr, column=2 + h, value=f'=IF(AND(i_cOn=1,$A{rr}>=i_cM1,$A{rr}<=i_cM2,{col}$34>=i_cH1,{col}$34<=i_cH2),i_cCut,0)').number_format = '0.00'
# monthly factors
top2 = 48
wp.cell(row=top2, column=1, value='Місячні коефіцієнти').font = f_bold
for c, v in enumerate(['Місяць', 'Частка генерації', 'Дохід / (E × ціна)', 'Частка без стресу', 'Capture без стресу'], 1):
    wp.cell(row=top2 + 1, column=c, value=v).font = f_bold
for mi in range(12):
    rr = top2 + 2 + mi
    sr, pr, cr = 5 + mi, 20 + mi, 35 + mi
    wp.cell(row=rr, column=1, value=mi + 1)
    wp.cell(row=rr, column=2, value=f'=SUMPRODUCT(B{sr}:Y{sr},1-B{cr}:Y{cr})').number_format = '0.000000'
    wp.cell(row=rr, column=3, value=f'=SUMPRODUCT(B{sr}:Y{sr},1-B{cr}:Y{cr},B{pr}:Y{pr})').number_format = '0.000000'
    wp.cell(row=rr, column=4, value=f'=SUM(B{sr}:Y{sr})').number_format = '0.000000'
    wp.cell(row=rr, column=5, value=f'=SUMPRODUCT(B{sr}:Y{sr},B{pr}:Y{pr})').number_format = '0.000000'
name('p_gen', f'Profiles!$B${top2+2}:$B${top2+13}')
name('p_rev', f'Profiles!$C${top2+2}:$C${top2+13}')
wp.cell(row=top2 + 15, column=1, value='Capture price без стресу, €/МВт·год').font = f_bold
wp.cell(row=top2 + 15, column=3, value=f'=d_P*SUM(E{top2+2}:E{top2+13})/SUM(D{top2+2}:D{top2+13})').number_format = NUM2
name('p_capture', f'Profiles!$C${top2+15}')

# ---------------- CAPEX ----------------
wc = wb.create_sheet('Capex')
wc['A1'] = 'CAPEX за статтями і місяцями будівництва, EUR без ПДВ'
wc['A1'].font = f_bold
C = A['project']['constructionMonths']
header(wc, 3, ['ID', 'Стаття', 'Кількість', 'Ставка', 'Валюта', 'ПДВ (1/0)', 'Графік', 'Сума, €', 'ПДВ, €', 'Джерело'] + [f'М{k}' for k in range(1, C + 1)])
MC = 11  # first month column (K)
items = A['capex']['items']
first = 4
for j, it in enumerate(items):
    rr = first + j
    basis = it.get('qtyBasis')
    sc = it.get('scale')
    if basis == 'installedKW':
        qty = '=d_kw'
    elif basis == 'gridKW':
        qty = '=d_grid*1000'
    elif it.get('manualQty') is not None:
        qty = it['manualQty']
    elif sc == 'turbines':
        qty = f"={it['qty']}*i_turbines/i_refT"
    elif sc == 'installedMW':
        qty = f"={it['qty']}*d_kw/(i_refT*i_refMW*1000)"
    else:
        qty = it['qty']
    basis = basis or (sc if it.get('manualQty') is None else None)
    vals = [it['id'], it['nameUk'], qty, it['rate'], it['currency'], 1 if it['vat'] else 0, it['schedule']]
    for c, v in enumerate(vals, 1):
        cell = wc.cell(row=rr, column=c, value=v)
        cell.font = f_in if c in (4, 5, 6, 7) or (c == 3 and not basis) else f_norm
        if c == 3:
            cell.number_format = NUM
    wc.cell(row=rr, column=8, value=f'=C{rr}*D{rr}/IF(E{rr}="UAH",i_fx,1)*i_capexMult').number_format = NUM
    wc.cell(row=rr, column=9, value=f'=H{rr}*F{rr}*i_vat').number_format = NUM
    wc.cell(row=rr, column=10, value=it['source']).font = f_norm
last_item = first + len(items) - 1
rc = last_item + 1
wc.cell(row=rc, column=1, value='contingency')
wc.cell(row=rc, column=2, value='Непередбачувані')
wc.cell(row=rc, column=6, value=1).font = f_in
wc.cell(row=rc, column=7, value='works').font = f_in
wc.cell(row=rc, column=8, value=f'=SUM(H{first}:H{last_item})*i_cont').number_format = NUM
wc.cell(row=rc, column=9, value=f'=H{rc}*F{rc}*i_vat').number_format = NUM
wc.cell(row=rc, column=10, value='Input!M14')
rt = rc + 1
wc.cell(row=rt, column=2, value='Разом').font = f_bold
wc.cell(row=rt, column=8, value=f'=SUM(H{first}:H{rc})').number_format = NUM
wc.cell(row=rt, column=9, value=f'=SUM(I{first}:I{rc})').number_format = NUM
name('c_total', f'Capex!$H${rt}')
# weights
rw = rt + 3
wc.cell(row=rw - 1, column=2, value='Графік оплати, частка суми').font = f_bold
sched = ['turbine', 'works', 'montage', 'dev']
for j, sname in enumerate(sched):
    rr = rw + j
    wc.cell(row=rr, column=7, value=sname)
    for k in range(1, C + 1):
        col = MC + k - 1
        kc = f'{CL(col)}$3'
        kk = k  # month number
        if sname == 'turbine':
            fml = (f'=IF({kk}=i_tp1m,i_tp1,0)+IF({kk}=i_tp2m,i_tp2,0)'
                   f'+IF({kk}<i_arr,0,i_port*MAX(0,MIN(i_perM,i_turbines-({kk}-i_arr)*i_perM))/i_turbines)')
        elif sname == 'works':
            fml = f'=IF({kk}<=i_wEnd,i_wPct/i_wEnd,(1-i_wPct)/(i_C-i_wEnd))'
        elif sname == 'montage':
            fml = f'=IF({kk}>=i_mSt,1/(i_C-i_mSt+1),0)'
        else:
            fml = f'=IF({kk}=i_devM,1,0)'
        wc.cell(row=rr, column=col, value=fml).number_format = '0.0000'
    wc.cell(row=rr, column=8, value=f'=SUM({CL(MC)}{rr}:{CL(MC+C-1)}{rr})').number_format = '0.0000'
wfirst, wlast = rw, rw + 3
# spend per item per month (rows aligned with items)
for j in range(len(items) + 1):
    rr = first + j
    for k in range(1, C + 1):
        col = MC + k - 1
        wc.cell(row=rr, column=col, value=f'=$H{rr}*INDEX({CL(col)}${wfirst}:{CL(col)}${wlast},MATCH($G{rr},$G${wfirst}:$G${wlast},0))').number_format = NUM
for k in range(1, C + 1):
    col = MC + k - 1
    wc.cell(row=rt, column=col, value=f'=SUM({CL(col)}{first}:{CL(col)}{rc})').number_format = NUM
rv = wlast + 2
wc.cell(row=rv, column=2, value='ПДВ за місяцями').font = f_bold
for k in range(1, C + 1):
    col = MC + k - 1
    wc.cell(row=rv, column=col, value=f'=SUMPRODUCT({CL(col)}{first}:{CL(col)}{rc},$F${first}:$F${rc})*i_vat').number_format = NUM
rd = rv + 1
wc.cell(row=rd, column=2, value='Девелопмент з ПДВ (фінансується капіталом)').font = f_bold
wc.cell(row=rd, column=8, value=f'=SUMPRODUCT(($G${first}:$G${rc}="dev")*$H${first}:$H${rc}*(1+$F${first}:$F${rc}*i_vat))').number_format = NUM
name('c_dev', f'Capex!$H${rd}')
name('c_month', f'Capex!${CL(MC)}${rt}:${CL(MC+C-1)}${rt}')
name('c_vat', f'Capex!${CL(MC)}${rv}:${CL(MC+C-1)}${rv}')
wc.column_dimensions['B'].width = 34
wc.column_dimensions['J'].width = 26
for col in range(3, MC + C):
    wc.column_dimensions[CL(col)].width = 12

# ---------------- Funding: construction financing by explicit passes (no circular references) ----------------
wf = wb.create_sheet('Funding')
wf['A1'] = ('Фінансування будівництва послідовними наближеннями: кожен прохід бере суму кредиту з попереднього. '
            'Похибка падає приблизно в 20 разів за прохід; 8 проходів дають збіжність до центів.')
wf['A1'].font = f_bold
NP = 8
for k in range(1, C + 1):
    wf.cell(row=3, column=3 + k, value=k).font = f_bold
wf.cell(row=3, column=1, value='Місяць будівництва').font = f_bold
wf.cell(row=4, column=1, value='CAPEX без ПДВ')
wf.cell(row=5, column=1, value='ПДВ')
wf.cell(row=6, column=1, value='Девелопмент з ПДВ (капітал)')
for k in range(1, C + 1):
    col = CL(3 + k)
    wf.cell(row=4, column=3 + k, value=f'=INDEX(c_month,1,{col}$3)').number_format = NUM
    wf.cell(row=5, column=3 + k, value=f'=INDEX(c_vat,1,{col}$3)').number_format = NUM
    wf.cell(row=6, column=3 + k, value=f'=IF({col}$3=i_devM,c_dev,0)').number_format = NUM
# pass 0 scalars in column B
wf.cell(row=8, column=1, value='Прохід 0: потреба без відсотків і комісії').font = f_bold
wf.cell(row=9, column=1, value='F (потреба)'); wf.cell(row=9, column=2, value=f'=SUM(D4:{CL(3+C)}5)').number_format = NUM
wf.cell(row=10, column=1, value='D (кредит)'); wf.cell(row=10, column=2, value='=i_dShare*B9').number_format = NUM
wf.cell(row=11, column=1, value='d (частка кредиту без девелопменту)'); wf.cell(row=11, column=2, value='=B10/(B9-c_dev)').number_format = '0.000000'
prevF, prevD, prevd = 'B9', 'B10', 'B11'
row = 13
for pnum in range(1, NP + 1):
    wf.cell(row=row, column=1, value=f'Прохід {pnum}').font = f_bold
    r_open, r_idc, r_fee, r_need, r_draw, r_close = row + 1, row + 2, row + 3, row + 4, row + 5, row + 6
    for rr, lab in zip([r_open, r_idc, r_fee, r_need, r_draw, r_close],
                       ['Кредит на початок', 'Відсотки (капіталізовані)', 'Комісія', 'Потреба', 'Вибірка кредиту', 'Кредит на кінець']):
        wf.cell(row=rr, column=1, value=lab)
    for k in range(1, C + 1):
        c, pcol = CL(3 + k), CL(2 + k)
        wf.cell(row=r_open, column=3 + k, value='=0' if k == 1 else f'={pcol}{r_close}').number_format = NUM
        wf.cell(row=r_idc, column=3 + k, value=f'={c}{r_open}*i_rate/12').number_format = NUM
        wf.cell(row=r_fee, column=3 + k, value=f'=IF({c}$3=1,i_feePct*{prevD},0)').number_format = NUM
        wf.cell(row=r_need, column=3 + k, value=f'={c}$4+{c}$5+{c}{r_idc}+{c}{r_fee}').number_format = NUM
        wf.cell(row=r_draw, column=3 + k, value=f'={prevd}*({c}{r_need}-{c}$6)').number_format = NUM
        wf.cell(row=r_close, column=3 + k, value=f'={c}{r_open}+{c}{r_draw}').number_format = NUM
    rF, rD, rd = row + 7, row + 8, row + 9
    wf.cell(row=rF, column=1, value='F (потреба)'); wf.cell(row=rF, column=2, value=f'=SUM(D{r_need}:{CL(3+C)}{r_need})').number_format = NUM
    wf.cell(row=rD, column=1, value='D (кредит)'); wf.cell(row=rD, column=2, value=f'=i_dShare*B{rF}').number_format = NUM
    wf.cell(row=rd, column=1, value='d'); wf.cell(row=rd, column=2, value=f'=B{rD}/(B{rF}-c_dev)').number_format = '0.000000'
    last = dict(idc=r_idc, fee=r_fee, need=r_need, draw=r_draw, F=rF, D=rD)
    prevF, prevD, prevd = f'B{rF}', f'B{rD}', f'B{rd}'
    row += 11
wf.cell(row=row, column=1, value='Збіжність: зміна F за останній прохід, €').font = f_bold
wf.cell(row=row, column=2, value=f'=B{last["F"]}-B{last["F"]-11}').number_format = NUM2
name('k_convergence', f'Funding!$B${row}')
for key in ('idc', 'fee', 'need', 'draw'):
    name(f'f_{key}', f'Funding!$D${last[key]}:${CL(3+C)}${last[key]}')
name('k_F', f'Funding!$B${last["F"]}')
wf.column_dimensions['A'].width = 40
wf.column_dimensions['B'].width = 16

# ---------------- Timeline ----------------
wt = wb.create_sheet('Timeline')
T = C + A['project']['lifeYears'] * 12
c0 = 4  # column D = month 1
L = []  # (key, label, formula(col, prev_col), fmt)
R = {}
def add(key, label, fn, fmt=NUM, bold=False):
    R[key] = len(L) + 3
    L.append((key, label, fn, fmt, bold))

add('t', 't, місяць', lambda c, p, k: k, '0')
add('date', 'Кінець місяця', lambda c, p, k: f'=EOMONTH(i_start,{c}{R["t"]}-1)', 'mm.yyyy')
add('year', 'Рік', lambda c, p, k: f'=YEAR({c}{R["date"]})', '0')
add('mon', 'Місяць року', lambda c, p, k: f'=MONTH({c}{R["date"]})', '0')
add('o', 'Місяць експлуатації', lambda c, p, k: f'=MAX(0,{c}{R["t"]}-i_C)', '0')
add('ops', 'Експлуатація (1/0)', lambda c, p, k: f'=IF({c}{R["o"]}>0,1,0)', '0')
add('q', 'Квартал платежу (1/0)', lambda c, p, k: f'=IF(AND({c}{R["o"]}>0,MOD({c}{R["o"]},i_every)=0),1,0)', '0')
add('book', 'Нарахування податку (1/0)', lambda c, p, k: f'=IF(OR({c}{R["mon"]}=12,{c}{R["t"]}=d_T),1,0)', '0')
add('h1', 'БУДІВНИЦТВО', None)
add('capex', 'CAPEX без ПДВ', lambda c, p, k: f'=IF({c}{R["t"]}<=i_C,INDEX(c_month,1,{c}{R["t"]}),0)')
add('vat', 'ПДВ на CAPEX', lambda c, p, k: f'=IF({c}{R["t"]}<=i_C,INDEX(c_vat,1,{c}{R["t"]}),0)')
add('dev', 'Девелопмент з ПДВ (капітал)', lambda c, p, k: f'=IF({c}{R["t"]}=i_devM,c_dev,0)')
add('dOpen', 'Кредит на початок', lambda c, p, k: '=0' if k == 1 else f'={p}{R["dClose"]}')
add('idc', 'Відсотки за будівництво (капіталізовані)', lambda c, p, k: f'=IF({c}{R["ops"]}=0,INDEX(f_idc,1,{c}{R["t"]}),0)')
add('fee', 'Комісія за кредит', lambda c, p, k: f'=IF({c}{R["ops"]}=0,INDEX(f_fee,1,{c}{R["t"]}),0)')
add('need', 'Потреба фінансування', lambda c, p, k: f'=IF({c}{R["ops"]}=0,{c}{R["capex"]}+{c}{R["vat"]}+{c}{R["idc"]}+{c}{R["fee"]},0)')
add('draw', 'Вибірка кредиту', lambda c, p, k: f'=IF({c}{R["ops"]}=0,INDEX(f_draw,1,{c}{R["t"]}),0)')
add('eq', 'Внесок капіталу', lambda c, p, k: f'=IF({c}{R["ops"]}=0,{c}{R["need"]}-{c}{R["draw"]},0)')
add('h2', 'ЕКСПЛУАТАЦІЯ', None)
add('idxO', 'Індекс OPEX', lambda c, p, k: f'=(1+i_idx)^({c}{R["year"]}-i_baseYear)', '0.0000')
add('gen', 'Генерація, МВт·год', lambda c, p, k: f'={c}{R["ops"]}*d_E*INDEX(p_gen,{c}{R["mon"]})')
add('revG', 'Дохід валовий', lambda c, p, k: f'={c}{R["ops"]}*d_E*d_P*INDEX(p_rev,{c}{R["mon"]})*(1+i_priceIdx)^({c}{R["year"]}-i_baseYear)')
add('revN', 'Чистий дохід', lambda c, p, k: f'={c}{R["revG"]}*(1-i_trader-i_imb)')
add('opex', 'OPEX', lambda c, p, k: (f'={c}{R["ops"]}*i_opexMult*((i_om*d_kw/1000+d_staff+i_ins*c_total+i_rent*d_ha+i_admin*12+i_moFix*12/i_fx)/12*{c}{R["idxO"]}'
                                       f'+(i_disp+i_moVar)/i_fx*{c}{R["gen"]}*{c}{R["idxO"]}+(i_nkrekp+i_other)*{c}{R["revG"]})'))
add('ebitda', 'EBITDA', lambda c, p, k: f'={c}{R["revN"]}-{c}{R["opex"]}', NUM, True)
add('dep', 'Амортизація', lambda c, p, k: f'={c}{R["ops"]}*k_ppe/(i_dep*12)')
add('intExp', 'Відсотки (витрати)', lambda c, p, k: f'={c}{R["ops"]}*{c}{R["dOpen"]}*i_rate/12')
add('ipOpen', 'Відсотки до сплати, на початок', lambda c, p, k: '=0' if k == 1 else f'={p}{R["ipClose"]}')
add('intPaid', 'Відсотки сплачені', lambda c, p, k: f'={c}{R["q"]}*({c}{R["ipOpen"]}+{c}{R["intExp"]})')
add('ipClose', 'Відсотки до сплати, на кінець', lambda c, p, k: f'={c}{R["ipOpen"]}+{c}{R["intExp"]}-{c}{R["intPaid"]}')
add('princ', 'Погашення тіла', lambda c, p, k: f'=IF(AND({c}{R["q"]}=1,{c}{R["o"]}/i_every<=d_nRep),MIN(k_D/d_nRep,{c}{R["dOpen"]}),0)')
add('dClose', 'Кредит на кінець', lambda c, p, k: f'={c}{R["dOpen"]}+{c}{R["draw"]}-{c}{R["princ"]}')
add('vOpen', 'ПДВ до відшкодування, на початок', lambda c, p, k: '=0' if k == 1 else f'={p}{R["vClose"]}')
add('vatRec', 'ПДВ зараховано', lambda c, p, k: f'={c}{R["q"]}*MIN({c}{R["vOpen"]}+{c}{R["vat"]},i_vat*SUM({CL(max(c0, k + c0 - 3))}{R["revN"]}:{c}{R["revN"]}))')
add('vClose', 'ПДВ до відшкодування, на кінець', lambda c, p, k: f'={c}{R["vOpen"]}+{c}{R["vat"]}-{c}{R["vatRec"]}')
add('gRecog', 'Компенсація визнана', lambda c, p, k: f'=IF({c}{R["o"]}=1,k_G,0)')
add('gCash', 'Компенсація отримана', lambda c, p, k: f'=IF(AND({c}{R["o"]}=i_gDelay,k_G>0),k_G,0)')
add('gInc', 'Дохід від компенсації (IAS 20)', lambda c, p, k: f'={c}{R["ops"]}*k_G/d_L')
add('gRec', 'Компенсація до отримання', lambda c, p, k: (f'={c}{R["gRecog"]}-{c}{R["gCash"]}' if k == 1 else f'={p}{R["gRec"]}+{c}{R["gRecog"]}-{c}{R["gCash"]}'))
add('defInc', 'Відстрочений дохід', lambda c, p, k: (f'={c}{R["gRecog"]}-{c}{R["gInc"]}' if k == 1 else f'={p}{R["defInc"]}+{c}{R["gRecog"]}-{c}{R["gInc"]}'))
add('h3', 'ПОДАТКИ', None)
add('txb', 'Оподатковуваний результат місяця', lambda c, p, k: f'={c}{R["ebitda"]}-{c}{R["dep"]}-{c}{R["intExp"]}')
add('ytd', 'Наростаючий з початку року', lambda c, p, k: (f'={c}{R["txb"]}' if k == 1 else f'=IF({p}{R["book"]}=1,0,{p}{R["ytd"]})+{c}{R["txb"]}'))
add('lcfO', 'Збиток минулих років, на початок', lambda c, p, k: '=0' if k == 1 else f'={p}{R["lcfC"]}')
add('tax', 'Податок на прибуток', lambda c, p, k: f'={c}{R["book"]}*MAX(0,{c}{R["ytd"]}+{c}{R["lcfO"]})*i_tax')
add('lcfC', 'Збиток минулих років, на кінець', lambda c, p, k: f'=IF({c}{R["book"]}=1,MIN(0,{c}{R["ytd"]}+{c}{R["lcfO"]}),{c}{R["lcfO"]})')
add('txbU', 'Без боргового щита: результат місяця', lambda c, p, k: f'={c}{R["ebitda"]}-{c}{R["ops"]}*c_total/(i_dep*12)')
add('ytdU', 'Без боргового щита: наростаючий', lambda c, p, k: (f'={c}{R["txbU"]}' if k == 1 else f'=IF({p}{R["book"]}=1,0,{p}{R["ytdU"]})+{c}{R["txbU"]}'))
add('lcfUO', 'Без боргового щита: збиток, на початок', lambda c, p, k: '=0' if k == 1 else f'={p}{R["lcfUC"]}')
add('taxU', 'Податок без боргового щита', lambda c, p, k: f'={c}{R["book"]}*MAX(0,{c}{R["ytdU"]}+{c}{R["lcfUO"]})*i_tax')
add('lcfUC', 'Без боргового щита: збиток, на кінець', lambda c, p, k: f'=IF({c}{R["book"]}=1,MIN(0,{c}{R["ytdU"]}+{c}{R["lcfUO"]}),{c}{R["lcfUO"]})')
add('np', 'Чистий прибуток', lambda c, p, k: f'={c}{R["ebitda"]}-{c}{R["dep"]}-{c}{R["intExp"]}+{c}{R["gInc"]}-{c}{R["tax"]}', NUM, True)
add('h4', 'ГРОШІ', None)
add('cfads', 'Грошовий потік для обслуговування боргу', lambda c, p, k: f'={c}{R["ebitda"]}-{c}{R["tax"]}+{c}{R["vatRec"]}')
add('cOpen', 'Гроші на початок', lambda c, p, k: '=0' if k == 1 else f'={p}{R["cClose"]}')
add('cPre', 'Гроші до дивідендів', lambda c, p, k: f'={c}{R["cOpen"]}+{c}{R["ops"]}*({c}{R["cfads"]}+{c}{R["gCash"]}-{c}{R["intPaid"]}-{c}{R["princ"]})')
add('minC', 'Мінімальний залишок', lambda c, p, k: f'={c}{R["opex"]}+{c}{R["dClose"]}*i_rate/12')
add('div', 'Дивіденди', lambda c, p, k: f'=IF({c}{R["t"]}=d_T,MAX(0,{c}{R["cPre"]}),IF(AND({c}{R["ops"]}=1,{c}{R["mon"]}=12),MAX(0,{c}{R["cPre"]}-{c}{R["minC"]}),0))')
add('cClose', 'Гроші на кінець', lambda c, p, k: f'={c}{R["cPre"]}-{c}{R["div"]}')
add('h5', 'БАЛАНС', None)
add('ppe', 'Основні засоби', lambda c, p, k: (f'={c}{R["capex"]}+{c}{R["idc"]}+{c}{R["fee"]}-{c}{R["dep"]}' if k == 1 else f'={p}{R["ppe"]}+{c}{R["capex"]}+{c}{R["idc"]}+{c}{R["fee"]}-{c}{R["dep"]}'))
add('share', 'Статутний капітал', lambda c, p, k: (f'={c}{R["eq"]}' if k == 1 else f'={p}{R["share"]}+{c}{R["eq"]}'))
add('re', 'Нерозподілений прибуток', lambda c, p, k: (f'={c}{R["np"]}-{c}{R["div"]}' if k == 1 else f'={p}{R["re"]}+{c}{R["np"]}-{c}{R["div"]}'))
add('assets', 'Активи', lambda c, p, k: f'={c}{R["ppe"]}+{c}{R["vClose"]}+{c}{R["gRec"]}+{c}{R["cClose"]}')
add('liab', 'Зобов\'язання і капітал', lambda c, p, k: f'={c}{R["dClose"]}+{c}{R["ipClose"]}+{c}{R["defInc"]}+{c}{R["share"]}+{c}{R["re"]}')
add('check', 'Перевірка балансу', lambda c, p, k: f'={c}{R["assets"]}-{c}{R["liab"]}', NUM2)
add('h6', 'ПОКАЗНИКИ', None)
add('fcf', 'Потік проєкту', lambda c, p, k: f'=IF({c}{R["ops"]}=0,-({c}{R["capex"]}+{c}{R["vat"]}),{c}{R["ebitda"]}-{c}{R["taxU"]}+{c}{R["vatRec"]}+{c}{R["gCash"]})')
add('eqf', 'Потік капіталу', lambda c, p, k: f'={c}{R["div"]}-{c}{R["eq"]}')
add('cumF', 'Потік проєкту наростаючим', lambda c, p, k: (f'={c}{R["fcf"]}' if k == 1 else f'={p}{R["cumF"]}+{c}{R["fcf"]}'))
add('cumE', 'Потік капіталу наростаючим', lambda c, p, k: (f'={c}{R["eqf"]}' if k == 1 else f'={p}{R["cumE"]}+{c}{R["eqf"]}'))
add('pbF', 'Окупність проєкту, міс.', lambda c, p, k: ('=""' if k == 1 else f'=IF(AND({p}{R["cumF"]}<0,{c}{R["cumF"]}>=0),{c}{R["t"]}-1-{p}{R["cumF"]}/{c}{R["fcf"]},"")'), NUM2)
add('pbE', 'Окупність капіталу, міс.', lambda c, p, k: ('=""' if k == 1 else f'=IF(AND({p}{R["cumE"]}<0,{c}{R["cumE"]}>=0),{c}{R["t"]}-1-{p}{R["cumE"]}/{c}{R["eqf"]},"")'), NUM2)
add('cost', 'CAPEX + OPEX (для LCOE)', lambda c, p, k: f'={c}{R["capex"]}+{c}{R["opex"]}')
add('ly', 'Рік кредиту', lambda c, p, k: f'=IF(AND({c}{R["o"]}>=1,{c}{R["o"]}<=i_tenor*12),INT(({c}{R["o"]}-1)/12)+1,0)', '0')
add('ds', 'Обслуговування боргу', lambda c, p, k: f'={c}{R["intPaid"]}+{c}{R["princ"]}')
add('cfL', 'CFADS у строк кредиту', lambda c, p, k: f'=IF({c}{R["ly"]}>0,{c}{R["cfads"]},0)')

wt['A1'] = 'Місячна модель: стовпець D = місяць 1 (березень 2027), останній = серпень 2053'
wt['A1'].font = f_bold
for key, label, fn, fmt, bold in L:
    rr = R[key]
    cl = wt.cell(row=rr, column=1, value=label)
    cl.font = f_bold if (bold or fn is None) else f_norm
    if fn is None:
        continue
    for k in range(1, T + 1):
        col = CL(c0 + k - 1)
        prev = CL(c0 + k - 2) if k > 1 else None
        v = fn(col, prev, k)
        cell = wt.cell(row=rr, column=c0 + k - 1, value=v)
        cell.number_format = fmt
        if bold:
            cell.font = f_bold
    if fmt not in ('0', 'mm.yyyy', '0.0000'):
        wt.cell(row=rr, column=3, value=f'=SUM(D{rr}:{CL(c0+T-1)}{rr})').number_format = fmt
wt.cell(row=2, column=3, value='Разом').font = f_bold
wt.column_dimensions['A'].width = 44
wt.freeze_panes = 'D3'
lastc = CL(c0 + T - 1)
def rng(key):
    return f'Timeline!$D${R[key]}:${lastc}${R[key]}'

# ---------------- Calc (scalars incl. iteration) ----------------
wk = wb.create_sheet('Calc', 1)
wk['A1'] = 'Фінансування будівництва (ітерація) і ключові суми'
wk['A1'].font = f_bold
calc = [
    ('k_D', 'Сума кредиту = вибірки (≈ частка × потреба, аркуш Funding)', f'=SUM({rng("draw")})'),
    ('k_shareCheck', 'Частка кредиту у фінансуванні (перевірка, має бути 65%)', f'=k_D/SUM({rng("need")})'),
    ('k_ppe', 'Основні засоби = CAPEX + відсотки + комісія', f'=c_total+SUM({rng("idc")})+SUM({rng("fee")})'),
    ('k_G', 'Компенсація 15%', '=IF(i_gOn=1,i_gPct*c_total,0)'),
]
for j, (n, label, fml) in enumerate(calc):
    rr = 3 + j
    wk.cell(row=rr, column=1, value=n)
    wk.cell(row=rr, column=2, value=label)
    wk.cell(row=rr, column=3, value=fml).number_format = PCT2 if n == 'k_shareCheck' else NUM
    name(n, f'Calc!$C${rr}')
wk.column_dimensions['B'].width = 50
wk.column_dimensions['C'].width = 18

# ---------------- KPI ----------------
wkpi = wb.create_sheet('KPI', 1)
wkpi['A1'] = 'Показники проєкту (ТЗ, розділ 7)'
wkpi['A1'].font = Font(name=F, bold=True, size=13)
header(wkpi, 3, ['Код', 'Показник', 'Значення', 'Одиниця'])
COD = C  # timeline column of COD month
col_cod = CL(c0 + COD - 1)
col_last_loan = CL(c0 + COD + A['finance']['tenorYears'] * 12 - 1)
kp = [
    ('capexExVat', 'CAPEX без ПДВ', '=c_total', '€', NUM),
    ('capexPerKW', 'CAPEX на кВт', '=c_total/d_kw', '€/кВт', NUM),
    ('debt', 'Кредит', '=k_D', '€', NUM),
    ('equity', 'Капітал', f'=SUM({rng("eq")})', '€', NUM),
    ('idc', 'Капіталізовані відсотки', f'=SUM({rng("idc")})', '€', NUM),
    ('fee', 'Комісія', f'=SUM({rng("fee")})', '€', NUM),
    ('vatPaid', 'ПДВ на CAPEX', f'=SUM({rng("vat")})', '€', NUM),
    ('annualGeneration', 'Річна генерація', '=d_E', 'МВт·год', NUM),
    ('capturePrice', 'Capture price вітру', '=p_capture', '€/МВт·год', NUM2),
    ('projectIrr', 'IRR проєкту', f'=XIRR({rng("fcf")},{rng("date")})', '%', PCT2),
    ('equityIrr', 'IRR капіталу', f'=XIRR({rng("eqf")},{rng("date")})', '%', PCT2),
    ('npvProject', 'NPV проєкту за WACC', f'=XNPV(d_wacc,{rng("fcf")},{rng("date")})', '€', NUM),
    ('wacc', 'WACC після податків', '=d_wacc', '%', PCT2),
    ('ebitdaAvg5', 'EBITDA середня, перші 5 років', f'=SUMIFS({rng("ebitda")},{rng("o")},">=1",{rng("o")},"<=60")/5', '€/рік', NUM),
    ('ebitdaToCapex', 'EBITDA / CAPEX', '=C17/C4', '%', PCT2),
    ('npToEquity', 'Чистий прибуток / капітал, середнє', f'=SUM({rng("np")})/i_life/C7', '%', PCT2),
    ('paybackProjectYears', 'Окупність проєкту від початку будівництва', f'=MIN({rng("pbF")})/12', 'років', NUM2),
    ('paybackEquityYears', 'Окупність капіталу від початку будівництва', f'=MIN({rng("pbE")})/12', 'років', NUM2),
    ('lcoe', 'LCOE', f'=XNPV(d_wacc,{rng("cost")},{rng("date")})/XNPV(d_wacc,{rng("gen")},{rng("date")})', '€/МВт·год', NUM2),
    ('dscrMin', 'DSCR мінімальний (роки кредиту)', '=MIN(C33:C42)', '×', '0.00'),
    ('dscrAvg', 'DSCR середній (роки кредиту)', '=AVERAGE(C33:C42)', '×', '0.00'),
    ('llcr', 'LLCR на дату введення', f'=XNPV(i_rate,Timeline!${col_cod}${R["cfL"]}:${col_last_loan}${R["cfL"]},Timeline!${col_cod}${R["date"]}:${col_last_loan}${R["date"]})/k_D', '×', '0.00'),
    ('grant', 'Компенсація 15%', '=k_G', '€', NUM),
    ('balanceMax', 'Макс. розбіжність балансу', f'=MAX(MAX({rng("check")}),-MIN({rng("check")}))', '€', NUM2),
    ('debtEnd', 'Кредит на кінець строку', f'=Timeline!{col_last_loan}{R["dClose"]}', '€', NUM2),
]
for j, (code, label, fml, unit, fmt) in enumerate(kp):
    rr = 4 + j
    wkpi.cell(row=rr, column=1, value=code)
    wkpi.cell(row=rr, column=2, value=label)
    c = wkpi.cell(row=rr, column=3, value=fml)
    c.number_format = fmt
    wkpi.cell(row=rr, column=4, value=unit)
assert wkpi['A17'].value == 'ebitdaAvg5' and wkpi['A4'].value == 'capexExVat' and wkpi['A7'].value == 'equity'
wkpi['A31'] = 'DSCR за роками кредиту'
wkpi['A31'].font = f_bold
header(wkpi, 32, ['Рік', 'CFADS', 'DSCR', 'Обслуговування боргу'])
for y in range(1, 11):
    rr = 32 + y
    wkpi.cell(row=rr, column=1, value=y)
    wkpi.cell(row=rr, column=2, value=f'=SUMIFS({rng("cfL")},{rng("ly")},A{rr})').number_format = NUM
    wkpi.cell(row=rr, column=4, value=f'=SUMIFS({rng("ds")},{rng("ly")},A{rr})').number_format = NUM
    wkpi.cell(row=rr, column=3, value=f'=IF(D{rr}>0,B{rr}/D{rr},"")').number_format = '0.00'
wkpi.column_dimensions['B'].width = 46
wkpi.column_dimensions['C'].width = 18
wkpi.column_dimensions['D'].width = 18

# ---------------- Annual (calendar years) ----------------
wa = wb.create_sheet('Annual', 2)
wa['A1'] = 'Звіти за календарними роками, EUR'
wa['A1'].font = Font(name=F, bold=True, size=13)
years = list(range(2027, 2054))
for j, y in enumerate(years):
    wa.cell(row=3, column=2 + j, value=str(y)).font = f_bold
flows_rows = [('P&L',), ('Генерація, МВт·год', 'gen'), ('Дохід валовий', 'revG'), ('Чистий дохід', 'revN'), ('OPEX', 'opex'), ('EBITDA', 'ebitda'),
              ('Амортизація', 'dep'), ('Відсотки', 'intExp'), ('Дохід від компенсації', 'gInc'), ('Податок', 'tax'), ('Чистий прибуток', 'np'),
              ('Рух грошових коштів',), ('CAPEX без ПДВ', 'capex'), ('ПДВ на CAPEX', 'vat'), ('Капіталізовані відсотки', 'idc'), ('Комісія', 'fee'),
              ('Вибірка кредиту', 'draw'), ('Внесок капіталу', 'eq'), ('Погашення тіла', 'princ'), ('Відсотки сплачені', 'intPaid'),
              ('ПДВ зараховано', 'vatRec'), ('Компенсація отримана', 'gCash'), ('Дивіденди', 'div')]
bal_rows = [('Баланс на кінець року',), ('Основні засоби', 'ppe'), ('ПДВ до відшкодування', 'vClose'), ('Компенсація до отримання', 'gRec'), ('Гроші', 'cClose'),
            ('Кредит', 'dClose'), ('Відсотки до сплати', 'ipClose'), ('Відстрочений дохід', 'defInc'), ('Статутний капітал', 'share'),
            ('Нерозподілений прибуток', 're'), ('Перевірка балансу', 'check')]
rr = 4
for row in flows_rows:
    if len(row) == 1:
        wa.cell(row=rr, column=1, value=row[0]).font = f_bold
        rr += 1
        continue
    label, key = row
    wa.cell(row=rr, column=1, value=label)
    for j, y in enumerate(years):
        wa.cell(row=rr, column=2 + j, value=f'=SUMIFS({rng(key)},{rng("year")},{y})').number_format = NUM
    rr += 1
for row in bal_rows:
    if len(row) == 1:
        wa.cell(row=rr, column=1, value=row[0]).font = f_bold
        rr += 1
        continue
    label, key = row
    wa.cell(row=rr, column=1, value=label)
    for j, y in enumerate(years):
        # value at the last month of the year: the year's last date
        wa.cell(row=rr, column=2 + j, value=f'=INDEX({rng(key)},1,MATCH({y},{rng("year")},1))').number_format = NUM2 if key == 'check' else NUM
    rr += 1
wa.column_dimensions['A'].width = 30
wa.freeze_panes = 'B4'

wb.save(OUT)
print('saved', OUT, 'timeline rows', len(L), 'months', T)
