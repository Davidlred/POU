import React, { useEffect, useState } from 'react';
import { View, ScrollView, TextInput, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { normalizeEmail, pad } from './format';
import { Screen, Txt, Input, Button, Banner, OtpBoxes, AppBar, Icon, MAX_FONT_SCALE } from './ui';
import { useTheme } from './ThemeProvider';
import { Logo } from './Intro';

// How sign-in works
//   New account:  email → 6-digit code (proves the email is theirs) → create a password → in.
//   Returning:    email + password.
//   Forgot it:    email → code → choose a new password.
// Accounts made before passwords existed are asked to create one the next time the app opens.
// "Has a password" is recorded in the user's metadata (has_password) when it is set.

const LOCK_KEY = 'p360-otp-lock';

// ---------- Password gate ----------
// forced = the signed-in user must choose a new password before going on (forgot-password flow, or "Change password").
let forced = false;
const gateSubs = new Set();
const setForced = (v) => { forced = v; gateSubs.forEach((f) => f(v)); };
export const startPasswordChange = () => setForced(true);

// What the app should show instead of its normal screens: 'create', 'change', or null (carry on).
export function usePasswordGate(session) {
  const [f, setF] = useState(forced);
  useEffect(() => { gateSubs.add(setF); setF(forced); return () => { gateSubs.delete(setF); }; }, []);
  if (!session) return null;
  if (!session.user?.user_metadata?.has_password) return 'create';
  return f ? 'change' : null;
}

// What is still wrong with a new password, in plain words (null = fine). Exported so it can be tested.
export function passwordProblem(pw, again) {
  if ((pw || '').length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include at least one letter and one number.';
  if (pw !== again) return "The two passwords don't match.";
  return null;
}

const authError = (e) => {
  const m = (e && e.message) || '';
  if (/invalid login credentials/i.test(m)) return "That email and password don't match. If you haven't set a password yet, tap “Forgot password, or never set one?” below.";
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: tap “Forgot password, or never set one?” to get a code.';
  if (/signups not allowed|user not found/i.test(m)) return "We couldn't find an account with that email.";
  if (/different from the old|same as the old|should be different/i.test(m)) return 'Choose a password you have not used on this account before.';
  if (/reauth|nonce|recently/i.test(m)) return 'For your security, sign out, then use “Forgot password” to set a new one with a code.';
  if (/weak|pwned|characters/i.test(m)) return 'That password is too easy to guess. Try a longer one.';
  if (/rate|too many/i.test(m) || e?.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/network|fetch/i.test(m)) return "You're offline. Check your connection and try again.";
  return m || 'Something went wrong. Please try again.';
};

// Sign-in content sits as one block in the middle of the screen; scrolls if the keyboard squeezes it.
const CENTERED = { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 64, gap: 18, width: '100%', maxWidth: 460, alignSelf: 'center' };

// Small Poultry360 egg mark (matches the splash) to anchor the sign-in screens.
function AuthMark() {
  return <View style={{ marginBottom: 6 }}><Logo full size={150} /></View>;
}

function Heading({ title, subtitle }) {
  return (
    <View style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <Txt v="display" style={{ textAlign: 'center' }}>{title}</Txt>
      {subtitle ? <Txt v="small" style={{ fontSize: 15, lineHeight: 22, textAlign: 'center' }}>{subtitle}</Txt> : null}
    </View>
  );
}

// Password box with a show / hide eye.
function PasswordField({ label, value, onChangeText, error, autoFocus, newPassword, onSubmitEditing, placeholder }) {
  const { c, f } = useTheme();
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="strong" style={{ fontSize: 13 }}>{label}</Txt> : null}
      <View style={{ minHeight: 54, borderRadius: 16, backgroundColor: error ? c.errbg : c.sf, borderWidth: focus || error ? 2 : 1, borderColor: error ? c.err : focus ? c.ember : c.line2, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 }}>
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE} value={value} onChangeText={onChangeText} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} autoFocus={autoFocus}
          autoComplete={newPassword ? 'new-password' : 'current-password'} textContentType={newPassword ? 'newPassword' : 'password'} placeholder={placeholder} placeholderTextColor={c.mute}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onSubmitEditing={onSubmitEditing} returnKeyType="done" accessibilityLabel={label || 'Password'}
          style={{ flex: 1, color: c.ink, fontFamily: f.medium, fontSize: 15, paddingVertical: 12 }} />
        <Pressable onPress={() => setShow(!show)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.mute} />
        </Pressable>
      </View>
      {error ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="alert-circle" size={16} color={c.err} /><Txt v="small" color={c.err} style={{ flex: 1 }}>{error}</Txt></View> : null}
    </View>
  );
}

