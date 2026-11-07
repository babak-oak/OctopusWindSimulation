import React, { useContext, useState } from 'react';
import { Gate, ReadOnly } from './readonly';
import { SitePanel } from './SitePanel';
import type { Assumptions } from '../engine/types';
import { capacityKW, itemQty, staffAnnualCost, staffCount } from '../engine/model';
import { GROUPS, OEM, getPath, setPath, type Field } from './fields';
import { S, tr, type Lang } from './i18n';
import { num } from './format';

interface Props {
  a: Assumptions;
  d: Assumptions;
  lang: Lang;
  onChange: (a: Assumptions) => void;
}

export function NumberInput({ value, decimals, onCommit, label }: { value: number; decimals: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ro = useContext(ReadOnly);
  const gate = useContext(Gate);
  const shown = draft ?? num(value, decimals);
  return (
    <input
      disabled={ro}
      className="num"
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onFocus={(e) => { if (gate) { e.currentTarget.blur(); gate(); return; } setDraft(String(Number(value.toFixed(decimals)))); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = Number((draft ?? '').replace(/,/g, '').replace('−', '-'));
        if (draft !== null && Number.isFinite(v)) onCommit(v);
        setDraft(null);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function FieldRow({ f, a, d, lang, onChange }: { f: Field } & Props) {
  const v = getPath(a, f.path);
  const dv = getPath(d, f.path);
  const changed = JSON.stringify(v) !== JSON.stringify(dv);
  const [info, setInfo] = useState(false);
  const ro = useContext(ReadOnly);
  const label = tr(f.label, lang);
  let control: React.ReactNode;
  let out = false;
  const ref = a.project.reference;
  if (f.scaled) {
    const sc = f.scaled;
    const manual = getPath(a, sc.manual) as number | undefined;
    const auto = manual === undefined;
    const eff = sc.eff(a);
    const dec = f.decimals ?? 0;
    const basisTxt = sc.basis === 'turbines'
      ? (lang === 'uk' ? `∝ кількості ВЕУ; еталон ${ref.turbines} шт.: ${num(Number(v), dec)}` : `∝ turbine count; reference ${ref.turbines}: ${num(Number(v), dec)}`)
      : (lang === 'uk' ? `∝ встановленій потужності; еталон ${num(ref.turbines * ref.turbineMW, 1)} МВт: ${num(Number(v), dec)}` : `∝ installed MW; reference ${num(ref.turbines * ref.turbineMW, 1)} MW: ${num(Number(v), dec)}`);
    const site = f.path === 'generation.netAEP_MWh' && a.generation.site?.mode === 'site' && a.generation.site.result;
    const srcTxt = site ? (lang === 'uk' ? 'за координатами: блок «Джерело генерації»' : 'from the coordinates: see «Generation source»') : basisTxt;
    return (
      <div className={`field${!auto ? ' changed' : ''}`}>
        <div className="field-head">
          <span className="field-label">{label}</span>
          <button className="icon" onClick={() => setInfo(!info)} aria-label={tr(S.source, lang)} aria-expanded={info}>i</button>
          {!auto && <button className="icon" onClick={() => onChange(setPath(a, sc.manual, undefined))} title={lang === 'uk' ? 'Повернути автоматичний розрахунок' : 'Back to automatic'} aria-label="auto">↺</button>}
        </div>
        <div className="field-ctl">
          <NumberInput value={eff} decimals={dec} label={label} onCommit={(x) => onChange(setPath(a, sc.manual, x))} />
          <span className="unit">{tr(f.unit, lang)}</span>
        </div>
        <div className="field-src">{auto ? (lang === 'uk' ? 'авто ' : 'auto ') : (lang === 'uk' ? 'вручну ' : 'manual ')}{srcTxt}</div>
        {info && <div className="field-src">{tr(S.source, lang)}: {f.source}</div>}
        {f.path === 'generation.netAEP_MWh' && <div className="field-note">{tr(S.aepNote, lang)}</div>}
      </div>
    );
  }
  if (f.kind === 'staff') {
    const setRole = (id: string, patch: Record<string, unknown>) =>
      onChange({ ...a, opex: { ...a.opex, staffRoles: a.opex.staffRoles.map((r) => (r.id === id ? { ...r, ...patch } : r)) } });
    const total = a.opex.staffRoles.reduce((s2, r) => s2 + staffCount(a, r), 0);
    return (
      <div className="field">
        <div className="field-head">
          <span className="field-label">{label}: {total} {lang === 'uk' ? 'осіб' : 'people'}, {num(staffAnnualCost(a) / 1000, 0)} {lang === 'uk' ? 'тис. €/рік' : 'EUR k/yr'}</span>
          <button className="icon" onClick={() => setInfo(!info)} aria-label={tr(S.source, lang)} aria-expanded={info}>i</button>
        </div>
        <table className="capex-edit">
          <thead><tr><th>{lang === 'uk' ? 'Посада' : 'Role'}</th><th className="n">{lang === 'uk' ? 'Осіб' : 'Heads'}</th><th className="n">{lang === 'uk' ? 'ЗП нетто, €/міс.' : 'Net pay, EUR/mo'}</th></tr></thead>
          <tbody>
            {a.opex.staffRoles.map((r) => {
              const auto = r.manualCount === undefined;
              const rule = r.per
                ? (lang === 'uk' ? `${r.count} на кожні ${r.per} ВЕУ` : `${r.count} per ${r.per} turbines`)
                : (lang === 'uk' ? 'фіксовано' : 'fixed');
              return (
                <tr key={r.id} className={!auto ? 'changed' : ''}>
                  <td>{lang === 'uk' ? r.nameUk : r.nameEn}<div className="field-src">{auto ? (lang === 'uk' ? 'авто: ' : 'auto: ') : (lang === 'uk' ? 'вручну; правило: ' : 'manual; rule: ')}{rule}</div></td>
                  <td className="n"><span className="qty-cell">
                    <NumberInput value={staffCount(a, r)} decimals={0} label={`${r.nameEn} headcount`} onCommit={(x) => setRole(r.id, { manualCount: x })} />
                    {!auto && <button className="icon" aria-label="auto" title={lang === 'uk' ? 'Повернути автоматичний розрахунок' : 'Back to automatic'} onClick={() => setRole(r.id, { manualCount: undefined })}>↺</button>}
                  </span></td>
                  <td className="n"><NumberInput value={r.netMonthly} decimals={0} label={`${r.nameEn} salary`} onCommit={(x) => setRole(r.id, { netMonthly: x })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {info && <div className="field-src">{tr(S.source, lang)}: {f.source}</div>}
        <div className="field-src">{lang === 'uk' ? 'Вартість = нетто / (1 − ПДФО 18% − ВЗ 5%) × (1 + ЄСВ 22%)' : 'Cost = net / (1 − PIT 18% − military levy 5%) × (1 + SSC 22%)'}</div>
      </div>
    );
  }
  if (f.kind === 'bool') {
    control = (
      <label className="switch">
        <input type="checkbox" disabled={ro} checked={Boolean(v)} onChange={(e) => onChange(setPath(a, f.path, e.target.checked))} aria-label={label} />
        <span>{v ? (lang === 'uk' ? 'Так' : 'Yes') : lang === 'uk' ? 'Ні' : 'No'}</span>
      </label>
    );
  } else if (f.kind === 'date') {
    control = (
      <input type="month" disabled={ro} aria-label={label} value={String(v).slice(0, 7)}
        onChange={(e) => e.target.value && onChange(setPath(a, f.path, `${e.target.value}-01`))} />
    );
  } else {
    const isPct = f.kind === 'percent';
    const nv = Number(v) * (isPct ? 100 : 1);
    const dec = f.decimals ?? 0;
    out = (f.min !== undefined && Number(v) < f.min) || (f.max !== undefined && Number(v) > f.max);
    control = <NumberInput value={nv} decimals={dec} label={label} onCommit={(x) => onChange(setPath(a, f.path, isPct ? x / 100 : x))} />;
  }
  const disabled = (f.path === 'generation.availability' || f.path === 'generation.techLosses') && a.generation.aepIncludesLosses;
  return (
    <div className={`field${changed ? ' changed' : ''}${disabled ? ' disabled' : ''}`}>
      <div className="field-head">
        <span className="field-label">{label}</span>
        <button className="icon" onClick={() => setInfo(!info)} aria-label={tr(S.source, lang)} aria-expanded={info}>i</button>
        {changed && (
          <button className="icon" onClick={() => onChange(setPath(a, f.path, dv))} title={tr(S.reset, lang)} aria-label={tr(S.reset, lang)}>↺</button>
        )}
      </div>
      <div className="field-ctl">{control}<span className="unit">{tr(f.unit, lang)}</span></div>
      {out && <div className="field-warn oc-caution">{tr(S.outOfRange, lang)}</div>}
      {info && <div className="field-src">{tr(S.source, lang)}: {f.source}</div>}
    </div>
  );
}

const QTY_UNIT: Record<string, [string, string]> = { kW: ['кВт', 'kW'], km: ['км', 'km'], pcs: ['шт.', 'pcs'], set: ['компл.', 'set'] };
const RATE_UNIT: Record<string, [string, string]> = { kW: ['кВт', 'kW'], km: ['км', 'km'], pcs: ['шт.', 'pc'], set: ['компл.', 'set'] };
function units(i: { qtyUnit?: string; currency: string; qtyBasis?: string }, lang: Lang) {
  const k = i.qtyUnit ?? (i.qtyBasis ? 'kW' : 'set');
  const li = lang === 'uk' ? 0 : 1;
  const cur = i.currency === 'UAH' ? (lang === 'uk' ? 'грн' : 'UAH') : '€';
  return { qty: QTY_UNIT[k][li], rate: `${cur}/${RATE_UNIT[k][li]}` };
}

export function AssumptionsPanel(p: Props) {
  const { a, d, lang, onChange } = p;
  const [open, setOpen] = useState<Record<string, boolean>>({ generation: true, market: true });
  const [grantPopup, setGrantPopup] = useState(false);
  const ro = useContext(ReadOnly);
  const gate = useContext(Gate);
  const wtg = a.capex.items.find((i) => i.id === 'wtg')!;
  const preset = OEM.find((o) => o.rate === wtg.rate)?.id ?? 'custom';
  const setItem = (id: string, key: 'rate' | 'qty' | 'manualQty', v: number | undefined) =>
    onChange({ ...a, capex: { ...a.capex, items: a.capex.items.map((i) => (i.id === id ? { ...i, [key]: v } : i)) } });
  const ref = a.project.reference;
  const kw = capacityKW(a);
  return (
    <aside className="assumptions" aria-label={tr(S.assumptions, lang)}>
      <div className="panel-head">
        <p className="oc-overline">{tr(S.assumptions, lang)}</p>
        {!ro && <button className="link" onClick={() => onChange(structuredClone(d))}>{tr(S.resetAll, lang)}</button>}
      </div>
      <p className="muted small">{num(kw / 1000, 1)} MW · {tr(S.ivoryNote, lang)}</p>

      <section className="group">
        <h3>{lang === 'uk' ? 'Опції' : 'Options'}</h3>
        <div className="field">
          <div className="field-head"><span className="field-label">{tr(S.oem, lang)}</span></div>
          <div className="field-ctl">
            <select disabled={ro} value={preset} onChange={(e) => {
              const o = OEM.find((x) => x.id === e.target.value);
              if (o) setItem('wtg', 'rate', o.rate);
            }}>
              {OEM.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.rate} €/kW</option>)}
              {preset === 'custom' && <option value="custom">{tr(S.custom, lang)}</option>}
            </select>
          </div>
          <div className="field-src">{OEM.find((o) => o.id === preset) ? tr(OEM.find((o) => o.id === preset)!.note, lang) : ''}</div>
        </div>
        <div className="field">
          <div className="field-head">
            <span className="field-label">{tr(S.grantTitle, lang)}</span>
            <button className="icon" onClick={() => setGrantPopup(true)} aria-label={tr(S.source, lang)}>i</button>
          </div>
          <label className="switch">
            <input type="checkbox" disabled={ro} checked={a.compensation.enabled} onChange={(e) => {
              onChange({ ...a, compensation: { ...a.compensation, enabled: e.target.checked } });
              if (e.target.checked && !gate) setGrantPopup(true);
            }} />
            <span>{a.compensation.enabled ? (lang === 'uk' ? 'Увімкнено' : 'On') : lang === 'uk' ? 'Вимкнено' : 'Off'}</span>
          </label>
        </div>
      </section>

      <SitePanel a={a} lang={lang} onChange={onChange} preset={preset} />

      {GROUPS.map((g) => (
        <section className="group" key={g.id}>
          <h3><button className="group-toggle" aria-expanded={!!open[g.id]} onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })}>
            {open[g.id] ? '▾' : '▸'} {tr(g.title, lang)}
          </button></h3>
          {open[g.id] && g.fields.map((f) => <FieldRow key={f.path} f={f} {...p} />)}
        </section>
      ))}

      <section className="group">
        <h3><button className="group-toggle" aria-expanded={!!open.capex} onClick={() => setOpen({ ...open, capex: !open.capex })}>
          {open.capex ? '▾' : '▸'} CAPEX
        </button></h3>
        {open.capex && (
          <table className="capex-edit">
            <thead><tr><th>{lang === 'uk' ? 'Стаття' : 'Item'}</th><th className="n">{lang === 'uk' ? 'Кількість' : 'Qty'}</th><th className="n">{lang === 'uk' ? 'Ставка' : 'Rate'}</th></tr></thead>
            <tbody>
              {a.capex.items.map((i) => {
                const di = d.capex.items.find((x) => x.id === i.id);
                const changed = !di || di.rate !== i.rate || di.qty !== i.qty || i.manualQty !== undefined;
                const scaled = !!i.scale && !i.qtyBasis;
                const auto = scaled && i.manualQty === undefined;
                const basisTxt = i.scale === 'turbines'
                  ? (lang === 'uk' ? `∝ кількості ВЕУ (еталон ${ref.turbines} шт.: ${num(i.qty, 2)})` : `∝ turbine count (reference ${ref.turbines}: ${num(i.qty, 2)})`)
                  : (lang === 'uk' ? `∝ встановленій потужності (еталон ${num(ref.turbines * ref.turbineMW, 1)} МВт: ${num(i.qty, 2)})` : `∝ installed MW (reference ${num(ref.turbines * ref.turbineMW, 1)} MW: ${num(i.qty, 2)})`);
                return (
                  <tr key={i.id} className={changed ? 'changed' : ''} title={i.source}>
                    <td>{lang === 'uk' ? i.nameUk : i.nameEn}
                      {scaled && <div className="field-src">{auto ? (lang === 'uk' ? 'авто ' : 'auto ') : (lang === 'uk' ? 'вручну ' : 'manual ')}{basisTxt}</div>}
                    </td>
                    <td className="n">
                      {i.qtyBasis ? <>{num(itemQty(a, i), 0)} <span className="unit">{units(i, lang).qty}</span></>
                        : scaled ? (
                          <span className="qty-cell">
                            <NumberInput value={itemQty(a, i)} decimals={2} label={`${i.nameEn} qty`} onCommit={(v) => setItem(i.id, 'manualQty', v)} />
                            {!auto && <button className="icon" title={lang === 'uk' ? 'Повернути автоматичний розрахунок' : 'Back to automatic'} aria-label="auto" onClick={() => setItem(i.id, 'manualQty', undefined)}>↺</button>}
                          </span>
                        )
                        : <NumberInput value={i.qty} decimals={2} label={`${i.nameEn} qty`} onCommit={(v) => setItem(i.id, 'qty', v)} />}
                      {!i.qtyBasis && <span className="unit"> {units(i, lang).qty}</span>}
                    </td>
                    <td className="n"><NumberInput value={i.rate} decimals={0} label={`${i.nameEn} rate`} onCommit={(v) => setItem(i.id, 'rate', v)} />
                      <span className="unit">{units(i, lang).rate}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {grantPopup && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={tr(S.grantTitle, lang)} onClick={() => setGrantPopup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="oc-overline">{lang === 'uk' ? 'Умови програми' : 'Programme terms'}</p>
            <h3>{tr(S.grantTitle, lang)}</h3>
            <p>{tr(S.grantBody, lang)}</p>
            <button className="btn-action" onClick={() => setGrantPopup(false)}>{tr(S.close, lang)}</button>
          </div>
        </div>
      )}
    </aside>
  );
}
