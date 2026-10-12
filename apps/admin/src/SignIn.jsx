import React, { useState } from 'react';
import { supabase, friendlyError } from './supabase';

// Email → 6-digit code, same flow as the mobile apps. Admin access is checked after sign-in.
export default function SignIn() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return setErr('Enter a valid email address.');
    setBusy(true); setErr(null);
    // shouldCreateUser: false — the dashboard never creates accounts.
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) return setErr(/signups not allowed|not found/i.test(error.message) ? 'No Poultry360 account uses this email. Sign up in the app first.' : friendlyError(error));
    setEmail(clean); setStep('code');
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setBusy(false);
    if (error) { setCode(''); setErr(/expired/i.test(error.message) ? 'This code has expired. Request a new one.' : "That code doesn't match."); }
  };

  return (
    <div className="center">
      <form className="auth" onSubmit={step === 'email' ? send : verify}>
        <div className="mark" />
        <p className="eyebrow">Poultry360 Ops</p>
        {step === 'email' ? <>
          <h1>Sign in</h1>
          <p className="muted">We'll email you a 6-digit code.</p>
          <input className="input" type="email" autoFocus autoComplete="email" placeholder="you@example.com" value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(null); }} aria-label="Email address" />
          {err ? <p className="error">{err}</p> : null}
          <button className="btn primary" disabled={busy || !email}>{busy ? 'Sending…' : 'Send code'}</button>
        </> : <>
          <h1>Enter the code</h1>
          <p className="muted">Sent to <strong>{email}</strong>. Check spam if it isn't in your inbox.</p>
          <input className="input mono otp" inputMode="numeric" autoFocus autoComplete="one-time-code" placeholder="••••••" maxLength={6} value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }} aria-label="6-digit code" />
          {err ? <p className="error">{err}</p> : null}
          <button className="btn primary" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
          <div className="row between small">
            <button type="button" className="link" onClick={() => { setStep('email'); setCode(''); setErr(null); }}>Use another email</button>
            <button type="button" className="link" onClick={() => send()}>Resend code</button>
          </div>
        </>}
      </form>
    </div>
  );
}