// Returning users: email + password. Links out to "create account" and "forgot password" (both go through a code).
export function SignInScreen({ onCreate, onForgot, title = 'Welcome back', subtitle = 'Sign in with your email and password.', createLabel = 'New here? Create an account' }) {
  const { c } = useTheme();
  const [raw, setRaw] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    const email = normalizeEmail(raw);
    if (!email) return setErr('Enter a valid email, e.g. ada@example.com');
    if (!pw) return setErr('Enter your password.');
    setErr(null); setBusy(true);
    setForced(false);   // a normal sign-in is never a leftover "choose a new password"
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setPw(''); setErr(authError(error)); }
    // On success the session listener in the app takes over; nothing to navigate here.
  };
  return (
    <Screen scroll style={CENTERED}>
      <AuthMark />
      <Heading title={title} subtitle={subtitle} />
      <Input label="Email" placeholder="ada@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
        value={raw} onChangeText={(t) => { setRaw(t); setErr(null); }} accessibilityLabel="Email address" />
      <PasswordField label="Password" value={pw} onChangeText={(t) => { setPw(t); setErr(null); }} onSubmitEditing={signIn} />
      {err ? <Banner tone="err" body={err} /> : null}
      <Button title="Sign in" onPress={signIn} loading={busy} />
      <Txt v="bold" color={c.acc} onPress={() => onForgot?.(normalizeEmail(raw) || '')} style={{ textAlign: 'center', fontSize: 14, paddingVertical: 8 }}>Forgot password, or never set one?</Txt>
      {onCreate ? <Button variant="outline" title={createLabel} onPress={onCreate} /> : null}
    </Screen>
  );
}

// Email entry (default / invalid format / rate-limited). Supabase emails a 6-digit code.
// mode 'signup' creates the account if it is new; mode 'reset' is for an existing account and leads to choosing a new password.
export function EmailScreen({ onSent, onBack, mode = 'signup', initialEmail = '', title, subtitle, footer }) {
  const reset = mode === 'reset';
  const [raw, setRaw] = useState(initialEmail);
  const [err, setErr] = useState(null);
  const [limited, setLimited] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const email = normalizeEmail(raw);
    if (!email) return setErr('Enter a valid email, e.g. ada@example.com');
    setErr(null); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: !reset } });
    setBusy(false);
    if (error) {
      if (error.status === 429 || /rate/i.test(error.message)) return setLimited(true);
      return setErr(authError(error));
    }
    setForced(reset);   // after the code, a reset goes on to "choose a new password"
    onSent(email);
  };
  const body = (
    <>
      <AuthMark />
      <Heading title={title || (reset ? 'Reset your password' : "What's your email?")} subtitle={subtitle || (reset ? "We'll email you a 6-digit code, then you can choose a new password." : "We'll email you a 6-digit code to confirm it's you, then you'll create a password.")} />
      {limited ? <Banner tone="warn" icon="timer-sand" title="Too many code requests" body="Please wait a few minutes before asking for another code." /> : null}
      <Input placeholder="ada@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
        value={raw} onChangeText={(t) => { setRaw(t); setErr(null); }} error={err} autoFocus accessibilityLabel="Email address" />
      <Button title="Send code" onPress={send} loading={busy} disabled={!raw} />
      {footer}
    </>
  );
  if (!onBack) return <Screen scroll style={CENTERED}>{body}</Screen>;
  return (
    <Screen pad={false}>
      <AppBar onBack={onBack} />
      <ScrollView contentContainerStyle={CENTERED} keyboardShouldPersistTaps="handled">{body}</ScrollView>
    </Screen>
  );
}

