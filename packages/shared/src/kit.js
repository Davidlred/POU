import React from 'react';
import { View, ScrollView, Platform } from 'react-native';
import Svg, { Polyline, Circle as SvgCircle } from 'react-native-svg';
import { useTheme } from './ThemeProvider';
import { useWide } from './web';
import { Txt, Icon, Button, Press, haptic, useBleed, BLEED } from './ui';
const InList = React.createContext(false);

// The redesign's shared building blocks (newdesign.md section 3.3). All Views, Text and SVG.

// Orange live dot (Hearth cards, "on the way").
export function LiveDot({ size = 8 }) {
  const { c } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.orange }} />;
}

// Orange count badge ("Needs your action · 3", nav badges).
export function CountBadge({ n, style }) {
  const { c } = useTheme();
  if (!n) return null;
  return (
    <View style={[{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.orange, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Txt v="mono" color={c.onorange} style={{ fontSize: 13, lineHeight: 18 }}>{n > 99 ? '99+' : String(n)}</Txt>
    </View>
  );
}

// An unboxed section's heading: h2, optional orange count, optional link or node on the right.
export function SectionHead({ title, count, action, onAction, right, style }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }, style]}>
      <Txt v="h2" style={{ flexShrink: 1 }}>{title}</Txt>
      <CountBadge n={count} />
      <View style={{ flex: 1 }} />
      {right}
      {action ? (Platform.OS === 'web'
        ? <Press onPress={onAction} accessibilityRole="button" hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}><Txt v="bold" color={c.acc} style={{ fontSize: 14 }}>{action}</Txt></Press>
        : <Press onPress={onAction} accessibilityRole="button" hitSlop={6} style={{ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12, paddingRight: 6, borderRadius: 18, backgroundColor: c.navact, overflow: 'hidden' }}>
            <Txt v="bold" color={c.navactink} style={{ fontSize: 14 }}>{action}</Txt><Icon name="chevron-right" size={18} color={c.navactink} /></Press>) : null}
    </View>
  );
}

// Website page header bar: title (+ subtitle) on the left, actions on the right. On phones the actions wrap below.
export function HeaderBar({ title, subtitle, lead, children, style }) {
  const wide = useWide();
  return (
    <View style={[{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 16 : 12 }, style]}>
      <View style={{ flex: wide ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {lead}
        <View style={{ flex: 1, gap: 2 }}>
          {typeof title === 'string' ? <Txt v="display" numberOfLines={2}>{title}</Txt> : title}
          {typeof subtitle === 'string' ? <Txt v="small" style={{ fontSize: 14 }}>{subtitle}</Txt> : subtitle}
        </View>
      </View>
      {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>{children}</View> : null}
    </View>
  );
}

// A small line chart for a figure cell.
export function Sparkline({ data = [], width = 80, height = 28, color }) {
  const { c } = useTheme();
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => (i * (width - 4)) / (data.length - 1) + 2 + ',' + (height - 3 - ((v - min) / span) * (height - 6))).join(' ');
  const last = pts.split(' ').pop().split(',');
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={color || c.yolk} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <SvgCircle cx={last[0]} cy={last[1]} r={2.6} fill={color || c.yolk} />
    </Svg>
  );
}

// FigureStrip: one rounded container split into equal cells by 1 px lines (4 across on the website, 2 × 2 on the phone).
// items: [{ label, value, note, tone: 'ok' | 'warn' | 'err' | 'mute', icon, spark: number[] }]
export function FigureStrip({ items, style }) {
  const { c } = useTheme();
  const wide = useWide();
  const n = items.length;
  const perRow = wide ? n : 2;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, borderRadius: 20, overflow: 'hidden' }, style]}>
      {items.map((it, i) => {
        const col = i % perRow, row = Math.floor(i / perRow);
        const toneColor = it.tone === 'ok' ? c.sage : it.tone === 'warn' ? c.warn : it.tone === 'err' ? c.err : c.mute;
        const lonely = !wide && n % 2 === 1 && i === n - 1;   // an odd last cell on the phone takes the full row
        return (
          <View key={it.label} style={{ width: lonely ? '100%' : (100 / perRow) + '%', padding: wide ? 18 : 14, gap: 6,
            borderLeftWidth: col && !lonely ? 1 : 0, borderTopWidth: row ? 1 : 0, borderColor: c.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {it.icon ? <Icon name={it.icon} size={16} color={c.mute} /> : null}
              <Txt v="label" numberOfLines={1} style={{ flexShrink: 1 }}>{it.label}</Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
              <Txt v="mono" numberOfLines={1} style={{ fontSize: wide ? 26 : 22, lineHeight: wide ? 32 : 28, letterSpacing: -0.5, flexShrink: 1 }}>{it.value}</Txt>
              {wide && it.spark ? <Sparkline data={it.spark} /> : null}
            </View>
            {it.note ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {it.tone === 'warn' || it.tone === 'err' ? <Icon name="alert-outline" size={14} color={toneColor} /> : it.tone === 'ok' ? <Icon name="trending-up" size={14} color={toneColor} /> : null}
              <Txt v="small" color={toneColor} numberOfLines={1} style={{ flexShrink: 1 }}>{it.note}</Txt>
            </View> : null}
          </View>
        );
      })}
    </View>
  );
}

