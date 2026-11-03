import React, { useEffect, useMemo, useState } from 'react';
import { defaultAssumptions } from '../../engine/defaults';
import { marketData } from '../../engine/data';
import { run } from '../../engine/model';
import { useAuth } from '../auth';
import { go } from '../router';
import { createLink, createProject, deleteProject, listLinks, listProjects, revokeLink, type ProjectRow, type ShareLink } from '../supabase';
import { migrate } from '../ModelView';
import { num, pct } from '../format';
import type { Lang } from '../i18n';

const L = (lang: Lang, uk: string, en: string) => (lang === 'uk' ? uk : en);
const when = (iso: string) => new Date(iso).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
export const shareUrl = (token: string) => `${window.location.origin}${window.location.pathname}#/s/${token}`;

function ShareDialog({ p, lang, onClose }: { p: ProjectRow; lang: Lang; onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = () => listLinks(p.id).then(setLinks).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => { load(); }, [p.id]);
  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(shareUrl(t)); setCopied(t); } catch { setCopied(null); }
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={L(lang, 'Поділитися', 'Share')} onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <p className="oc-overline">{L(lang, 'Посилання тільки для перегляду', 'View-only links')}</p>
        <h3>{p.name}</h3>
        <p className="muted small">{L(lang, 'Будь-хто з посиланням бачить проєкт без входу, але не може його змінити чи скопіювати. Відкликане посилання перестає працювати одразу.', 'Anyone with the link sees the project without signing in but cannot change or copy it. A revoked link stops working at once.')}</p>
        {err && <p className="banner oc-bad">{err}</p>}
        <button className="btn-action" onClick={() => createLink(p.id).then((l) => { load(); copy(l.token); }).catch((e) => setErr(String(e.message ?? e)))}>
          {L(lang, 'Створити посилання', 'Create a link')}
        </button>
        {links && links.length > 0 && (
          <table className="oc-table compact">
            <thead><tr><th>{L(lang, 'Посилання', 'Link')}</th><th>{L(lang, 'Створено', 'Created')}</th><th>{L(lang, 'Стан', 'Status')}</th><th /></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.token}>
                  <td className="mono">…{l.token.slice(-8)}</td>
                  <td>{when(l.created_at)}</td>
                  <td className={l.revoked_at ? 'oc-muted' : 'oc-good'}>{l.revoked_at ? L(lang, 'відкликано', 'revoked') : L(lang, 'активне', 'active')}</td>
                  <td className="actions">
                    {!l.revoked_at && <button className="link" onClick={() => copy(l.token)}>{copied === l.token ? L(lang, 'Скопійовано', 'Copied') : L(lang, 'Копіювати', 'Copy')}</button>}
                    {!l.revoked_at && <button className="link danger" onClick={() => revokeLink(l.token).then(load)}>{L(lang, 'Відкликати', 'Revoke')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="btn-ghost" onClick={onClose}>{L(lang, 'Закрити', 'Close')}</button>
      </div>
    </div>
  );
}

export function Projects({ lang }: { lang: Lang }) {
  const { enabled, session, ready } = useAuth();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [share, setShare] = useState<ProjectRow | null>(null);
  const load = () => listProjects().then(setRows).catch((e) => setErr(String(e.message ?? e)));
  useEffect(() => {
    if (!ready) return;
    if (!enabled || !session) { go('login'); return; }
    load();
  }, [ready, enabled, session]);
  const irr = useMemo(() => new Map((rows ?? []).map((p) => [p.id, run(migrate(p.assumptions), marketData).kpis])), [rows]);

  const create = async (from?: ProjectRow) => {
    try {
      const a = from ? migrate(from.assumptions) : defaultAssumptions();
      const name = from ? `${from.name} (${L(lang, 'копія', 'copy')})` : L(lang, 'Новий проєкт', 'New project');
      a.project.name = name;
      const p = await createProject(name, a);
      go(`p/${p.id}`);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="oc-overline">{L(lang, 'Кабінет', 'Account')}</p>
          <h1>{L(lang, 'Мої проєкти', 'My projects')}</h1>
          {session && <p className="muted small">{session.user.email}</p>}
        </div>
        <button className="btn-action" onClick={() => create()}>{L(lang, 'Новий проєкт', 'New project')}</button>
      </div>
      {err && <p className="banner oc-bad">{err}</p>}
      {rows && rows.length === 0 && (
        <p className="muted">{L(lang, 'Проєктів ще немає. «Новий проєкт» створює копію еталонного проєкту 12 × 6.25 МВт SANY, яку можна змінювати.', 'No projects yet. "New project" creates a copy of the reference 12 × 6.25 MW SANY project for you to change.')}</p>
      )}
      {rows && rows.length > 0 && (
        <div className="table-scroll">
          <table className="oc-table">
            <thead><tr>
              <th>{L(lang, 'Проєкт', 'Project')}</th><th className="n">{L(lang, 'Потужність, МВт', 'Capacity, MW')}</th>
              <th className="n">{L(lang, 'IRR капіталу', 'Equity IRR')}</th><th className="n">{L(lang, 'CAPEX, млн €', 'CAPEX, EUR m')}</th>
              <th>{L(lang, 'Змінено', 'Updated')}</th><th />
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const k = irr.get(p.id);
                const a = migrate(p.assumptions);
                return (
                  <tr key={p.id}>
                    <td><a href={`#/p/${p.id}`}>{p.name}</a></td>
                    <td className="n">{num(a.project.turbines * a.project.turbineMW, 1)}</td>
                    <td className="n">{k ? pct(k.equityIrr, 1) : '–'}</td>
                    <td className="n">{k ? num(k.capexExVat / 1e6, 1) : '–'}</td>
                    <td>{when(p.updated_at)}</td>
                    <td className="actions">
                      <button className="link" onClick={() => setShare(p)}>{L(lang, 'Поділитися', 'Share')}</button>
                      <button className="link" onClick={() => create(p)}>{L(lang, 'Дублювати', 'Duplicate')}</button>
                      <button className="link danger" onClick={() => {
                        if (window.confirm(L(lang, `Видалити «${p.name}»? Посилання на нього перестануть працювати.`, `Delete "${p.name}"? Its links will stop working.`))) deleteProject(p.id).then(load).catch((e) => setErr(String(e.message ?? e)));
                      }}>{L(lang, 'Видалити', 'Delete')}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {share && <ShareDialog p={share} lang={lang} onClose={() => setShare(null)} />}
    </div>
  );
}
