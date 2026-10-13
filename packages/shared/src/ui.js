import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, StatusBar, Switch, Modal, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from './ThemeProvider';

export function Icon({ name, size = 22, color, style }) {
  const { c } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color || c.ink} style={style} />;
}

// The phone's font-size setting is respected up to this point. Past it, rows and tiles designed for normal text break.
export const MAX_FONT_SCALE = 1.3;

const VARIANTS = (f, c) => ({
  display: { fontFamily: f.display, fontSize: 32, lineHeight: 37, letterSpacing: -0.8, color: c.ink },
  h1: { fontFamily: f.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.4, color: c.ink },
  h2: { fontFamily: f.displayBold, fontSize: 18, lineHeight: 23, letterSpacing: -0.2, color: c.ink },
  body: { fontFamily: f.regular, fontSize: 15, lineHeight: 22, color: c.ink },
  strong: { fontFamily: f.semibold, fontSize: 15, lineHeight: 21, color: c.ink },
  bold: { fontFamily: f.bold, fontSize: 15, lineHeight: 21, color: c.ink },
  small: { fontFamily: f.medium, fontSize: 13, lineHeight: 18, color: c.mute },
  label: { fontFamily: f.semibold, fontSize: 13, lineHeight: 18, color: c.mute },
  mono: { fontFamily: f.mono, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] },
  monoLg: { fontFamily: f.display, fontSize: 34, lineHeight: 40, letterSpacing: -1, color: c.ink, fontVariant: ['tabular-nums'] },
});
export function Txt({ v = 'body', color, style, children, ...p }) {
  const { c, f } = useTheme();
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...p} style={[VARIANTS(f, c)[v], color && { color }, style]}>{children}</Text>;
}

export function Screen({ children, scroll, pad = true, edges = ['top'], style, footer, bg }) {
  const { c, mode } = useTheme();
  const inner = scroll
    ? <ScrollView contentContainerStyle={[pad && { padding: 20, paddingBottom: 40 }, { gap: 14 }, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[{ flex: 1 }, pad && { paddingHorizontal: 20 }, style]}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: bg || c.bg }}>
      <StatusBar barStyle={mode === 'dark' || bg ? 'light-content' : 'dark-content'} backgroundColor={bg || c.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {inner}
        {footer ? <View style={{ padding: 16, paddingBottom: 20, borderTopWidth: 1, borderColor: c.line, backgroundColor: c.nav, gap: 10 }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AppBar({ title, subtitle, right, close, onBack }) {
  const nav = useNavigation();
  const { c } = useTheme();
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack || (() => nav.goBack())} style={s.iconBtn} hitSlop={8}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Icon name={close ? 'close' : 'arrow-left'} size={22} /></View>
      </Pressable>
      <View style={{ flex: 1, marginLeft: 4 }}>
        {title ? <Txt v="h2" numberOfLines={1}>{title}</Txt> : null}
        {subtitle ? <Txt v="label">{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }) {
  const { c, f } = useTheme();
  const map = {
    primary: [c.yolk, c.onyolk, 'transparent'],
    dark: [c.ink, c.bg, 'transparent'],
    hearth: [c.hc, c.hink, c.hcb],
    outline: ['transparent', c.ink, c.line2],
    ghost: ['transparent', c.acc, 'transparent'],
    danger: [c.err, '#fff', 'transparent'],
  };
  let [bg, fg, bd] = map[variant];
  if (disabled) { bg = c.sf2; fg = c.mute; bd = 'transparent'; }
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [{ height: small ? 44 : 56, borderRadius: 100, backgroundColor: bg, borderWidth: 1.5, borderColor: bd, paddingHorizontal: 18,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>
        {icon ? <Icon name={icon} size={20} color={fg} /> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: fg, fontFamily: f.bold, fontSize: small ? 14 : 16, flexShrink: 1 }}>{title}</Text>
      </>}
    </Pressable>
  );
}

export function Card({ children, onPress, style, tone }) {
  const { c } = useTheme();
  const bg = tone === 'err' ? c.errbg : tone === 'warn' ? c.warnbg : tone === 'ok' ? c.sagebg : c.sf;
  const body = [{ backgroundColor: bg, borderRadius: 22, padding: 16, gap: 10, borderWidth: 1, borderColor: tone ? 'transparent' : c.line }, style];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [body, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={body}>{children}</View>;
}

// Dark "hearth" card reserved for money and live status. Glow approximates the radial gradient in the designs.
export function Hearth({ children, style, onPress }) {
  const { c } = useTheme();
  const C = onPress ? Pressable : View;
  return (
    <C onPress={onPress} style={[{ backgroundColor: c.hc, borderColor: c.hcb, borderWidth: 1, borderRadius: 26, padding: 20, gap: 12, overflow: 'hidden' }, style]}>
      <View pointerEvents="none" style={{ position: 'absolute', right: -80, top: -100, width: 230, height: 230, borderRadius: 115, backgroundColor: c.ember, opacity: 0.22 }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: -60, bottom: -90, width: 170, height: 170, borderRadius: 85, backgroundColor: c.hink, opacity: 0.05 }} />
      {children}
    </C>
  );
}

export function Chip({ label, selected, onPress, icon }) {
  const { c, f } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={{ height: 40, paddingHorizontal: 14, borderRadius: 100, flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: selected ? c.navact : c.sf, borderWidth: 1, borderColor: selected ? c.navactink : c.line2 }}>
      {selected ? <Icon name="check" size={16} color={c.navactink} /> : icon ? <Icon name={icon} size={16} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: selected ? f.bold : f.medium, fontSize: 13, color: selected ? c.navactink : c.ink }}>{label}</Text>
    </Pressable>
  );
}
export function ChipRow({ options, value, onChange, multi }) {
  const has = (o) => (multi ? (value || []).includes(o) : value === o);
  const tap = (o) => multi ? onChange(has(o) ? value.filter((x) => x !== o) : [...(value || []), o]) : onChange(o);
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map((o) => <Chip key={o} label={o} selected={has(o)} onPress={() => tap(o)} />)}</View>;
}