// ActionList ("Needs your action"): heading with an orange count, then rows. Website: rows in one bordered list.
// Phone: each row is a small card with its button bottom-right.
export function ActionList({ title = 'Needs your action', count, children, empty, right }) {
  const { c } = useTheme();
  const wide = useWide();
  const bleed = useBleed();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 12 }}>
      <SectionHead title={title} count={count ?? rows.length} right={right} />
      {!rows.length ? empty || null : wide ? (
        <View style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, borderRadius: 20, overflow: 'hidden' }}>
          {rows.map((r, i) => <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: c.line }}>{r}</View>)}
        </View>
      ) : bleed ? (
        <View style={[{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }, BLEED]}>
          <InList.Provider value>{rows.map((r, i) => <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: c.line }}>{r}</View>)}</InList.Provider>
        </View>
      ) : <View style={{ gap: 10 }}>{rows}</View>}
    </View>
  );
}
// One "needs action" row. lead: a 44 px icon/avatar node (or icon name). pill: a <Pill/>. action: { title, onPress, variant, disabled, loading }.
export function ActionRow({ lead, icon, iconTone = 'navact', title, detail, pill, amount, action, onPress, children }) {
  const { c } = useTheme();
  const wide = useWide();
  const inList = React.useContext(InList);
  const leadNode = lead || (icon ? (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: iconTone === 'warn' ? c.warnbg : iconTone === 'err' ? c.errbg : iconTone === 'orange' ? c.obg : c.navact, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={21} color={iconTone === 'warn' ? c.warn : iconTone === 'err' ? c.err : iconTone === 'orange' ? c.oink : c.navactink} />
    </View>) : null);
  const btn = action ? <Button small variant={action.variant || 'primary'} title={action.title} icon={action.icon} onPress={action.onPress} disabled={action.disabled} loading={action.loading} style={{ paddingHorizontal: 18, height: wide ? 40 : 44 }} /> : null;
  if (wide) return (
    <Press onPress={onPress} disabled={!onPress} style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: hovered && onPress ? c.sf2 : 'transparent' })}>
      {leadNode}
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Txt v="strong" numberOfLines={1}>{title}</Txt>
        {detail ? <Txt v="small" numberOfLines={1}>{detail}</Txt> : null}
        {children}
      </View>
      {pill}
      {amount != null ? <Txt v="mono" style={{ minWidth: 90, textAlign: 'right' }}>{amount}</Txt> : null}
      {btn}
    </Press>
  );
  return (
    <Press onPress={onPress} disabled={!onPress} style={({ pressed }) => (inList ? { paddingVertical: 14, paddingHorizontal: 20, gap: 12 } : { backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, borderRadius: 20, padding: 14, gap: 12, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {leadNode}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Txt v="strong" numberOfLines={2}>{title}</Txt>
          {detail ? <Txt v="small" numberOfLines={2}>{detail}</Txt> : null}
        </View>
        {amount != null ? <Txt v="mono">{amount}</Txt> : null}
      </View>
      {children}
      {pill || btn ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{pill}<View style={{ flex: 1 }} />{btn}</View> : null}
    </Press>
  );
}

// DataTable (website): header row on sf2 with bold muted column names, hairline rows, numbers right-aligned,
// optional action in the last column; scrolls sideways when narrow. Phone: the same rows as a plain hairline list
// (first cell as the title, the middle cells as one muted line, the last cell on the right).
// columns: [{ label, flex, right, width }]; rows: [{ key, cells: [node | string], onPress }]
export function DataTable({ columns, rows, empty, minWidth = 640, phoneMiddle = true }) {
  const { c } = useTheme();
  const wide = useWide();
  const bleed = useBleed();
  const text = (node, right, j) => (typeof node === 'string' || typeof node === 'number'
    ? <Txt v={j === 0 ? 'strong' : 'body'} numberOfLines={1} style={right ? { textAlign: 'right' } : null}>{node}</Txt> : node);
  if (!wide) return (
    <View style={[{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, borderRadius: 20, overflow: 'hidden' }, bleed && BLEED]}>
      {rows.length ? rows.map((r, i) => {
        const last = r.cells[r.cells.length - 1];
        const mid = r.cells.slice(1, -1);
        return (
          <Press key={r.key} onPress={r.onPress} disabled={!r.onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: bleed ? 20 : 14, minHeight: 60,
            borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: pressed && r.onPress ? c.sf2 : 'transparent' })}>
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              {text(r.cells[0], false, 0)}
              {phoneMiddle && mid.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
                {mid.map((m, j) => <React.Fragment key={j}>{typeof m === 'string' ? <Txt v="small">{m}</Txt> : m}</React.Fragment>)}
              </View> : null}
            </View>
            {r.cells.length > 1 ? text(last, true, 1) : null}
          </Press>
        );
      }) : empty}
    </View>
  );
  const cell = (j, node) => {
    const col = columns[j];
    return <View key={j} style={[{ flex: col.width ? undefined : col.flex || 1, width: col.width, minWidth: 0 }, col.right && { flexDirection: 'row', justifyContent: 'flex-end' }]}>{text(node, col.right, j)}</View>;
  };
  return (
    <View style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, borderRadius: 20, overflow: 'hidden' }}>
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1, minWidth: '100%' }} showsHorizontalScrollIndicator={false}>
        <View style={{ flex: 1, minWidth }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: c.sf2 }}>
            {columns.map((col, j) => cell(j, <Txt v="bold" color={c.mute} style={[{ fontSize: 13, lineHeight: 18 }, col.right && { textAlign: 'right' }]}>{col.label}</Txt>))}
          </View>
          {rows.length ? rows.map((r) => (
            <Press key={r.key} onPress={r.onPress} disabled={!r.onPress} accessibilityRole={r.onPress ? 'button' : undefined}
              style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 12, minHeight: 60,
                borderTopWidth: 1, borderColor: c.line, backgroundColor: hovered && r.onPress ? c.sf2 : 'transparent' })}>
              {r.cells.map((node, j) => cell(j, node))}
            </Press>
          )) : <View style={{ borderTopWidth: 1, borderColor: c.line }}>{empty}</View>}
        </View>
      </ScrollView>
    </View>
  );
}

