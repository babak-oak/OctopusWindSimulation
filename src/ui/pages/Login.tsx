import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { passwordOk, useAuth } from '../auth';
import { go } from '../router';
import type { Lang } from '../i18n';

const L = (lang: Lang, uk: string, en: string) => (lang === 'uk' ? uk : en);
type Step = 'form' | 'code' | 'newPassword';

export function Login({ lang, mode }: { lang: Lang; mode: 'signin' | 'signup' | 'reset' }) {
  const { enabled, session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => {
    if (session && step === 'form' && mode !== 'reset') go('projects');
  }, [session, step, mode]);

  if (!enabled || !supabase) {
    return (
      <div className="narrow">
        <h1>{L(lang, 'Кабінет ще не підключено', 'Accounts are not connected yet')}</h1>
        <p className="muted">{L(lang, 'Модель працює без входу: проєкт зберігається у вашому браузері.', 'The model works without signing in: your project is kept in this browser.')}</p>
        <a className="btn-action" href="#/tool">{L(lang, 'Відкрити модель', 'Open the model')}</a>
      </div>
    );
  }
  const sb = supabase;

  const fail = (e: unknown) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') return run(async () => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      go('projects');
    });
    if (mode === 'signup') {
      if (!passwordOk(password)) return setMsg({ kind: 'err', text: L(lang, 'Пароль — щонайменше 10 символів.', 'The password needs at least 10 characters.') });
      return run(async () => {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setStep('code');
        setMsg({ kind: 'ok', text: L(lang, `Ми надіслали 6-значний код на ${email}. Він дійсний 10 хвилин.`, `We sent a 6-digit code to ${email}. It is valid for 10 minutes.`) });
      });
    }
    return run(async () => {
      const { error } = await sb.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setStep('code');
      setMsg({ kind: 'ok', text: L(lang, `Якщо акаунт з ${email} існує, ми надіслали на нього код.`, `If an account with ${email} exists, we sent a code to it.`) });
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: mode === 'reset' ? 'recovery' : 'signup' });
      if (error) throw error;
      if (mode === 'reset') { setStep('newPassword'); setMsg(null); } else go('projects');
    });
  };

  const resend = () => run(async () => {
    const { error } = mode === 'reset' ? await sb.auth.resetPasswordForEmail(email) : await sb.auth.resend({ type: 'signup', email });
    if (error) throw error;
    setMsg({ kind: 'ok', text: L(lang, 'Новий код надіслано.', 'A new code has been sent.') });
  });

  const setNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordOk(password)) return setMsg({ kind: 'err', text: L(lang, 'Пароль — щонайменше 10 символів.', 'The password needs at least 10 characters.') });
    run(async () => {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      go('projects');
    });
  };

  const title = mode === 'signin' ? L(lang, 'Вхід', 'Sign in') : mode === 'signup' ? L(lang, 'Реєстрація', 'Create an account') : L(lang, 'Відновлення пароля', 'Reset password');
  return (
    <div className="narrow auth">
      {mode !== 'reset' && (
        <nav className="seg auth-tabs" aria-label={title}>
          <a href="#/login" aria-current={mode === 'signin' ? 'page' : undefined}>{L(lang, 'Вхід', 'Sign in')}</a>
          <a href="#/login/signup" aria-current={mode === 'signup' ? 'page' : undefined}>{L(lang, 'Реєстрація', 'Create account')}</a>
        </nav>
      )}
      <h1>{title}</h1>
      {msg && <p className={`banner ${msg.kind === 'ok' ? 'oc-good' : 'oc-bad'}`} role="status">{msg.text}</p>}

      {step === 'form' && (
        <form onSubmit={submit} className="form">
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {mode !== 'reset' && (
            <label>{L(lang, 'Пароль', 'Password')}
              <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {mode === 'signup' && <p className="muted small">{L(lang, 'Щонайменше 10 символів. Після реєстрації ми надішлемо код підтвердження на пошту.', 'At least 10 characters. We will email you a confirmation code.')}</p>}
          <button className="btn-action" disabled={busy}>{mode === 'signin' ? L(lang, 'Увійти', 'Sign in') : mode === 'signup' ? L(lang, 'Зареєструватися', 'Create account') : L(lang, 'Надіслати код', 'Send code')}</button>
          {mode === 'signin' && <a className="link" href="#/login/reset">{L(lang, 'Забули пароль?', 'Forgot your password?')}</a>}
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="form">
          <label>{L(lang, 'Код з листа', 'Code from the email')}
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="code" />
          </label>
          <button className="btn-action" disabled={busy || code.length !== 6}>{L(lang, 'Підтвердити', 'Confirm')}</button>
          <button type="button" className="link" disabled={busy} onClick={resend}>{L(lang, 'Надіслати код ще раз', 'Send the code again')}</button>
        </form>
      )}

      {step === 'newPassword' && (
        <form onSubmit={setNew} className="form">
          <label>{L(lang, 'Новий пароль', 'New password')}<input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn-action" disabled={busy}>{L(lang, 'Зберегти пароль', 'Save password')}</button>
        </form>
      )}
    </div>
  );
}
