import React, { useEffect, useRef, useState } from 'react';
import type { Assumptions } from '../../engine/types';
import type { StressSizes } from '../../engine/scenarios';
import { ModelView, defaultStress, migrate } from '../ModelView';
import { ENGINE_VERSION, createProject, getProject, getShared, saveProject } from '../supabase';
import { useAuth } from '../auth';
import { go } from '../router';
import type { Lang } from '../i18n';

const L = (lang: Lang, uk: string, en: string) => (lang === 'uk' ? uk : en);

/** A saved project: loads from the account and saves automatically 2 s after the last change. */
export function ProjectPage({ id, lang }: { id: string; lang: Lang }) {
  const { ready, session } = useAuth();
  const [a, setA] = useState<Assumptions | null>(null);
  const [name, setName] = useState('');
  const [stress, setStress] = useState<StressSizes>(defaultStress);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const [note, setNote] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!ready) return;
    if (!session) { go('login'); return; }
    getProject(id).then((p) => {
      setA(migrate(p.assumptions));
      setName(p.name);
      if (p.engine_version !== ENGINE_VERSION) {
        setNote(L(lang, `Проєкт збережено версією моделі ${p.engine_version}; результати перераховано поточною (${ENGINE_VERSION}).`, `Saved with model version ${p.engine_version}; results are recalculated with the current one (${ENGINE_VERSION}).`));
      }
    }).catch(() => setNote(L(lang, 'Проєкт не знайдено або він вам недоступний.', 'Project not found or not available to you.')));
  }, [id, ready, session]);

  useEffect(() => {
    if (!a) return;
    if (first.current) { first.current = false; return; }
    setStatus('dirty');
    const t = setTimeout(() => {
      setStatus('saving');
      saveProject(id, name || a.project.name, { ...a, project: { ...a.project, name: name || a.project.name } })
        .then(() => setStatus('saved')).catch(() => setStatus('error'));
    }, 2000);
    return () => clearTimeout(t);
  }, [a, name]);

  if (!a) return <div className="page">{note ? <p className="banner oc-bad">{note}</p> : <p className="muted">{L(lang, 'Завантажую…', 'Loading…')}</p>}</div>;
  const label = { saved: L(lang, 'Збережено', 'Saved'), saving: L(lang, 'Зберігаю…', 'Saving…'), dirty: L(lang, 'Є зміни', 'Unsaved changes'), error: L(lang, 'Не вдалося зберегти', 'Could not save') }[status];
  return (
    <>
      {note && <p className="banner oc-caution page-banner">{note}</p>}
      <ModelView a={a} onChange={setA} lang={lang} stress={stress} setStress={setStress}
        toolbar={(
          <>
            <a className="link" href="#/projects">← {L(lang, 'Мої проєкти', 'My projects')}</a>
            <input className="title-input" aria-label={L(lang, 'Назва проєкту', 'Project name')} value={name} maxLength={120}
              onChange={(e) => { setName(e.target.value); setA({ ...a, project: { ...a.project, name: e.target.value } }); }} />
            <span className={`save-status ${status === 'error' ? 'oc-bad' : 'muted'}`} role="status">{label}</span>
          </>
        )} />
    </>
  );
}

/** View-only page behind a share link. */
export function SharedPage({ token, lang }: { token: string; lang: Lang }) {
  const [a, setA] = useState<Assumptions | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stress, setStress] = useState<StressSizes>(defaultStress);
  useEffect(() => {
    getShared(token).then((p) => (p ? setA(migrate(p.assumptions)) : setErr(L(lang, 'Доступ закрито: посилання відкликане або не існує.', 'Access closed: the link was revoked or does not exist.'))))
      .catch(() => setErr(L(lang, 'Доступ закрито: посилання відкликане або не існує.', 'Access closed: the link was revoked or does not exist.')));
  }, [token]);
  if (err) return <div className="narrow"><h1>{err}</h1><a className="btn-action" href="#/">{L(lang, 'На головну', 'Home')}</a></div>;
  if (!a) return <div className="page"><p className="muted">{L(lang, 'Завантажую…', 'Loading…')}</p></div>;
  return (
    <ModelView a={a} lang={lang} readOnly stress={stress} setStress={setStress}
      toolbar={<><span className="badge-ro">{L(lang, 'Тільки перегляд', 'View only')}</span><b>{a.project.name}</b></>} />
  );
}