// SelectCard: addresses, payment methods, role options. 2 px border; selected = primary border plus a tick (never colour alone).
export function SelectCard({ selected, onPress, title, subtitle, lead, right, disabled, children, error }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      haptic="select" style={({ hovered }) => ({ backgroundColor: c.sf, borderRadius: 20, borderWidth: 2, padding: 14, gap: 10, opacity: disabled ? 0.55 : 1, overflow: 'hidden',
        borderColor: error ? c.err : selected ? c.yolk : hovered ? c.line2 : c.line })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {lead}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          {typeof title === 'string' ? <Txt v="bold">{title}</Txt> : title}
          {typeof subtitle === 'string' ? <Txt v="small">{subtitle}</Txt> : subtitle}
        </View>
        {right}
        {selected ? <Icon name="check-circle" size={24} color={c.yolk} /> : <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.line2 }} />}
      </View>
      {children}
    </Press>
  );
}

// ProgressSegments: a row of 6 px bars. Done = green, current = orange, upcoming = hairline.
export function ProgressSegments({ total, done, current = true, onDark, style }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: 5 }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3,
          backgroundColor: i < done ? (onDark ? c.hbtn : c.yolk) : i === done && current ? c.orange : onDark ? c.hline : c.line2 }} />
      ))}
    </View>
  );
}