export function Input({ label, error, hint, prefix, suffix, mono, style, multiline, ...p }) {
  const { c, f } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="strong" style={{ fontSize: 13 }}>{label}</Txt> : null}
      <View style={[{ minHeight: 54, borderRadius: 16, backgroundColor: error ? c.errbg : c.sf, borderWidth: focus || error ? 2 : 1,
        borderColor: error ? c.err : focus ? c.ember : c.line2, flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingHorizontal: 14, gap: 8 }, style]}>
        {prefix ? <Txt v="mono" color={c.mute}>{prefix}</Txt> : null}
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE} placeholderTextColor={c.mute} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} multiline={multiline}
          style={{ flex: 1, color: c.ink, fontFamily: mono ? f.mono : f.medium, fontSize: 15, paddingVertical: 12, minHeight: multiline ? 88 : undefined, textAlignVertical: multiline ? 'top' : 'center' }} {...p} />
        {suffix ? <Txt v="small">{suffix}</Txt> : null}
      </View>
      {error ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="alert-circle" size={16} color={c.err} /><Txt v="small" color={c.err}>{error}</Txt></View>
        : hint ? <Txt v="small">{hint}</Txt> : null}
    </View>
  );
}

export function Banner({ tone = 'info', icon, title, body, action, onAction }) {
  const { c } = useTheme();
  const t = { ok: [c.sagebg, c.sage, 'check-circle'], warn: [c.warnbg, c.warn, 'clock-outline'], err: [c.errbg, c.err, 'alert-circle'], info: [c.sf2, c.ink, 'information-outline'] }[tone];
  return (
    <View style={{ backgroundColor: t[0], borderRadius: 18, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon name={icon || t[2]} size={20} color={t[1]} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Txt v="bold" color={t[1]} style={{ fontSize: 14 }}>{title}</Txt> : null}
        {body ? <Txt v="small" color={t[1]}>{body}</Txt> : null}
      </View>
      {action ? <Pressable onPress={onAction} hitSlop={8}><Txt v="bold" color={t[1]} style={{ fontSize: 13 }}>{action}</Txt></Pressable> : null}
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }) {
  const { c, f } = useTheme();
  const t = { ok: [c.sagebg, c.sage], warn: [c.warnbg, c.warn], err: [c.errbg, c.err], live: [c.navact, c.navactink], neutral: [c.sf2, c.mute] }[tone];
  return <View style={{ alignSelf: 'flex-start', backgroundColor: t[0], borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: t[1], fontFamily: f.semibold, fontSize: 12 }}>{label}</Text></View>;
}

export function Segmented({ options, value, onChange }) {
  const { c, f } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.sf2, borderRadius: 100, padding: 4 }}>
      {options.map((o) => {
        const on = (o.value ?? o) === value;
        return <Pressable key={o.value ?? o} onPress={() => onChange(o.value ?? o)} style={{ flex: 1, height: 40, borderRadius: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.seg : 'transparent', elevation: on ? 1 : 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontFamily: on ? f.bold : f.semibold, fontSize: 13, color: on ? c.ink : c.mute }}>{o.label ?? o}</Text></Pressable>;
      })}
    </View>
  );
}

