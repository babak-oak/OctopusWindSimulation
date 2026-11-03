import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { useRoute } from './router';
import { supabase } from './supabase';
import { S, tr, type Lang } from './i18n';
import { Landing } from './pages/Landing';
import { Contacts } from './pages/Contacts';
import { Login } from './pages/Login';
import { Projects } from './pages/Projects';
import { ProjectPage, SharedPage, ToolPage } from './pages/ProjectPage';

const PREFS = 'octopus-wind:prefs';
type Prefs = { lang: Lang; theme: 'dark' | 'light' };
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null') as Prefs | null;
    if (p) return p;
    const old = JSON.parse(localStorage.getItem('octopus-wind:v4') ?? 'null') as Partial<Prefs> | null;
    return { lang: old?.lang ?? 'uk', theme: old?.theme ?? 'dark' };
  } catch {
    return { lang: 'uk', theme: 'dark' };
  }
}

function Shell() {
  const route = useRoute();
  const { enabled, session } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const { lang, theme } = prefs;
  const L = (uk: string, en: string) => (lang === 'uk' ? uk : en);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
  }, [prefs]);

  return (
    <div className="oc app">
      <header className="topbar">
        <a className="brand" href="#/">
          <p className="oc-overline">Octopus Capital</p>
          <span className="brand-name">{tr(S.app, lang)}</span>
        </a>
        <nav className="main-nav" aria-label={L('Розділи', 'Sections')}>
          <a href="#/tool" aria-current={route.page === 'tool' ? 'page' : undefined}>{L('Модель', 'Model')}</a>
          {enabled && session && <a href="#/projects" aria-current={route.page === 'projects' || route.page === 'project' ? 'page' : undefined}>{L('Мої проєкти', 'My projects')}</a>}
          <a href="#/contacts" aria-current={route.page === 'contacts' ? 'page' : undefined}>{L('Контакти', 'Contacts')}</a>
          {enabled && !session && <a href="#/login" aria-current={route.page === 'login' ? 'page' : undefined}>{L('Увійти', 'Sign in')}</a>}
          {enabled && session && <button className="link" onClick={() => supabase?.auth.signOut().then(() => { window.location.hash = '#/'; })}>{L('Вийти', 'Sign out')}</button>}
        </nav>
        <div className="controls">
          <div className="seg" role="group" aria-label="Language">
            <button aria-pressed={lang === 'uk'} onClick={() => setPrefs({ ...prefs, lang: 'uk' })}>UA</button>
            <button aria-pressed={lang === 'en'} onClick={() => setPrefs({ ...prefs, lang: 'en' })}>EN</button>
          </div>
          <div className="seg" role="group" aria-label={tr(S.theme, lang)}>
            <button aria-pressed={theme === 'dark'} onClick={() => setPrefs({ ...prefs, theme: 'dark' })}>{tr(S.dark, lang)}</button>
            <button aria-pressed={theme === 'light'} onClick={() => setPrefs({ ...prefs, theme: 'light' })}>{tr(S.light, lang)}</button>
          </div>
        </div>
      </header>
      <hr className="oc-rule" />
      {route.page === 'home' && <Landing lang={lang} theme={theme} />}
      {route.page === 'tool' && <ToolPage lang={lang} />}
      {route.page === 'contacts' && <Contacts lang={lang} />}
      {route.page === 'login' && <Login lang={lang} mode={route.mode} key={route.mode} />}
      {route.page === 'projects' && <Projects lang={lang} />}
      {route.page === 'project' && <ProjectPage id={route.id} lang={lang} key={route.id} />}
      {route.page === 'share' && <SharedPage token={route.token} lang={lang} />}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