// BarChart: headline first (label, big number, one note), then bars starting at zero. The latest bar in primary with its
// value above; the rest in `bar`. One line under the chart says what is plotted.
// bars: [{ label, value, text }] (text = the value as shown above the latest bar)
export function BarChart({ label, value, note, noteTone, bars = [], caption, height = 132, right }) {
  const { c } = useTheme();
  const max = Math.max(1, ...bars.map((b) => Number(b.value) || 0));
  const toneColor = noteTone === 'ok' ? c.sage : noteTone === 'warn' ? c.warn : noteTone === 'err' ? c.err : c.mute;
  const lastI = bars.length - 1;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          {label ? <Txt v="label">{label}</Txt> : null}
          {value != null ? <Txt v="mono" style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.6 }}>{value}</Txt> : null}
          {note ? <Txt v="small" color={toneColor}>{note}</Txt> : null}
        </View>
        {right}
      </View>
      {bars.length ? <View>
        <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: bars.length > 20 ? 2 : 6, borderBottomWidth: 1, borderColor: c.line2 }}>
          {bars.map((b, i) => {
            const h = Math.max(Number(b.value) > 0 ? 3 : 0, (Number(b.value) / max) * (height - 22));
            return (
              <View key={b.label + i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                {i === lastI && b.text ? <Txt v="mono" numberOfLines={1} style={{ fontSize: 13, lineHeight: 18 }}>{b.text}</Txt> : null}
                <View style={{ width: '100%', maxWidth: 34, height: h, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: i === lastI ? c.yolk : c.bar }} />
              </View>
            );
          })}
        </View>
        {bars.length <= 14 ? <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {bars.map((b, i) => <Txt key={b.label + i} v="small" numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 13 }}>{b.label}</Txt>)}
        </View> : null}
      </View> : null}
      {caption ? <Txt v="small">{caption}</Txt> : null}
    </View>
  );
}

// SuccessMoment: a 92 px primary circle with a white tick inside a 12 px navact ring, title, key number, what happens next.
export function SuccessMoment({ title, value, body, children, style }) {
  const { c } = useTheme();
  React.useEffect(() => { haptic('success'); }, []);
  return (
    <View style={[{ alignItems: 'center', gap: 12, paddingVertical: 12 }, style]}>
      <View style={{ width: 116, height: 116, borderRadius: 58, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={52} color={c.onyolk} /></View>
      </View>
      <Txt v="display" style={{ textAlign: 'center' }}>{title}</Txt>
      {value ? <Txt v="mono" style={{ fontSize: 22, lineHeight: 28, textAlign: 'center' }}>{value}</Txt> : null}
      {body ? <Txt v="body" color={c.mute} style={{ textAlign: 'center', maxWidth: 420 }}>{body}</Txt> : null}
      {children}
    </View>
  );
}

// Toast: an ok-coloured banner at the top of the content column with a tick, a message and Dismiss.
export function Toast({ message, onDismiss, style }) {
  const { c } = useTheme();
  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.sagebg, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 }, style]}>
      <Icon name="check-circle" size={20} color={c.sage} />
      <Txt v="strong" color={c.sage} style={{ flex: 1 }}>{message}</Txt>
      {onDismiss ? <Press onPress={onDismiss} hitSlop={8} accessibilityRole="button"><Txt v="bold" color={c.sage} style={{ fontSize: 14 }}>Dismiss</Txt></Press> : null}
    </View>
  );
}

// Underlined tabs (Farm Hub: Flocks · Farm Book · Inventory · Vet care).
export function UnderTabs({ tabs, value, onChange, style }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0, borderBottomWidth: 1, borderColor: c.line }, style]} contentContainerStyle={{ gap: 24 }}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Press key={t.value} onPress={() => onChange(t.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 3, borderColor: on ? c.yolk : 'transparent', marginBottom: -1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt v={on ? 'bold' : 'strong'} color={on ? c.ink : c.mute}>{t.label}</Txt>
            <CountBadge n={t.count} />
          </Press>
        );
      })}
    </ScrollView>
  );
}

// A trust line with an icon (product page, checkout).
export function TrustRow({ icon, text, sub }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={c.navactink} /></View>
      <View style={{ flex: 1 }}><Txt v="strong">{text}</Txt>{sub ? <Txt v="small">{sub}</Txt> : null}</View>
    </View>
  );
}

// A hairline-separated line of label + value (money breakdowns). strong: the total line.
export function MoneyLine({ label, value, strong, onDark, color }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
      <Txt v={strong ? 'bold' : 'body'} color={onDark ? (strong ? c.hink : c.hmute) : strong ? c.ink : c.mute} style={{ flex: 1 }}>{label}</Txt>
      <Txt v="mono" color={color || (onDark ? c.hink : c.ink)} style={strong ? { fontSize: 18 } : null}>{value}</Txt>
    </View>
  );
}

// A plain stock / progress bar (feed in store, credit progress). pct 0–1; low turns it orange.
export function MeterBar({ pct, low, onDark }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: onDark ? c.hline : c.sf2, overflow: 'hidden' }}>
      <View style={{ width: Math.round(Math.max(0, Math.min(1, pct)) * 100) + '%', height: 8, borderRadius: 4, backgroundColor: low ? c.orange : onDark ? c.hbtn : c.yolk }} />
    </View>
  );
}
