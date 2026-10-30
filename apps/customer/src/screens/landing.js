import React, { useRef, useState } from 'react';
import { View, ScrollView, Pressable, Image, useWindowDimensions } from 'react-native';
import { useTheme, Txt, Button, Icon, Pill, LOGO_MARK, MAX_FONT_SCALE } from '@p360/shared';

// Public home page of the web version (signed out). Phones never see it: the app opens on sign-in there.

export function WebNav({ navigation, sections, onSection, compact }) {
  const { c, mode, toggle } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <View style={{ borderBottomWidth: 1, borderColor: c.line, backgroundColor: c.bg }}>
      <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, height: 72, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable onPress={() => navigation.navigate('Landing')} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center' }}><Image source={LOGO_MARK} style={{ width: 34, height: 34 }} /></View>
          <Txt v="h2" style={{ fontSize: 20 }}>Poultry360</Txt>
        </Pressable>
        {wide && sections ? sections.map(([key, label]) => (
          <Pressable key={key} onPress={() => onSection(key)} accessibilityRole="link" style={{ paddingHorizontal: 8, height: 44, justifyContent: 'center' }}><Txt v="strong" color={c.mute}>{label}</Txt></Pressable>
        )) : null}
        <Pressable onPress={toggle} accessibilityLabel={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={mode === 'dark' ? 'white-balance-sunny' : 'weather-night'} size={20} />
        </Pressable>
        {!compact ? <>
          {wide ? <Button small variant="ghost" title="Sign in" onPress={() => navigation.navigate('SignIn')} style={{ height: 44 }} /> : null}
          <Button small title={wide ? 'Get started' : 'Sign in'} onPress={() => navigation.navigate(wide ? 'Email' : 'SignIn', wide ? { mode: 'signup' } : undefined)} style={{ height: 44 }} />
        </> : null}
      </View>
    </View>
  );
}

const SECTIONS = [['how', 'How it works'], ['who', "Who it's for"], ['agents', 'Stores & agents'], ['faq', 'FAQ']];
const FAQ = [
  ['Where do you deliver?', 'Port Harcourt, Rivers State. More cities later.'],
  ['How are farms verified?', 'Every farm and supplier sends ID and business details. Our team checks them before they can sell.'],
  ['Who delivers my order?', 'Poultry360 riders. They pick up from the farm, check the goods, and bring them to you.'],
  ['Can I sell on the website?', 'Yes. Farms and stores can list products, manage stock, take orders and track their agents from any browser.'],
  ['How do store agents work?', 'A store shares its code. Agents join in the Poultry360 app, log sales and earn the commission the store sets on each product.'],
];

