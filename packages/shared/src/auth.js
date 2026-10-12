import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { normalizeEmail, pad } from './format';
import { Screen, Txt, Input, Button, Banner, OtpBoxes, AppBar } from './ui';
import { useTheme } from './ThemeProvider';

const LOCK_KEY = 'p360-otp-lock';

// Email entry (default / invalid format / rate-limited). Supabase emails a 6-digit code.
export function EmailScreen({ onSent, title = "What's your email?", subtitle = "We'll email you a 6-digit code to confirm it's you.", footer }) {
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState(null);
  const [limited, setLimited] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const email = normalizeEmail(raw);
    if (!email) return setErr('Enter a valid email, e.g. ada@example.com');
    setErr(null); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      if (error.status === 429 || /rate/i.test(error.message)) return setLimited(true);
      return setErr(error.message);
    }
    onSent(email);
  };
  return (
    <Screen scroll style={CENTERED}>
      <AuthMark />
      <View style={{ gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <Txt v="display" style={{ textAlign: 'center' }}>{title}</Txt>
        <Txt v="small" style={{ fontSize: 15, lineHeight: 22, textAlign: 'center' }}>{subtitle}</Txt>
      </View>
      {limited ? <Banner tone="warn" icon="timer-sand" title="Too many code requests" body="Please wait a few minutes before asking for another code." /> : null}
      <Input placeholder="ada@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress"
        value={raw} onChangeText={(t) => { setRaw(t); setErr(null); }} error={err} autoFocus accessibilityLabel="Email address" />
      <Button title="Send code" onPress={send} loading={busy} disabled={!raw} />
      {footer}
    </Screen>
  );
}

// Sign-in content sits as one block in the middle of the screen; scrolls if the keyboard squeezes it.
const CENTERED = { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 64, gap: 18 };

// Small Poultry360 egg mark (matches the splash) to anchor the sign-in screens.
function AuthMark() {
  const { c, mode } = useTheme();
  const dark = mode === 'dark';
  return (
    <View style={{ alignSelf: 'center', width: 56, height: 68, borderRadius: 28, backgroundColor: dark ? c.ember : '#17120E', alignItems: 'center', justifyContent: 'center', paddingTop: 8, marginBottom: 6 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: dark ? '#F7C48A' : c.yolk }} />
    </View>
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
