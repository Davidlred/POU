import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useTheme, Txt, Icon, Sheet, useWide, CountBadge, Button } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

// The one place an account switches role (newdesign.md 3.3 RoleSwitcher). Website: a card-like button at the top of the
// sidebar that opens an inline list. Phone: a pill in the top-left of the header that opens a "Switch role" sheet.

const initials = (n) => (n || 'P').trim().split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

// The modes this account can be in, and which one is on.
export function useRoleOptions() {
  const { profile, vendor } = useAuth();
  const roles = profile?.roles || [];
  const me = profile?.full_name || 'You';
  const both = roles.includes('vendor') && roles.includes('supplier');
  const opts = [];
  if (roles.includes('buyer')) opts.push({ role: 'buyer', label: 'Buying as', name: me, icon: 'basket-outline' });
  if (roles.includes('vendor')) opts.push({ role: 'vendor', label: both ? 'Selling as · farm' : 'Selling as', name: vendor?.business_name || 'Your farm', icon: 'barn' });
  if (roles.includes('supplier')) opts.push({ role: 'supplier', label: both ? 'Selling as · store' : 'Selling as', name: vendor?.business_name || 'Your store', icon: 'storefront-outline' });
  if (roles.includes('agent')) opts.push({ role: 'agent', label: 'Agent shop', name: (me.split(' ')[0] || 'Your') + "'s shop", icon: 'account-tie-outline' });
  if (roles.includes('vet')) opts.push({ role: 'vet', label: 'Vet desk', name: me, icon: 'stethoscope' });
  const active = opts.find((o) => o.role === profile?.active_role) || opts.find((o) => o.role === 'buyer') || opts[0] || { role: null, label: 'Account', name: me };
  return { opts, active };
}

function OptionList({ opts, active, onPick, onAdd }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      {opts.map((o) => {
        const on = o.role === active.role;
        return (
          <Pressable key={o.role} onPress={() => onPick(o.role)} accessibilityRole="menuitem" accessibilityState={{ selected: on }}
            style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10, borderRadius: 12, backgroundColor: hovered ? c.sf2 : 'transparent' })}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: on ? c.navact : c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name={o.icon} size={18} color={on ? c.navactink : c.mute} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="small" numberOfLines={1}>{o.label}</Txt>
              <Txt v={on ? 'bold' : 'strong'} numberOfLines={1}>{o.name}</Txt>
            </View>
            {on ? <Icon name="check" size={20} color={c.yolk} /> : null}
          </Pressable>
        );
      })}
      <Pressable onPress={onAdd} accessibilityRole="menuitem"
        style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 10, borderRadius: 12, backgroundColor: hovered ? c.sf2 : 'transparent' })}>
        <View style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={18} color={c.acc} /></View>
        <Txt v="bold" color={c.acc}>Add a role</Txt>
      </Pressable>
    </View>
  );
}

// variant 'sidebar' (website) or 'pill' (phone header). go(name, params) opens a screen; home() returns to the tabs.
export function RoleSwitcher({ variant = 'pill', go, home }) {
  const { c } = useTheme();
  const { setActiveRole } = useAuth();
  const { opts, active } = useRoleOptions();
  const [open, setOpen] = useState(false);
  const pick = async (role) => {
    setOpen(false);
    if (role && role !== active.role) { await setActiveRole(role); home?.(); }
  };
  const add = () => { setOpen(false); go?.('Role', { adding: true }); };
  const square = (sz) => (
    <View style={{ width: sz, height: sz, borderRadius: variant === 'pill' ? sz / 2 : 10, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="bold" color={c.hink} style={{ fontSize: sz > 30 ? 14 : 13, lineHeight: 18 }}>{initials(active.name)}</Txt>
    </View>
  );
  if (variant === 'sidebar') return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={'Switch role. ' + active.label + ' ' + active.name} accessibilityState={{ expanded: open }}
        style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: open ? c.line2 : c.line, backgroundColor: hovered || open ? c.sf2 : c.sf })}>
        {square(36)}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="small" numberOfLines={1}>{active.label}</Txt>
          <Txt v="bold" numberOfLines={1}>{active.name}</Txt>
        </View>
        <Icon name="unfold-more-horizontal" size={20} color={c.mute} />
      </Pressable>
      {open ? <View style={{ padding: 6, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.sf }}><OptionList opts={opts} active={active} onPick={pick} onAdd={add} /></View> : null}
    </View>
  );
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={'Switch role. ' + active.label + ' ' + active.name}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 6, paddingRight: 12, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.sf, maxWidth: 230 }}>
        {square(32)}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Txt v="small" numberOfLines={1} style={{ fontSize: 13, lineHeight: 15 }}>{active.label}</Txt>
          <Txt v="bold" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>{active.name}</Txt>
        </View>
        <Icon name="chevron-down" size={18} color={c.mute} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Txt v="h1">Switch role</Txt>
        <OptionList opts={opts} active={active} onPick={pick} onAdd={add} />
        <Button variant="outline" icon="account-circle-outline" title="Profile and settings" onPress={() => { setOpen(false); go?.('Profile'); }} />
      </Sheet>
    </>
  );
}

// Phone header on the top-level screens: role switcher on the left; dark mode, cart and Profile on the right.
// Renders nothing on the website (the sidebar carries the switcher).
export function TopBar({ navigation, cart = true, right }) {
  const { c, mode, toggle } = useTheme();
  const wide = useWide();
  const { count } = useCart();
  if (wide) return null;
  const round = { width: 44, height: 44, borderRadius: 22, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <RoleSwitcher variant="pill" go={(name, params) => navigation.navigate(name, params)} home={() => { if (navigation.getState?.()?.routeNames?.includes('Tabs')) navigation.popTo('Tabs'); }} />
      </View>
      {right}
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={mode === 'dark' ? 'Light mode' : 'Dark mode'} style={round}>
        <Icon name={mode === 'dark' ? 'white-balance-sunny' : 'weather-night'} size={20} />
      </Pressable>
      {cart ? (
        <Pressable onPress={() => navigation.navigate('Cart')} accessibilityRole="button" accessibilityLabel={'Cart, ' + count + ' items'} style={round}>
          <Icon name="shopping-outline" size={20} />
          {count ? <CountBadge n={count} style={{ position: 'absolute', top: -4, right: -4 }} /> : null}
        </Pressable>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Profile and settings" style={round}>
        <Icon name="account-circle-outline" size={22} />
      </Pressable>
    </View>
  );
}
