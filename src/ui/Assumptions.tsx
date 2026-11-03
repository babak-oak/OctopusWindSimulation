import React, { useState } from 'react';
import type { Assumptions } from '../engine/types';
import { capacityKW, itemQty } from '../engine/model';
import { GROUPS, OEM, getPath, setPath, type Field } from './fields';
import { S, tr, type Lang } from './i18n';
import { num } from './format';

interface Props {
  a: Assumptions;
  d: Assumptions;
  lang: Lang;
  onChange: (a: Assumptions) => void;
}

function NumberInput({ value, decimals, onCommit, label }: { value: number; decimals: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? num(value, decimals);
  return (
    <input
      className="num"
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onFocus={() => setDraft(String(Number(value.toFixed(decimals))))}
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
  const label = tr(f.label, lang);
  let control: React.ReactNode;
  let out = false;
  if (f.kind === 'bool') {
    control = (
      <label className="switch">
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(setPath(a, f.path, e.target.checked))} aria-label={label} />
        <span>{v ? (lang === 'uk' ? 'Так' : 'Yes') : lang === 'uk' ? 'Ні' : 'No'}</span>
      </label>
    );
  } else if (f.kind === 'date') {
    control = (
      <input type="month" aria-label={label} value={String(v).slice(0, 7)}
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
      {f.path === 'generation.netAEP_MWh' && <div className="field-note">{tr(S.aepNote, lang)}</div>}
    </div>
  );
}

export function AssumptionsPanel(p: Props) {
  const { a, d, lang, onChange } = p;
  const [open, setOpen] = useState<Record<string, boolean>>({ generation: true, market: true });
  const [grantPopup, setGrantPopup] = useState(false);
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
        <button className="link" onClick={() => onChange(structuredClone(d))}>{tr(S.resetAll, lang)}</button>
      </div>
      <p className="muted small">{num(kw / 1000, 1)} MW · {tr(S.ivoryNote, lang)}</p>

      <section className="group">
        <h3>{lang === 'uk' ? 'Опції' : 'Options'}</h3>
        <div className="field">
          <div className="field-head"><span className="field-label">{tr(S.oem, lang)}</span></div>
          <div className="field-ctl">
            <select value={preset} onChange={(e) => {
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
            <input type="checkbox" checked={a.compensation.enabled} onChange={(e) => {
              onChange({ ...a, compensation: { ...a.compensation, enabled: e.target.checked } });
              if (e.target.checked) setGrantPopup(true);
            }} />
            <span>{a.compensation.enabled ? (lang === 'uk' ? 'Увімкнено' : 'On') : lang === 'uk' ? 'Вимкнено' : 'Off'}</span>
          </label>
        </div>
      </section>

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
                      {i.qtyBasis ? num(itemQty(a, i), 0)
                        : scaled ? (
                          <span className="qty-cell">
                            <NumberInput value={itemQty(a, i)} decimals={2} label={`${i.nameEn} qty`} onCommit={(v) => setItem(i.id, 'manualQty', v)} />
                            {!auto && <button className="icon" title={lang === 'uk' ? 'Повернути автоматичний розрахунок' : 'Back to automatic'} aria-label="auto" onClick={() => setItem(i.id, 'manualQty', undefined)}>↺</button>}
                          </span>
                        )
                        : <NumberInput value={i.qty} decimals={2} label={`${i.nameEn} qty`} onCommit={(v) => setItem(i.id, 'qty', v)} />}
                    </td>
                    <td className="n"><NumberInput value={i.rate} decimals={0} label={`${i.nameEn} rate`} onCommit={(v) => setItem(i.id, 'rate', v)} />
                      <span className="unit">{i.currency === 'UAH' ? (i.qtyBasis ? 'грн/кВт' : 'грн') : i.qtyBasis ? '€/kW' : '€'}</span></td>
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
