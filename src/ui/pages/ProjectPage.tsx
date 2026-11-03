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

/** The open tool without an account: the project lives in this browser. */
export function ToolPage({ lang }: { lang: Lang }) {
  const KEY = 'octopus-wind:tool';
  const { enabled, session } = useAuth();
  const [a, setA] = useState<Assumptions>(() => {
    try {
      const s = localStorage.getItem(KEY) ?? localStorage.getItem('octopus-wind:v4');
      if (s) { const j = JSON.parse(s); return migrate(j.a ?? j); }
    } catch { /* storage unavailable */ }
    return migrate({} as Assumptions);
  });
  const [stress, setStress] = useState<StressSizes>(defaultStress);
  useEffect(() => {
    const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage unavailable */ } }, 500);
    return () => clearTimeout(t);
  }, [a]);
  return (
    <ModelView a={a} onChange={setA} lang={lang} stress={stress} setStress={setStress}
      toolbar={(
        <>
          <b>{a.project.name}</b>
          {enabled && !session && <span className="muted small">{L(lang, 'Зміни зберігаються лише в цьому браузері.', 'Changes are kept in this browser only.')} <a className="link" href="#/login/signup">{L(lang, 'Створіть акаунт', 'Create an account')}</a>{L(lang, ', щоб зберігати проєкти.', ' to save projects.')}</span>}
          {enabled && session && (
            <button className="btn-ghost small-btn" onClick={() => createProject(a.project.name, a).then((p) => go(`p/${p.id}`))}>
              {L(lang, 'Зберегти в кабінет', 'Save to my projects')}
            </button>
          )}
        </>
      )} />
  );
}