export function LandingScreen({ navigation }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const scroll = useRef(null);
  const at = useRef({});
  const [open, setOpen] = useState(0);
  const go = (k) => scroll.current?.scrollTo({ y: Math.max(0, (at.current[k] || 0) - 8), animated: true });
  const mark = (k) => (e) => { at.current[k] = e.nativeEvent.layout.y; };
  const wrap = { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20 };
  const h1 = { fontSize: wide ? 68 : 42, lineHeight: wide ? 72 : 46, letterSpacing: wide ? -2.4 : -1.4 };
  const h2 = { fontSize: wide ? 44 : 32, lineHeight: wide ? 50 : 37, letterSpacing: -1.2 };
  const card = { backgroundColor: c.sf, borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 22, gap: 10 };
  const get = () => navigation.navigate('Email', { mode: 'signup' });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <WebNav navigation={navigation} sections={SECTIONS} onSection={go} />
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 0 }}>
        {/* Hero */}
        <View style={[wrap, { paddingVertical: wide ? 88 : 48, flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: 48 }]}>
          <View style={{ flex: wide ? 1.1 : undefined, gap: 22 }}>
            <View style={{ alignSelf: 'flex-start' }}><Pill tone="ok" label="Now delivering in Port Harcourt" /></View>
            <Txt v="display" style={h1}>Fresh poultry from{' '}<Txt v="display" style={[h1, { backgroundColor: c.navact, color: c.navactink, borderRadius: 12 }]}>verified</Txt>{' '}farms.</Txt>
            <Txt v="body" color={c.mute} style={{ fontSize: wide ? 20 : 17, lineHeight: wide ? 30 : 26, maxWidth: 560 }}>Order eggs, birds and feed from farms we have checked. Our riders pick up and deliver to your door.</Txt>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <Button title="Get started" onPress={get} style={{ paddingHorizontal: 28 }} />
              <Button variant="outline" title="Sign in" onPress={() => navigation.navigate('SignIn')} style={{ paddingHorizontal: 28 }} />
            </View>
          </View>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', alignItems: 'center', justifyContent: 'center', minHeight: wide ? 460 : 360 }}>
            <View style={{ width: wide ? 420 : 300, height: wide ? 420 : 300, borderRadius: 999, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: wide ? 230 : 170, height: wide ? 230 : 170, borderRadius: 999, backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={LOGO_MARK} style={{ width: wide ? 160 : 120, height: wide ? 160 : 120, borderRadius: 999 }} />
              </View>
            </View>
            <View style={[card, { position: 'absolute', top: wide ? 20 : 0, right: wide ? 0 : 4, padding: 14, gap: 4, flexDirection: 'row', alignItems: 'center' }]}>
              <Icon name="check-decagram" size={20} color={c.sage} /><Txt v="strong">Verified farm</Txt>
            </View>
            <View style={[card, { position: 'absolute', bottom: wide ? 30 : 0, left: wide ? 0 : 4, padding: 16, gap: 6, minWidth: 240 }]}>
              <Txt v="label">Order P360-2148</Txt>
              <Txt v="bold">Fresh eggs · 5 crates</Txt>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Pill tone="live" label="Rider on the way" /><Txt v="mono">₦22,500</Txt></View>
            </View>
          </View>
        </View>

        {/* How it works */}
        <View onLayout={mark('how')} style={{ backgroundColor: c.sf2, paddingVertical: wide ? 96 : 56 }}>
          <View style={[wrap, { gap: 36 }]}>
            <View style={{ gap: 10 }}><Txt v="label" color={c.acc}>How it works</Txt><Txt v="display" style={h2}>From farm to your door in a day.</Txt></View>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 20 }}>
              {[['01', 'Pick from verified farms', 'Eggs, broilers, turkey, live birds, feed and drugs, with real stock and prices.', 'storefront-outline'],
                ['02', 'Pay safely', 'Pay by card or wallet. The farm is paid after your order is delivered.', 'shield-check-outline'],
                ['03', 'We deliver', 'Our rider checks the goods at the farm and brings them to you. Track it live.', 'moped-outline']].map(([n, t, b, i]) => (
                <View key={n} style={[card, { flex: 1, padding: 28, gap: 14 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={26} color={c.navactink} /></View>
                    <Txt v="mono" color={c.mute} style={{ fontSize: 22 }}>{n}</Txt>
                  </View>
                  <Txt v="h1" style={{ fontSize: 24 }}>{t}</Txt>
                  <Txt v="body" color={c.mute} style={{ fontSize: 16, lineHeight: 24 }}>{b}</Txt>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Who it's for */}
        <View onLayout={mark('who')} style={[wrap, { paddingVertical: wide ? 96 : 56, gap: 36 }]}>
          <View style={{ gap: 10 }}><Txt v="label" color={c.acc}>Who it's for</Txt><Txt v="display" style={h2}>One place for the whole poultry trade.</Txt></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
            {[['Buyers', 'Homes, restaurants and caterers ordering fresh produce.', 'basket-outline', 't1'],
              ['Farms', 'Sell online, keep flock records in Farm Hub and sell on credit with Farm Book.', 'barn', 't4'],
              ['Stores & suppliers', 'Feed, drugs and equipment: inventory, orders and a team of agents.', 'package-variant', 't2'],
              ['Vets', 'Video consults and farm visits, booked and paid in the app.', 'stethoscope', 't3']].map(([t, b, i, tone]) => (
              <View key={t} style={[card, { flexBasis: wide ? '22%' : '100%', flexGrow: 1, padding: 26, gap: 12 }]}>
                <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={i} size={26} color={c[tone + 'i']} /></View>
                <Txt v="h2">{t}</Txt>
                <Txt v="body" color={c.mute} style={{ fontSize: 15, lineHeight: 23 }}>{b}</Txt>
              </View>
            ))}
          </View>
        </View>

        {/* Stores & agents */}
        <View onLayout={mark('agents')} style={{ backgroundColor: c.sf2, paddingVertical: wide ? 96 : 56 }}>
          <View style={[wrap, { flexDirection: wide ? 'row' : 'column', gap: 48, alignItems: 'center' }]}>
            <View style={{ flex: wide ? 1 : undefined, gap: 16 }}>
              <Txt v="label" color={c.acc}>Stores & agents</Txt>
              <Txt v="display" style={h2}>Your agents sell. You see who sells most.</Txt>
              <Txt v="body" color={c.mute} style={{ fontSize: 17, lineHeight: 26 }}>Share one code with your agents. They log sales in the Poultry360 app, earn the commission you set on each product, and you track every sale and payout from the web.</Txt>
              <View style={{ alignSelf: 'flex-start' }}><Button title="Set up your store" onPress={get} style={{ paddingHorizontal: 28 }} /></View>
            </View>
            <View style={[card, { flex: wide ? 1 : undefined, width: wide ? undefined : '100%', padding: 26, gap: 4 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><Txt v="h2">Top agents</Txt><Pill label="30 days" /></View>
              {[['Ada O.', '₦842,000', 42], ['Tunde A.', '₦615,500', 31], ['Ngozi E.', '₦402,000', 19], ['Bayo K.', '₦188,500', 9]].map(([n, v, s], i) => (
                <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: i === 0 ? c.t4 : c.sf2, alignItems: 'center', justifyContent: 'center' }}>
                    {i === 0 ? <Icon name="trophy-outline" size={18} color={c.t4i} /> : <Txt v="bold">{i + 1}</Txt>}
                  </View>
                  <View style={{ flex: 1 }}><Txt v="bold">{n}</Txt><Txt v="small">{s} sales</Txt></View>
                  <Txt v="mono">{v}</Txt>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* FAQ */}
        <View onLayout={mark('faq')} style={[wrap, { paddingVertical: wide ? 96 : 56, gap: 28, maxWidth: 880 }]}>
          <Txt v="display" style={h2}>Questions</Txt>
          <View style={{ borderTopWidth: 1, borderColor: c.line }}>
            {FAQ.map(([q, a], i) => (
              <Pressable key={q} onPress={() => setOpen(open === i ? -1 : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }}
                style={{ paddingVertical: 20, borderBottomWidth: 1, borderColor: c.line, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Txt v="h2" style={{ flex: 1, fontSize: 19 }}>{q}</Txt>
                  <Icon name={open === i ? 'minus' : 'plus'} size={22} color={c.mute} />
                </View>
                {open === i ? <Txt v="body" color={c.mute} style={{ fontSize: 16, lineHeight: 25 }}>{a}</Txt> : null}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Closing call to action */}
        <View style={[wrap, { paddingBottom: wide ? 96 : 56 }]}>
          <View style={{ backgroundColor: c.hc, borderRadius: 32, padding: wide ? 56 : 28, gap: 18, alignItems: wide ? 'center' : 'flex-start', overflow: 'hidden' }}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -80, top: -120, width: 320, height: 320, borderRadius: 160, backgroundColor: c.ember, opacity: 0.25 }} />
            <Txt v="display" color={c.hink} style={[h2, { textAlign: wide ? 'center' : 'left' }]}>Buy or sell on Poultry360.</Txt>
            <Txt v="body" color={c.hmute} style={{ fontSize: 17, textAlign: wide ? 'center' : 'left' }}>Free to join. Farms and stores are verified before they sell.</Txt>
            <Button title="Create an account" onPress={get} style={{ paddingHorizontal: 32 }} />
          </View>
        </View>

        {/* Footer */}
        <View style={{ borderTopWidth: 1, borderColor: c.line }}>
          <View style={[wrap, { paddingVertical: 32, flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'center' : 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Image source={LOGO_MARK} style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: c.logobg }} />
              <Txt v="small" maxFontSizeMultiplier={MAX_FONT_SCALE}>© {new Date().getFullYear()} Poultry360 · Port Harcourt, Nigeria</Txt>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
