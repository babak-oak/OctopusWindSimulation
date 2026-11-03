import React, { useMemo, useState } from 'react';
import { ReadOnly } from './readonly';
import type { Assumptions } from '../engine/types';
import { defaultAssumptions } from '../engine/defaults';
import { marketData } from '../engine/data';
import { run } from '../engine/model';
import { applyScenario, defaultStress, type ScenarioId, type StressSizes } from '../engine/scenarios';
import { AssumptionsPanel } from './Assumptions';
import { Results, TABS, type Tab } from './Results';
import { S, tr, type Lang } from './i18n';


/** Brings a stored project up to the current assumption shape (fields added after it was saved). */
export function migrate(a: Assumptions): Assumptions {
  const d = defaultAssumptions();
  const b: Assumptions = {
    ...d,
    ...a,
    project: { ...d.project, ...a.project },
    generation: { ...d.generation, ...a.generation },
    market: { ...d.market, ...a.market },
    opex: { ...d.opex, ...a.opex },
    finance: { ...d.finance, ...a.finance },
    schedule: { ...d.schedule, ...a.schedule },
    compensation: { ...d.compensation, ...a.compensation },
    stress: { ...d.stress, ...a.stress },
    capex: { ...d.capex, ...a.capex },
  };
  b.capex.items = (a.capex?.items ?? d.capex.items).map((i) => ({ ...d.capex.items.find((x) => x.id === i.id), ...i, qtyUnit: i.qtyUnit ?? d.capex.items.find((x) => x.id === i.id)?.qtyUnit }));
  return b;
}

interface Props {
  a: Assumptions;
  onChange?: (a: Assumptions) => void;
  lang: Lang;
  readOnly?: boolean;
  toolbar?: React.ReactNode;
  stress: StressSizes;
  setStress: (s: StressSizes) => void;
}

export function ModelView({ a, onChange, lang, readOnly = false, toolbar, stress, setStress }: Props) {
  const defaults = useMemo(() => defaultAssumptions(), []);
  const [scenario, setScenario] = useState<ScenarioId>('base');
  const [tab, setTab] = useState<Tab>('overview');
  const base = useMemo(() => run(a, marketData), [a]);
  const r = useMemo(() => (scenario === 'base' ? base : run(applyScenario(a, scenario, stress), marketData)), [a, scenario, stress, base]);
  return (
    <ReadOnly.Provider value={readOnly}>
      <div className="model-bar">
        <div className="model-title">{toolbar}</div>
        <label className="scenario">{tr(S.scenario, lang)}
          <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
            <option value="base">{tr(S.base, lang)}</option>
            <option value="S1">{tr(S.s1, lang)}</option>
            <option value="S2">{tr(S.s2, lang)}</option>
            <option value="S3">{tr(S.s3, lang)}</option>
            <option value="S4">{tr(S.s4, lang)}</option>
          </select>
        </label>
      </div>
      <div className={`layout${readOnly ? ' readonly' : ''}`}>
        <AssumptionsPanel a={a} d={defaults} lang={lang} onChange={readOnly || !onChange ? () => undefined : onChange} />
        <div className="right">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{tr(S[t.t], lang)}</button>
            ))}
          </nav>
          <Results a={a} md={marketData} r={r} base={base} scenario={scenario} lang={lang} tab={tab} stress={stress} setStress={setStress} projectName={a.project.name} />
        </div>
      </div>
    </ReadOnly.Provider>
  );
}

export { defaultStress };