// Create or change the password. Shown in place of the app while usePasswordGate() returns 'create' or 'change'.
// It sits outside the navigator, so it uses no navigation.
export function PasswordScreen({ mode = 'create', email }) {
  const { c } = useTheme();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const creating = mode === 'create';
  const problem = passwordProblem(pw, again);
  const save = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { has_password: true } });
    setBusy(false);
    if (error) return setErr(authError(error));
    setForced(false);   // the updated session (has_password) lets the app through
  };
  const leave = () => { if (creating) { setForced(false); supabase.auth.signOut(); } else setForced(false); };
  const rule = (ok, text) => (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Icon name={ok ? 'check-circle' : 'circle-outline'} size={18} color={ok ? c.sage : c.mute} /><Txt v="small" color={ok ? c.ink : c.mute} style={{ fontSize: 14 }}>{text}</Txt>
    </View>
  );
  return (
    <Screen scroll style={CENTERED}>
      <AuthMark />
      <Heading title={creating ? 'Create a password' : 'Choose a new password'}
        subtitle={creating ? "Your email is confirmed. Next time you'll sign in with " + (email || 'your email') + ' and this password.' : 'This replaces the password for ' + (email || 'your account') + '.'} />
      <PasswordField label={creating ? 'Password' : 'New password'} value={pw} onChangeText={(t) => { setPw(t); setErr(null); }} newPassword autoFocus />
      <PasswordField label="Type it again" value={again} onChangeText={(t) => { setAgain(t); setErr(null); }} newPassword onSubmitEditing={save} error={tried && pw.length >= 8 && again && pw !== again ? "The two passwords don't match." : null} />
      <View style={{ gap: 6 }}>
        {rule(pw.length >= 8, 'At least 8 characters')}
        {rule(/[A-Za-z]/.test(pw) && /\d/.test(pw), 'A letter and a number')}
        {rule(!!pw && pw === again, 'Both boxes match')}
      </View>
      {err ? <Banner tone="err" body={err} /> : tried && problem ? <Txt v="small" color={c.err} style={{ fontSize: 14, textAlign: 'center' }}>{problem}</Txt> : null}
      <Button title={creating ? 'Save password and continue' : 'Save new password'} onPress={save} loading={busy} />
      <Button variant="ghost" title={creating ? 'Sign out' : 'Cancel'} onPress={leave} />
    </Screen>
  );
}

// OTP entry (waiting / sent / wrong code / expired / cooldown / 3-strike lockout)
export function OtpScreen({ email, onVerified, onEdit }) {
  const { c } = useTheme();
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [fails, setFails] = useState(0);
  const [cool, setCool] = useState(30);
  const [lockUntil, setLockUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => { AsyncStorage.getItem(LOCK_KEY).then((v) => v && setLockUntil(Number(v))); }, []);
  useEffect(() => { const t = setInterval(() => { setCool((x) => (x > 0 ? x - 1 : 0)); tick((x) => x + 1); }, 1000); return () => clearInterval(t); }, []);

  const locked = lockUntil > Date.now();
  const left = Math.max(0, Math.round((lockUntil - Date.now()) / 1000));

  const verify = async (value = code) => {
    if (value.length !== 6 || locked) return;
    setBusy(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: value, type: 'email' });
    setBusy(false);
    if (error) {
      const n = fails + 1; setFails(n); setCode('');
      if (n >= 3) { const until = Date.now() + 15 * 60 * 1000; setLockUntil(until); AsyncStorage.setItem(LOCK_KEY, String(until)); setErr(null); return; }
      return setErr(/expired/i.test(error.message) ? 'This code has expired. Request a new one.' : "That code doesn't match. " + (3 - n) + ' attempt' + (3 - n === 1 ? '' : 's') + ' left.');
    }
    AsyncStorage.removeItem(LOCK_KEY);
    onVerified?.(data.session);
  };
  const resend = async () => { setCool(30); setErr(null); await supabase.auth.signInWithOtp({ email }); };

  return (
    <Screen pad={false}>
      <AppBar onBack={onEdit} />
      <ScrollView contentContainerStyle={CENTERED} keyboardShouldPersistTaps="handled">
        <AuthMark />
        <View style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <Txt v="display" style={{ textAlign: 'center' }}>Enter the code</Txt>
          <Txt v="small" style={{ fontSize: 15, textAlign: 'center' }}>Sent to <Txt v="strong" style={{ fontSize: 15 }}>{email}</Txt></Txt>
        </View>
        {locked ? <Banner tone="err" icon="lock-clock" title="Sign-in paused for your security" body={'Too many incorrect codes. Try again in ' + pad(Math.floor(left / 60)) + ':' + pad(left % 60) + '.'} />
          : <OtpBoxes value={code} error={!!err} onChange={(v) => { setCode(v); setErr(null); if (v.length === 6) verify(v); }} />}
        {err ? <Txt v="small" color={c.err} style={{ fontSize: 14 }}>{err}</Txt> : !locked ? <Banner tone="ok" icon="email-check-outline" body="Code sent by email. Check your spam folder if it isn't in your inbox." /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="small" style={{ fontSize: 14 }}>Didn't get it?</Txt>
          {cool > 0 ? <Txt v="mono" color={c.mute} style={{ fontSize: 14 }}>Resend in 0:{pad(cool)}</Txt>
            : <Txt v="bold" color={c.acc} onPress={resend} style={{ fontSize: 14 }}>Resend code</Txt>}
        </View>
        <Button title="Verify" onPress={() => verify()} loading={busy} disabled={code.length !== 6 || locked} />
      </ScrollView>
    </Screen>
  );
}