/** Shown when a visitor without an account tries to change a value on the open model. */
function SignUpPrompt({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="gate-title">{L(lang, 'Зареєструйтеся, щоб змінювати припущення', 'Create an account to change the assumptions')}</h3>
        <p>{L(lang,
          'Без акаунта модель показує еталонний проєкт: 12 турбін SANY по 6.25 МВт. Вкладки результатів і сценарії S1–S4 можна переглядати.',
          'Without an account the model shows the reference project: 12 SANY turbines of 6.25 MW. You can browse the result tabs and scenarios S1–S4.')}</p>
        <p>{L(lang,
          'Після реєстрації можна змінювати будь-які значення, рахувати власну ВЕС і зберігати проєкти в кабінеті.',
          'With an account you can change any value, model your own wind farm and save projects.')}</p>
        <div className="modal-actions">
          <a ref={first} className="btn-action" href="#/login/signup">{L(lang, 'Зареєструватися', 'Create an account')}</a>
          <a className="btn-ghost" href="#/login">{L(lang, 'Увійти', 'Sign in')}</a>
          <button className="link" onClick={onClose}>{L(lang, 'Закрити', 'Close')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The open model. Signed-in users (and builds without Supabase) edit freely and the project lives in this browser;
 * visitors without an account see the reference project and are asked to sign up on any change.
 */
export function ToolPage({ lang }: { lang: Lang }) {
  const KEY = 'octopus-wind:tool';
  const { enabled, session } = useAuth();
  const gated = enabled && !session;
  const [prompt, setPrompt] = useState(false);
  const [reference] = useState<Assumptions>(() => migrate({} as Assumptions));
  const [a, setA] = useState<Assumptions>(() => {
    try {
      const s = localStorage.getItem(KEY) ?? localStorage.getItem('octopus-wind:v4');
      if (s) { const j = JSON.parse(s); return migrate(j.a ?? j); }
    } catch { /* storage unavailable */ }
    return migrate({} as Assumptions);
  });
  const [stress, setStress] = useState<StressSizes>(defaultStress);
  useEffect(() => {
    if (gated) return;
    const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage unavailable */ } }, 500);
    return () => clearTimeout(t);
  }, [a, gated]);
  const shown = gated ? reference : a;
  return (
    <>
      <ModelView a={shown} onChange={setA} lang={lang} stress={gated ? defaultStress : stress} setStress={setStress}
        gate={gated ? () => setPrompt(true) : undefined}
        toolbar={(
          <>
            <b>{shown.project.name}</b>
            {gated && <span className="muted small">{L(lang, 'Ілюстративний розрахунок еталонного проєкту.', 'An illustrative run of the reference project.')} <a className="link" href="#/login/signup">{L(lang, 'Зареєструйтеся', 'Create an account')}</a>{L(lang, ', щоб змінювати припущення і зберігати проєкти.', ' to change the assumptions and save projects.')}</span>}
            {!enabled && <span className="muted small">{L(lang, 'Зміни зберігаються лише в цьому браузері.', 'Changes are kept in this browser only.')}</span>}
            {enabled && session && (
              <button className="btn-ghost small-btn" onClick={() => createProject(a.project.name, a).then((p) => go(`p/${p.id}`))}>
                {L(lang, 'Зберегти в кабінет', 'Save to my projects')}
              </button>
            )}
          </>
        )} />
      {prompt && <SignUpPrompt lang={lang} onClose={() => setPrompt(false)} />}
    </>
  );
}
