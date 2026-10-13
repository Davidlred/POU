import React, { useState } from 'react';
import { supabase, friendlyError } from './supabase';

// Same account and same rules as the mobile apps:
//   Sign in:      email + password.
//   First time,
//   or forgot it: email → 6-digit code → choose a password (SetPassword below).
// The dashboard never creates accounts (shouldCreateUser: false); admin access is checked after sign-in.

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// What is still wrong with a new password, in plain words (null = fine). Matches the apps.
export function passwordProblem(pw, again) {
  if ((pw || '').length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
  if (pw !== again) return "The two passwords don't match.";
  return null;
}

const authError = (e) => {
  const m = (e && e.message) || '';
  if (/invalid login credentials/i.test(m)) return "That email and password don't match. If you haven't set a password yet, use “Forgot password, or never set one?” below.";
  if (/signups not allowed|user not found/i.test(m)) return 'No Poultry360 account uses this email. Sign up in the app first.';
  if (/different from the old|same as the old|should be different/i.test(m)) return 'Choose a password you have not used on this account before.';
  if (/reauth|nonce|recently/i.test(m)) return 'For your security, sign out, then use “Forgot password” to set a new one with a code.';
  if (/weak|pwned|characters/i.test(m)) return 'That password is too easy to guess. Try a longer one.';
  if (/rate|too many/i.test(m) || e?.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  return friendlyError(e);
};

function PasswordInput({ value, onChange, placeholder, autoFocus, isNew, label }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input className="input" type={show ? 'text' : 'password'} autoFocus={autoFocus} autoComplete={isNew ? 'new-password' : 'current-password'} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <button type="button" className="pw-eye link" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

// onResetStarted: tells the app that after this code sign-in the user must choose a new password.
export default function SignIn({ onResetStarted }) {
  const [step, setStep] = useState('password');   // 'password' | 'email' | 'code'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = (s) => { setStep(s); setErr(null); setCode(''); };

  const signIn = async (e) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!validEmail(clean)) return setErr('Enter a valid email address.');
    if (!pw) return setErr('Enter your password.');
    setBusy(true); setErr(null);
    onResetStarted?.(false);
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password: pw });
    setBusy(false);
    if (error) { setPw(''); setErr(authError(error)); }
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!validEmail(clean)) return setErr('Enter a valid email address.');
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) return setErr(authError(error));
    setEmail(clean); setCode(''); setStep('code');
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true); setErr(null);
    onResetStarted?.(true);   // once the code is accepted, they go on to choose a password
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (error) { onResetStarted?.(false); setCode(''); setErr(/expired/i.test(error.message) ? 'This code has expired. Request a new one.' : "That code doesn't match."); }
  };

  return (
    <div className="center">
      <form className="auth" onSubmit={step === 'password' ? signIn : step === 'email' ? sendCode : verify}>
        <div className="mark" />
        <p className="eyebrow">Poultry360 Ops</p>
        {step === 'password' ? <>
          <h1>Sign in</h1>
          <p className="muted">Use your Poultry360 email and password.</p>
          <input className="input" type="email" autoFocus autoComplete="email" placeholder="you@example.com" value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(null); }} aria-label="Email address" />
          <PasswordInput value={pw} onChange={(v) => { setPw(v); setErr(null); }} placeholder="Password" label="Password" />
          {err ? <p className="error">{err}</p> : null}
          <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="link" onClick={() => go('email')}>Forgot password, or never set one?</button>
        </> : step === 'email' ? <>
          <h1>Set your password</h1>
          <p className="muted">We'll email you a 6-digit code, then you can choose a password.</p>
          <input className="input" type="email" autoFocus autoComplete="email" placeholder="you@example.com" value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(null); }} aria-label="Email address" />
          {err ? <p className="error">{err}</p> : null}
          <button className="btn primary" disabled={busy || !email}>{busy ? 'Sending…' : 'Send code'}</button>
          <button type="button" className="link" onClick={() => go('password')}>Back to sign in</button>
        </> : <>
          <h1>Enter the code</h1>
          <p className="muted">Sent to <strong>{email}</strong>. Check spam if it isn't in your inbox.</p>
          <input className="input mono otp" inputMode="numeric" autoFocus autoComplete="one-time-code" placeholder="••••••" maxLength={6} value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }} aria-label="6-digit code" />
          {err ? <p className="error">{err}</p> : null}
          <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
          <div className="row between small">
            <button type="button" className="link" onClick={() => go('email')}>Use another email</button>
            <button type="button" className="link" onClick={() => sendCode()}>Resend code</button>
          </div>
        </>}
      </form>
    </div>
  );
}

// Create or change the password. Shown in place of the dashboard while one is required.
// creating = this account has never had a password; otherwise it is a reset / change and can be cancelled.
export function SetPassword({ email, creating, onDone }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const problem = passwordProblem(pw, again);
  const save = async (e) => {
    e.preventDefault();
    setTried(true);
    if (problem) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } });
    setBusy(false);
    if (error) return setErr(authError(error));
    onDone();
  };
  const rule = (ok, text) => <li className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {text}</li>;
  return (
    <div className="center">
      <form className="auth" onSubmit={save}>
        <div className="mark" />
        <p className="eyebrow">Poultry360 Ops</p>
        <h1>{creating ? 'Create a password' : 'Choose a new password'}</h1>
        <p className="muted">{creating ? <>Next time you'll sign in with <strong>{email}</strong> and this password.</> : <>This replaces the password for <strong>{email}</strong>.</>}</p>
        <PasswordInput value={pw} onChange={(v) => { setPw(v); setErr(null); }} placeholder={creating ? 'Password' : 'New password'} label="New password" autoFocus isNew />
        <PasswordInput value={again} onChange={(v) => { setAgain(v); setErr(null); }} placeholder="Type it again" label="Type it again" isNew />
        <ul className="rules">
          {rule(pw.length >= 8, 'At least 8 characters')}
          {rule(/[A-Za-z]/.test(pw) && /\d/.test(pw), 'A letter and a number')}
          {rule(!!pw && pw === again, 'Both boxes match')}
        </ul>
        {err ? <p className="error">{err}</p> : tried && problem ? <p className="error">{problem}</p> : null}
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : creating ? 'Save password and continue' : 'Save new password'}</button>
        <button type="button" className="btn ghost" onClick={() => (creating ? supabase.auth.signOut() : onDone())}>{creating ? 'Sign out' : 'Cancel'}</button>
      </form>
    </div>
  );
}