export function Row({ icon, iconColor, title, subtitle, right, onPress, last }) {
  const { c } = useTheme();
  const C = onPress ? Pressable : View;
  return (
    <C onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderColor: c.line, minHeight: 56 }}>
      {icon ? <Icon name={icon} color={iconColor} /> : null}
      <View style={{ flex: 1, gap: 2 }}><Txt v="strong">{title}</Txt>{subtitle ? <Txt v="small">{subtitle}</Txt> : null}</View>
      {right !== undefined ? right : onPress ? <Icon name="chevron-right" color={c.mute} /> : null}
    </C>
  );
}
export const Group = ({ children, style }) => { const { c } = useTheme(); return <View style={[{ backgroundColor: c.sf, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: c.line }, style]}>{children}</View>; };

export function Empty({ icon, title, body, action, onAction }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }}>
      <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={34} color={c.navactink} /></View>
      <Txt v="h1" style={{ textAlign: 'center' }}>{title}</Txt>
      {body ? <Txt v="small" style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>{body}</Txt> : null}
      {action ? <Button title={action} onPress={onAction} style={{ marginTop: 6, alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function Steps({ steps }) {
  const { c } = useTheme();
  return (
    <View>
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={st.label} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              {st.state === 'done' ? <View style={[s.dot, { backgroundColor: c.sage }]}><Icon name="check" size={14} color="#fff" /></View>
                : st.state === 'current' ? <View style={[s.dot, { backgroundColor: c.ember, borderWidth: 4, borderColor: c.navact }]} />
                : <View style={[s.dot, { borderWidth: 2, borderColor: c.line2 }]} />}
              {!last ? <View style={{ width: 2, height: 24, backgroundColor: st.state === 'done' ? c.sage : c.line2 }} /> : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v={st.state === 'current' ? 'bold' : 'strong'} color={st.state === 'todo' ? c.mute : undefined} style={{ fontSize: 14 }}>{st.label}</Txt>
              {st.time ? <Txt v="label">{st.time}</Txt> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function OtpBoxes({ value, onChange, length = 6, error, autoFocus = true }) {
  const { c, f } = useTheme();
  const ref = useRef(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={{ flexDirection: 'row', gap: 8 }}>
      {Array.from({ length }).map((_, i) => {
        const ch = value[i]; const active = i === value.length;
        return <View key={i} style={{ flex: 1, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: error ? c.errbg : c.sf,
          borderWidth: active || error ? 2 : 1, borderColor: error ? c.err : active ? c.ember : c.line2 }}>
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: f.mono, fontSize: 24, color: error ? c.err : c.ink }}>{ch || ''}</Text></View>;
      })}
      <TextInput ref={ref} value={value} onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))} keyboardType="number-pad"
        autoFocus={autoFocus} textContentType="oneTimeCode" autoComplete="sms-otp" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
    </Pressable>
  );
}

export function Toggle({ value, onValueChange }) {
  const { c } = useTheme();
  return <Switch value={value} onValueChange={onValueChange} trackColor={{ false: c.line2, true: c.ember }} thumbColor="#fff" />;
}

export function Stars({ value, onChange, size = 36 }) {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', gap: 6 }}>{[1, 2, 3, 4, 5].map((n) =>
    <Pressable key={n} onPress={() => onChange?.(n)} hitSlop={4} accessibilityLabel={n + ' stars'}><Icon name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? c.warn : c.line2} /></Pressable>)}</View>;
}

