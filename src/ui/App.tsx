import React, { useEffect, useMemo, useState } from 'react';
import type { Assumptions } from '../engine/types';
import { defaultAssumptions } from '../engine/defaults';
import { marketData } from '../engine/data';
import { run } from '../engine/model';
import { applyScenario, defaultStress, type ScenarioId, type StressSizes } from '../engine/scenarios';
import { AssumptionsPanel } from './Assumptions';
import { Results, TABS, type Tab } from './Results';
import { S, tr, type Lang } from './i18n';

const KEY = 'octopus-wind:v2';
type Saved = { a: Assumptions; lang: Lang; theme: 'dark' | 'light'; stress: StressSizes };

function load(): Partial<Saved> {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Partial<Saved>) : {};
  } catch {
    return {};
  }
}

export function App() {
  const defaults = useMemo(() => defaultAssumptions(), []);
  const saved = useMemo(load, []);
  const [a, setA] = useState<Assumptions>(() => (saved.a && saved.a.project?.reference ? saved.a : defaultAssumptions()));
  const [lang, setLang] = useState<Lang>(saved.lang ?? 'uk');
  const [theme, setTheme] = useState<'dark' | 'light'>(saved.theme ?? 'dark');
  const [stress, setStress] = useState<StressSizes>(saved.stress ?? defaultStress);
  const [scenario, setScenario] = useState<ScenarioId>('base');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);
  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ a, lang, theme, stress })); } catch { /* storage unavailable */ }
    }, 500);
    return () => clearTimeout(id);
  }, [a, lang, theme, stress]);

  const base = useMemo(() => run(a, marketData), [a]);
  const r = useMemo(() => (scenario === 'base' ? base : run(applyScenario(a, scenario, stress), marketData)), [a, scenario, stress, base]);
  const projectName = a.project.name;

  return (
    <div className="oc app">
      <header className="topbar">
        <div className="brand">
          <p className="oc-overline">Octopus Capital</p>
          <h1>{tr(S.app, lang)} · {projectName}</h1>
        </div>
        <div className="controls">
          <label>{tr(S.scenario, lang)}
            <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
              <option value="base">{tr(S.base, lang)}</option>
              <option value="S1">{tr(S.s1, lang)}</option>
              <option value="S2">{tr(S.s2, lang)}</option>
              <option value="S3">{tr(S.s3, lang)}</option>
              <option value="S4">{tr(S.s4, lang)}</option>
            </select>
          </label>
          <div className="seg" role="group" aria-label="Language">
            <button aria-pressed={lang === 'uk'} onClick={() => setLang('uk')}>UA</button>
            <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          </div>
          <div className="seg" role="group" aria-label={tr(S.theme, lang)}>
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>{tr(S.dark, lang)}</button>
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>{tr(S.light, lang)}</button>
          </div>
        </div>
      </header>
      <hr className="oc-rule" />
      <div className="layout">
        <AssumptionsPanel a={a} d={defaults} lang={lang} onChange={setA} />
        <div className="right">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{tr(S[t.t], lang)}</button>
            ))}
          </nav>
          <Results a={a} md={marketData} r={r} base={base} scenario={scenario} lang={lang} tab={tab} stress={stress} setStress={setStress} projectName={projectName} />
        </div>
      </div>
    </div>
  );
}