export function Sheet({ visible, onClose, children }) {
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.scrim }} onPress={onClose} />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, paddingBottom: 32, gap: 16 }}>
        <View style={{ width: 36, height: 4, borderRadius: 4, backgroundColor: c.line2, alignSelf: 'center' }} />
        {children}
      </View>
    </Modal>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const toYmd = (y, m, d) => y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const fromYmd = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) } : null);

// Date field with a calendar. value / onChange use 'YYYY-MM-DD' (local date, no time zone shifting).
// min / max (same format) grey out days outside the range; clearable adds a "No date" option for optional fields.
export function DateInput({ label, value, onChange, error, hint, placeholder = 'Choose a date', min, max, clearable }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [pickYear, setPickYear] = useState(false);
  const now = new Date();
  const today = toYmd(now.getFullYear(), now.getMonth(), now.getDate());
  const sel = fromYmd(value);
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const allowed = (iso) => (!min || iso >= min) && (!max || iso <= max);
  const show = () => {
    // Open on the chosen date, or the closest allowed day to today.
    const start = sel || fromYmd(max && today > max ? max : min && today < min ? min : today);
    setView({ y: start.y, m: start.m }); setPickYear(false); setOpen(true);
  };
  const pick = (iso) => { onChange(iso); setOpen(false); };
  const step = (n) => setView(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;   // Monday first
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const canPrev = !min || toYmd(view.y, view.m, 1) > min;
  const canNext = !max || toYmd(view.y, view.m, daysIn) < max;
  const yFrom = min ? +min.slice(0, 4) : now.getFullYear() - 100;
  const yTo = max ? +max.slice(0, 4) : now.getFullYear() + 10;
  const years = Array.from({ length: yTo - yFrom + 1 }, (_, i) => (max && max <= today ? yTo - i : yFrom + i));   // newest first when picking a past date
  const shown = sel ? new Date(sel.y, sel.m, sel.d).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="strong" style={{ fontSize: 13 }}>{label}</Txt> : null}
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={(label || 'Date') + ', ' + (shown || 'not set')}
        style={{ minHeight: 54, borderRadius: 16, backgroundColor: error ? c.errbg : c.sf, borderWidth: error ? 2 : 1, borderColor: error ? c.err : c.line2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
        <Icon name="calendar-month-outline" size={22} color={c.acc} />
        <Txt v={shown ? 'strong' : 'body'} color={shown ? c.ink : c.mute} style={{ flex: 1 }}>{shown || placeholder}</Txt>
        <Icon name="chevron-down" size={20} color={c.mute} />
      </Pressable>
      {error ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="alert-circle" size={16} color={c.err} /><Txt v="small" color={c.err}>{error}</Txt></View>
        : hint ? <Txt v="small">{hint}</Txt> : null}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => step(-1)} disabled={!canPrev || pickYear} accessibilityLabel="Previous month" style={[s.iconBtn, { opacity: canPrev && !pickYear ? 1 : 0.3 }]}><Icon name="chevron-left" size={26} /></Pressable>
          <Pressable onPress={() => setPickYear(!pickYear)} accessibilityLabel="Choose a year" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12 }}>
            <Txt v="h2">{MONTHS[view.m]} {view.y}</Txt><Icon name={pickYear ? 'chevron-up' : 'chevron-down'} size={20} color={c.acc} />
          </Pressable>
          <Pressable onPress={() => step(1)} disabled={!canNext || pickYear} accessibilityLabel="Next month" style={[s.iconBtn, { opacity: canNext && !pickYear ? 1 : 0.3 }]}><Icon name="chevron-right" size={26} /></Pressable>
        </View>
        {pickYear ? (
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {years.map((y) => (
              <Pressable key={y} onPress={() => { setView((v) => ({ ...v, y })); setPickYear(false); }}
                style={{ flexBasis: '22%', flexGrow: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: y === view.y ? c.ember : c.sf, borderWidth: 1.5, borderColor: y === view.y ? c.ember : c.line2 }}>
                <Txt v="mono" color={y === view.y ? c.onember : c.ink} style={{ fontSize: 14 }}>{y}</Txt></Pressable>))}
          </ScrollView>
        ) : (
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row' }}>{WEEKDAYS.map((w) => <View key={w} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}><Txt v="label">{w}</Txt></View>)}</View>
            {Array.from({ length: cells.length / 7 }, (_, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
                  if (!d) return <View key={i} style={{ flex: 1, height: 44 }} />;
                  const iso = toYmd(view.y, view.m, d); const on = iso === value; const ok = allowed(iso);
                  return (
                    <Pressable key={i} disabled={!ok} onPress={() => pick(iso)} accessibilityLabel={d + ' ' + MONTHS[view.m] + ' ' + view.y} accessibilityState={{ selected: on, disabled: !ok }} style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.ember : 'transparent', borderWidth: iso === today && !on ? 1.5 : 0, borderColor: c.ember }}>
                        <Txt v={on ? 'bold' : 'body'} color={on ? c.onember : ok ? c.ink : c.line2} maxFontSizeMultiplier={1.1}>{d}</Txt>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {clearable ? <Button small variant="ghost" title="No date" onPress={() => { onChange(''); setOpen(false); }} style={{ flex: 1 }} /> : null}
          {allowed(today) ? <Button small variant="outline" title="Today" onPress={() => pick(today)} style={{ flex: 1 }} /> : null}
          <Button small variant="ghost" title="Cancel" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </View>
  );
}

// Catches an unexpected error in any screen below it and offers a way back, instead of the app closing.
export class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.warn('Poultry360 screen error:', error?.message, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen message={String(this.state.error?.message || '')} onRetry={() => this.setState({ error: null })} />;
  }
}
function ErrorScreen({ message, onRetry }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
      <Icon name="alert-circle-outline" size={48} color={c.ember} />
      <Txt v="h1" style={{ textAlign: 'center' }}>Something went wrong</Txt>
      <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>Nothing you saved was lost. Try again, and if it keeps happening, close the app and open it again.</Txt>
      <Button title="Try again" onPress={onRetry} style={{ alignSelf: 'stretch' }} />
      {message ? <Txt v="small" style={{ textAlign: 'center', fontSize: 12 }} numberOfLines={3}>{message}</Txt> : null}
    </View>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }) {
  const { c } = useTheme();
  return <View style={[{ height: h, width: w, borderRadius: r, backgroundColor: c.sf2 }, style]} />;
}

export function Loading() {
  const { c } = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.ember} size="large" /></View>;
}

export function Stat({ label, value, sub, subColor }) {
  const { c } = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.sf, borderRadius: 20, padding: 14, gap: 2, borderWidth: 1, borderColor: c.line }}>
    <Txt v="label">{label}</Txt><Txt v="mono" style={{ fontSize: 22, letterSpacing: -0.4 }}>{value}</Txt>{sub ? <Txt v="small" color={subColor}>{sub}</Txt> : null}</View>;
}

export function PhotoBox({ uri, size = 72, radius = 14 }) {
  const { c } = useTheme();
  const { Image } = require('react-native');
  return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.sf2 }} />
    : <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-outline" color={c.mute} /></View>;
}

export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

const s = StyleSheet.create({
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
