import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef, StackActions, getStateFromPath } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
// Local notifications are phone-only; the browser build has no reminders to open.
const useLastResponse = Platform.OS === 'web' ? () => null : Notifications.useLastNotificationResponse;
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, Icon, EmailScreen, OtpScreen, SignInScreen, PasswordScreen, usePasswordGate, useWide, LOGO_MARK, Txt, inviteOpenedNow, getPendingInvite, pendingInviteNow, rpc, CountBadge } from '@p360/shared';
import { RoleSwitcher } from '../components/RoleSwitcher';
import { useAuth } from '../context/AuthContext';
import { Splash, RoleScreen, BusinessScreen, PendingScreen } from '../screens/onboarding';
import { HomeScreen, MarketScreen, ListingsScreen, ProductScreen, StoreScreen } from '../screens/buyer';
import { CartScreen, CheckoutScreen, OrderSuccessScreen } from '../screens/checkout';
import { OrdersScreen, TrackingScreen, RateScreen, IssueScreen } from '../screens/orders';
import { WalletScreen, TopUpScreen, WithdrawScreen, BankScreen } from '../screens/wallet';
import { VendorHomeScreen, MyListingsScreen, ListingFormScreen, VendorOrdersScreen, VendorOrderScreen } from '../screens/vendor';
import { FarmHomeScreen, FlockFormScreen, FlockDetailScreen, FlockHistoryScreen, LogScreen, VaccinationsScreen, FarmDashboardScreen } from '../screens/farm';
import { VetHomeScreen, VetListScreen, VetProfileScreen, ConsultationScreen, SymptomScreen, HealthRecordsScreen, OnsiteScreen } from '../screens/vet';
import { WasteHomeScreen } from '../screens/waste';
import { ProfileScreen } from '../screens/profile';
import { InvestHomeScreen, KycScreen, OfferingScreen, PoolsScreen, PoolScreen, RoiCalcScreen, InvestAmountScreen, InvestSuccessScreen, PortfolioScreen, InvestmentDetailScreen, TxDetailScreen } from '../screens/invest';
import { RaiseHomeScreen, BadgeScreen, OfferingFormScreen } from '../screens/raise';
import { INVEST_ENABLED } from '../lib/roi';
import { FarmBookScreen, CreditLogScreen, CreditEntryScreen, CreditCustomerScreen, CreditAllowScreen, MyCreditScreen } from '../screens/farmbook';
import { VetApplyScreen, VetDeskScreen, VetBookingScreen } from '../screens/vetdesk';
import { WantedNewScreen, MyWantedScreen, WantedDetailScreen, WantedBoardScreen } from '../screens/wanted';
import { AgentJoinScreen, AgentDeskScreen, AgentSaleScreen, AgentBuyScreen, StoreAgentsScreen, StoreAgentScreen, StoreGiveStockScreen, JoinStoreScreen, AgentShopScreen } from '../screens/agents';
import { LandingScreen, WebNav } from '../screens/landing';
import { ExploreScreen } from '../screens/explore';
import { InventoryScreen, InventoryFormScreen } from '../screens/inventory';
import { CareGuideScreen } from '../screens/careguide';
import { useFarm } from '../lib/offlineQueue';
import { syncVaccinationReminders, cancelVaccinationReminders, isVaccinationTap } from '../lib/reminders';

const Stack = createNativeStackNavigator();
const navRef = createNavigationContainerRef();

// Keeps the phone's vaccination reminders in step with the farm's schedule, and opens the schedule when one is tapped.
// Renders nothing. Mounted only for farm accounts.
// Someone who opened a store's invite link and then signed in: take them to the join page once.
function InviteOpener() {
  useEffect(() => {
    let alive = true;
    // Website: only an invite link opened on this visit (an old one must not keep taking over the site).
    (Platform.OS === 'web' ? Promise.resolve(inviteOpenedNow()) : getPendingInvite()).then((code) => {
      if (!alive || !code) return;
      const go = () => (navRef.isReady() ? navRef.navigate('JoinStore', { code }) : setTimeout(go, 200));
      setTimeout(go, 300);
    });
    return () => { alive = false; };
  }, []);
  return null;
}

function VaccinationReminders() {
  const { data } = useFarm();
  // Only re-plan when something that affects reminders changes.
  const key = data.vaccinations.map((v) => v.id + v.scheduled_date + (v.administered_date || '')).join('|') + '#' + data.flocks.map((f) => f.id + f.status).join('|');
  useEffect(() => {
    const t = setTimeout(() => syncVaccinationReminders(data.vaccinations, data.flocks), 1000);
    return () => clearTimeout(t);
  }, [key]);
  const last = useLastResponse();
  useEffect(() => {
    if (!isVaccinationTap(last)) return undefined;
    const t = setTimeout(() => { if (navRef.isReady()) navRef.navigate('Vaccinations'); }, 400);
    return () => clearTimeout(t);
  }, [last]);
  return null;
}
const Tab = createBottomTabNavigator();

// Orange counts beside nav items: new or accepted orders for a seller or agent, orders on their way for a buyer.
// Refreshed when the page changes (at most every 30 s) and every 2 minutes.
const BADGES = { at: 0, key: '', value: {} };
function useNavBadges(trigger) {
  const { profile, uid } = useAuth();
  const mode = profile?.active_role;
  const [b, setB] = useState(BADGES.key === uid + mode ? BADGES.value : {});
  useEffect(() => {
    if (!uid || mode === 'vet') return undefined;
    let alive = true;
    const run = (force) => {
      if (!force && BADGES.key === uid + mode && Date.now() - BADGES.at < 30000) return;
      BADGES.at = Date.now(); BADGES.key = uid + mode;
      const seller = ['vendor', 'supplier', 'agent'].includes(mode);
      (seller ? rpc('vendor_orders') : rpc('buyer_orders')).then((list) => {
        const n = seller ? (list || []).filter((o) => o.status === 'placed' || o.status === 'confirmed').length
          : (list || []).filter((o) => (o.subs || []).some((x) => ['placed', 'confirmed', 'ready', 'picked_up', 'out_for_delivery'].includes(x.status))).length;
        const value = seller ? { VendorOrders: n } : { Orders: n };
        BADGES.value = value;
        if (alive) setB(value);
      }).catch(() => {});
    };
    run(false);
    const t = setInterval(() => run(true), 120000);
    return () => { alive = false; clearInterval(t); };
  }, [uid, mode, trigger]);
  return b;
}

// The sections of the signed-in app for the current mode. The phone shows them as the bottom tab bar,
// the website as the left sidebar.
function useTabItems() {
  const { profile, isVendorMode, supplierOnly, storeLocked } = useAuth();
  if (profile?.active_role === 'vet') return [{ name: 'VetDeskHome', component: VetDeskScreen, title: 'Vet desk', icon: 'stethoscope', iconOff: 'stethoscope' }];
  if (profile?.active_role === 'agent') return [
    { name: 'AgentHome', component: AgentDeskScreen, title: 'Dashboard', icon: 'view-dashboard', iconOff: 'view-dashboard-outline' },
    { name: 'VendorOrders', component: VendorOrdersScreen, title: 'Orders', icon: 'receipt-text', iconOff: 'receipt-text-outline' },
    { name: 'Wallet', component: WalletScreen, title: 'Wallet', icon: 'wallet', iconOff: 'wallet-outline' },
  ];
  if (isVendorMode) return [
    { name: 'VendorHome', component: VendorHomeScreen, title: 'Home', icon: 'home', iconOff: 'home-outline' },
    { name: 'MyListings', component: MyListingsScreen, title: supplierOnly ? 'Products' : 'Listings', icon: 'package-variant-closed' },
    // a store in review only prepares its products; the rest opens on approval
    ...(storeLocked ? [] : [
      { name: 'VendorOrders', component: VendorOrdersScreen, title: 'Orders', icon: 'receipt-text', iconOff: 'receipt-text-outline' },
      supplierOnly ? { name: 'Agents', component: StoreAgentsScreen, title: 'Agents', icon: 'account-group', iconOff: 'account-group-outline' }
        : { name: 'FarmHome', component: FarmHomeScreen, title: 'Farm Hub', icon: 'barn' },
      { name: 'Wallet', component: WalletScreen, title: 'Wallet', icon: 'wallet', iconOff: 'wallet-outline' }]),
  ];
  const investor = INVEST_ENABLED && (profile?.roles || []).includes('investor');
  return [
    { name: 'Home', component: HomeScreen, title: 'Home', icon: 'home', iconOff: 'home-outline' },
    { name: 'Market', component: MarketScreen, title: 'Market', icon: 'storefront', iconOff: 'storefront-outline' },
    { name: 'Orders', component: OrdersScreen, title: 'Orders', icon: 'receipt-text', iconOff: 'receipt-text-outline' },
    ...(investor ? [{ name: 'Invest', component: InvestHomeScreen, title: 'Invest', icon: 'chart-line', iconOff: 'chart-line' }] : []),
    { name: 'Wallet', component: WalletScreen, title: 'Wallet', icon: 'wallet', iconOff: 'wallet-outline' },
  ];
}

// Website: every page gets its own address and a browser history entry, so the browser's back (or a phone's
// swipe back in Chrome) returns to the previous page instead of leaving the site. Paths are the screen names
// in kebab case (/product, /farm-book); the tabs sit at the top level (/market, /orders).
const kebab = (n) => n.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const TAB_PATHS = { Home: '', Market: 'market', Orders: 'orders', Invest: 'invest', Wallet: 'wallet', VendorHome: 'dashboard', MyListings: 'products', VendorOrders: 'sales', Agents: 'agents', FarmHome: 'farm-hub', AgentHome: 'my-shop', VetDeskHome: 'vet-desk' };
// Pages that can be reopened from their address alone after a reload (their params are plain ids).
// Any other page with params reopens at home: a reload can't bring back what was passed to it.
const APP_SCREENS = ['Role', 'Business', 'VetApply', 'AgentJoin', 'Listings', 'Product', 'Store', 'Cart', 'Checkout', 'OrderSuccess', 'Tracking', 'Rate', 'Issue',
  'TopUp', 'Withdraw', 'Bank', 'ListingForm', 'VendorOrder', 'FlockForm', 'FlockDetail', 'FlockHistory', 'Log', 'Vaccinations', 'FarmDashboard', 'VetHome', 'VetList',
  'VetProfile', 'Consultation', 'Symptom', 'HealthRecords', 'Onsite', 'WasteHome', 'Profile', 'Pending', 'TxDetail', 'FarmBook', 'Inventory', 'CareGuide',
  'InventoryForm', 'CreditLog', 'CreditEntry', 'CreditCustomer', 'CreditAllow', 'MyCredit', 'VetBooking', 'AgentSale', 'StoreAgents', 'Explore', 'JoinStore', 'WantedNew', 'MyWanted', 'WantedDetail', 'WantedBoard',
  'StoreAgent', 'AgentBuy', 'StoreGiveStock', 'ShopOrders', 'InvestHome', 'Kyc', 'Offering', 'Pools', 'Pool', 'RoiCalc', 'InvestAmount', 'InvestSuccess', 'Portfolio', 'InvestmentDetail', 'RaiseHome',
  'Badge', 'OfferingForm'];
const RELOADABLE = new Set(['Product', 'Store', 'Listings', 'Tracking', 'VendorOrder', 'FlockDetail', 'AgentShop', 'WantedDetail']);
function webLinking(signedIn) {
  if (Platform.OS !== 'web') return undefined;
  const screens = (names) => Object.fromEntries(names.map((n) => [n, kebab(n)]));
  const config = signedIn
    ? { initialRouteName: 'Tabs', screens: { Tabs: { path: '', screens: TAB_PATHS }, ...screens(APP_SCREENS), AgentShop: 'a/:code' } }
    : { initialRouteName: 'Landing', screens: { Landing: '', ...screens(['Market', 'Listings', 'Product', 'Store', 'Cart', 'JoinStore', 'SignIn', 'Email', 'Otp']), AgentShop: 'a/:code' } };
  return {
    prefixes: [],
    config,
    getStateFromPath: (path, options) => {
      // The site's root opens wherever the navigator starts (the join page when an invite link was opened).
      if (path === '/' || path === '') return undefined;
      const state = getStateFromPath(path, options);
      let leaf = state?.routes?.[state.routes.length - 1];
      while (leaf?.state) leaf = leaf.state.routes[leaf.state.routes.length - 1];
      if (leaf?.params && Object.keys(leaf.params).length && !RELOADABLE.has(leaf.name)) return undefined;
      return state;
    },
  };
}

// The tab the app is on (also while a page is open on top of the tabs), or 'Profile' on the profile page.
function currentSection(state) {
  if (!state) return null;
  const top = state.routes[state.index];
  if (top?.name === 'Profile') return 'Profile';
  const t = state.routes.find((r) => r.name === 'Tabs')?.state;
  return t ? t.routes[t.index ?? 0]?.name : null;
}
// Go to a section from anywhere: close the pages open on top of the tabs, then switch tab.
function openSection(name) {
  if (!navRef.isReady()) return;
  const root = navRef.getRootState();
  if (root.routes[root.index]?.name !== 'Tabs') navRef.dispatch(StackActions.popTo('Tabs'));
  setTimeout(() => navRef.navigate(name), 0);
}

// Website: the left sidebar. It sits outside the navigator so it stays on every page, not just the tabs.
function Sidebar({ current }) {
  const { c, f, mode, toggle } = useTheme();
  const items = useTabItems();
  const badges = useNavBadges(current);
  const sel = current || items[0].name;
  const item = (key, icon, label, on, onPress, role, badge) => (
    <Pressable key={key} accessibilityRole={role} accessibilityState={role === 'tab' ? { selected: on } : undefined} onPress={onPress}
      style={({ hovered }) => ({ height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: on ? c.navact : hovered ? c.sf2 : 'transparent' })}>
      <Icon name={icon} size={22} color={on ? c.navactink : c.mute} />
      <Text style={{ flex: 1, fontFamily: on ? f.bold : f.semibold, fontSize: 15, color: on ? c.navactink : c.ink }}>{label}</Text>
      <CountBadge n={badge} />
    </Pressable>
  );
  const goTo = (name, params) => { if (navRef.isReady()) navRef.navigate(name, params); };
  const goHome = () => { if (!navRef.isReady()) return; const root = navRef.getRootState(); if (root.routes[root.index]?.name !== 'Tabs') navRef.dispatch(StackActions.popTo('Tabs')); };
  return (
    <View style={{ width: 248, backgroundColor: c.nav, borderRightWidth: 1, borderColor: c.line, paddingVertical: 20, paddingHorizontal: 14, gap: 4 }}>
      <Pressable onPress={() => openSection(items[0].name)} accessibilityRole="link" accessibilityLabel="Poultry360 home" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 20 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center' }}><Image source={LOGO_MARK} style={{ width: 34, height: 34 }} /></View>
        <Txt v="h2" style={{ fontSize: 20 }}>Poultry360</Txt>
      </Pressable>
      <View style={{ marginBottom: 14 }}><RoleSwitcher variant="sidebar" go={goTo} home={goHome} /></View>
      {items.map((t) => { const on = sel === t.name && current !== 'Profile'; return item(t.name, on ? t.icon : t.iconOff || t.icon, t.title, on, () => openSection(t.name), 'tab', badges[t.name]); })}
      <View style={{ flex: 1 }} />
      {item('theme', mode === 'dark' ? 'white-balance-sunny' : 'weather-night', mode === 'dark' ? 'Light mode' : 'Dark mode', false, toggle, 'button')}
      {item('Profile', 'account-circle-outline', 'Profile', current === 'Profile', () => { if (current !== 'Profile' && navRef.isReady()) navRef.navigate('Profile'); }, 'link')}
    </View>
  );
}

function TabBar({ state, descriptors, navigation }) {
  const { c, f } = useTheme();
  const badges = useNavBadges(state.index);
  if (useWide() || state.routes.length < 2) return null;   // the website uses Sidebar instead; one section needs no tab bar
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.nav, borderTopWidth: 1, borderColor: c.line }}>
      <View style={{ height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        {state.routes.map((r, i) => {
          const on = state.index === i; const o = descriptors[r.key].options;
          return (
            <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.title}
              onPress={() => navigation.navigate(r.name)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{ width: 68, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                {/* The pill is its own view with fixed styles: toggling backgroundColor on one view rendered square corners on Android. */}
                {on ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 17, overflow: 'hidden', backgroundColor: c.navact }} /> : null}
                <Icon name={on ? o.icon : o.iconOff || o.icon} size={22} color={on ? c.navactink : c.mute} />
                {badges[r.name] ? <CountBadge n={badges[r.name]} style={{ position: 'absolute', top: -6, right: 6 }} /> : null}
              </View>
              <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={{ fontFamily: on ? f.semibold : f.medium, fontSize: 13, color: on ? c.ink : c.mute }}>{o.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function MainTabs({ mode }) {
  const items = useTabItems();
  return (
    <Tab.Navigator key={mode} tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      {items.map((t) => <Tab.Screen key={t.name} name={t.name} component={t.component} options={{ title: t.title, icon: t.icon, iconOff: t.iconOff }} />)}
    </Tab.Navigator>
  );
}
function Tabs(props) {
  const { isVendorMode, profile } = useAuth();
  if (profile?.active_role === 'vet') return <MainTabs mode="vet" />;
  if (profile?.active_role === 'agent') return <MainTabs mode="agent" />;
  return <MainTabs mode={isVendorMode ? 'vendor' : 'buyer'} />;
}

// On the website the sign-in pages carry the site's nav bar. shop: the public shop pages, which keep Sign in / Get started in it.
function WebAuth({ navigation, children, shop }) {
  if (Platform.OS !== 'web') return children;
  return <View style={{ flex: 1 }}><WebNav navigation={navigation} compact={!shop} /><View style={{ flex: 1 }}>{children}</View></View>;
}
// Website visitors can browse the market before they have an account; checking out asks them to sign in.
const PUBLIC_SHOP = [['Market', MarketScreen], ['Listings', ListingsScreen], ['Product', ProductScreen], ['Store', StoreScreen], ['Cart', CartScreen], ['AgentShop', AgentShopScreen]];

function AuthFlow() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={Platform.OS !== 'web' ? 'SignIn' : inviteOpenedNow() ? 'JoinStore' : 'Landing'}>
      {Platform.OS === 'web' ? <Stack.Screen name="Landing" component={LandingScreen} /> : null}
      {Platform.OS === 'web' ? PUBLIC_SHOP.map(([name, C]) => <Stack.Screen key={name} name={name}>{(p) => <WebAuth navigation={p.navigation} shop><C {...p} /></WebAuth>}</Stack.Screen>) : null}
      {Platform.OS === 'web' ? <Stack.Screen name="JoinStore">{(p) => <WebAuth navigation={p.navigation}><JoinStoreScreen {...p} /></WebAuth>}</Stack.Screen> : null}
      <Stack.Screen name="SignIn">{({ navigation }) => <WebAuth navigation={navigation}><SignInScreen onCreate={() => navigation.navigate('Email', { mode: 'signup' })} onForgot={(email) => navigation.navigate('Email', { mode: 'reset', email })} /></WebAuth>}</Stack.Screen>
      <Stack.Screen name="Email">{({ navigation, route }) => <WebAuth navigation={navigation}><EmailScreen mode={route.params?.mode} initialEmail={route.params?.email} onBack={() => navigation.goBack()} onSent={(email) => navigation.navigate('Otp', { email, mode: route.params?.mode })} /></WebAuth>}</Stack.Screen>
      <Stack.Screen name="Otp">{({ navigation, route }) => <WebAuth navigation={navigation}><OtpScreen email={route.params.email} onEdit={() => navigation.goBack()} step={route.params?.mode === 'reset' ? null : 2} /></WebAuth>}</Stack.Screen>
    </Stack.Navigator>
  );
}

export default function Navigation() {
  const { c, mode } = useTheme();
  const { session, profile, loading } = useAuth();
  const wide = useWide();
  const [navState, setNavState] = useState(null);
  // Signed out: this phone stops reminding about that account's flocks. (Kept above the early return: hooks must run every render.)
  useEffect(() => { if (session === null) cancelVaccinationReminders(); }, [session]);
  const gate = usePasswordGate(session);   // 'create' for accounts with no password yet, 'change' after a reset or from Profile
  // Finishing sign-up (business form, vet application, joining a store) swaps the sign-up screens for the app.
  // Business and VetApply exist in both groups, so React Navigation could carry the open form across: it reopened
  // empty and needed a second Submit. Start the app at its home instead.
  const signingUp = !!session && !!profile && !(profile.roles || []).length;
  const wasSigningUp = useRef(false);
  useEffect(() => {
    if (signingUp) { wasSigningUp.current = true; return undefined; }
    if (!wasSigningUp.current || !session) return undefined;
    wasSigningUp.current = false;
    let t; const go = () => { if (navRef.isReady()) navRef.resetRoot({ index: 0, routes: [{ name: 'Tabs' }] }); else t = setTimeout(go, 50); };
    t = setTimeout(go, 0);
    return () => clearTimeout(t);
  }, [signingUp, session]);
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.ink, border: c.line, primary: c.ember } };
  // Signed in but no password yet (or choosing a new one): that comes before anything else in the app.
  if (session && gate) return <PasswordScreen mode={gate} email={session.user?.email} />;
  if (loading) return <Splash />;
  const needsRole = session && !(profile?.roles || []).length;
  const farms = (profile?.roles || []).some((r) => r === 'vendor' || r === 'supplier');
  // Website, signed in: the sidebar stays beside every page, for every role (it carries the role switcher).
  const sidebar = wide && session && !needsRole;
  // The key on Stack.Navigator matters: Role, Business and VetApply exist in both groups (they double as "add a role" later).
  // Without it, finishing registration keeps you on the same-named screen instead of opening the app. A new key starts the main group at Tabs.
  return (
    <NavigationContainer theme={theme} ref={navRef} linking={webLinking(!!session && !needsRole)} documentTitle={{ formatter: () => 'Poultry360' }}
      onReady={() => setNavState(navRef.getRootState())} onStateChange={setNavState}>
      {session && farms ? <VaccinationReminders /> : null}
      {session && !needsRole ? <InviteOpener /> : null}
      <View style={{ flex: 1, flexDirection: 'row' }}>
      {sidebar ? <Sidebar current={currentSection(navState)} /> : null}
      <View style={{ flex: 1 }}>
      {!session ? <AuthFlow /> : (
        <Stack.Navigator key={needsRole ? 'onboarding' : 'app'} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
          initialRouteName={needsRole ? (pendingInviteNow() ? 'AgentJoin' : 'Role') : 'Tabs'}>
          {needsRole ? (<>
            <Stack.Screen name="Role" component={RoleScreen} />
            <Stack.Screen name="Business" component={BusinessScreen} />
            <Stack.Screen name="VetApply" component={VetApplyScreen} />
            <Stack.Screen name="AgentJoin" component={AgentJoinScreen} />
          </>) : (<>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Listings" component={ListingsScreen} />
            <Stack.Screen name="Product" component={ProductScreen} />
            <Stack.Screen name="Store" component={StoreScreen} />
            <Stack.Screen name="Cart" component={CartScreen} />
            <Stack.Screen name="Checkout" component={CheckoutScreen} />
            <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="Tracking" component={TrackingScreen} />
            <Stack.Screen name="Rate" component={RateScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Issue" component={IssueScreen} />
            <Stack.Screen name="TopUp" component={TopUpScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Withdraw" component={WithdrawScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Bank" component={BankScreen} />
            <Stack.Screen name="ListingForm" component={ListingFormScreen} />
            <Stack.Screen name="VendorOrder" component={VendorOrderScreen} />
            <Stack.Screen name="FlockForm" component={FlockFormScreen} />
            <Stack.Screen name="FlockDetail" component={FlockDetailScreen} />
            <Stack.Screen name="FlockHistory" component={FlockHistoryScreen} />
            <Stack.Screen name="Log" component={LogScreen} />
            <Stack.Screen name="Vaccinations" component={VaccinationsScreen} />
            <Stack.Screen name="FarmDashboard" component={FarmDashboardScreen} />
            <Stack.Screen name="VetHome" component={VetHomeScreen} />
            <Stack.Screen name="VetList" component={VetListScreen} />
            <Stack.Screen name="VetProfile" component={VetProfileScreen} />
            <Stack.Screen name="Consultation" component={ConsultationScreen} />
            <Stack.Screen name="Symptom" component={SymptomScreen} />
            <Stack.Screen name="HealthRecords" component={HealthRecordsScreen} />
            <Stack.Screen name="Onsite" component={OnsiteScreen} />
            <Stack.Screen name="WasteHome" component={WasteHomeScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Business" component={BusinessScreen} />
            <Stack.Screen name="Role" component={RoleScreen} />
            <Stack.Screen name="Pending" component={PendingScreen} />
            <Stack.Screen name="TxDetail" component={TxDetailScreen} />
            <Stack.Screen name="FarmBook" component={FarmBookScreen} />
            <Stack.Screen name="Inventory" component={InventoryScreen} />
            <Stack.Screen name="CareGuide" component={CareGuideScreen} />
            <Stack.Screen name="InventoryForm" component={InventoryFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CreditLog" component={CreditLogScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CreditEntry" component={CreditEntryScreen} />
            <Stack.Screen name="CreditCustomer" component={CreditCustomerScreen} />
            <Stack.Screen name="CreditAllow" component={CreditAllowScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="MyCredit" component={MyCreditScreen} />
            <Stack.Screen name="VetApply" component={VetApplyScreen} />
            <Stack.Screen name="VetBooking" component={VetBookingScreen} />
            <Stack.Screen name="AgentJoin" component={AgentJoinScreen} />
            <Stack.Screen name="AgentSale" component={AgentSaleScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="AgentBuy" component={AgentBuyScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="StoreGiveStock" component={StoreGiveStockScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="ShopOrders" component={VendorOrdersScreen} />
            <Stack.Screen name="StoreAgents" component={StoreAgentsScreen} />
            <Stack.Screen name="WantedNew" component={WantedNewScreen} />
            <Stack.Screen name="MyWanted" component={MyWantedScreen} />
            <Stack.Screen name="WantedDetail" component={WantedDetailScreen} />
            <Stack.Screen name="WantedBoard" component={WantedBoardScreen} />
            <Stack.Screen name="Explore" component={ExploreScreen} />
            <Stack.Screen name="JoinStore" component={JoinStoreScreen} />
            <Stack.Screen name="StoreAgent" component={StoreAgentScreen} />
            <Stack.Screen name="AgentShop" component={AgentShopScreen} />
            {INVEST_ENABLED ? (<>
              <Stack.Screen name="InvestHome" component={InvestHomeScreen} />
              <Stack.Screen name="Kyc" component={KycScreen} />
              <Stack.Screen name="Offering" component={OfferingScreen} />
              <Stack.Screen name="Pools" component={PoolsScreen} />
              <Stack.Screen name="Pool" component={PoolScreen} />
              <Stack.Screen name="RoiCalc" component={RoiCalcScreen} />
              <Stack.Screen name="InvestAmount" component={InvestAmountScreen} options={{ presentation: 'modal' }} />
              <Stack.Screen name="InvestSuccess" component={InvestSuccessScreen} options={{ gestureEnabled: false }} />
              <Stack.Screen name="Portfolio" component={PortfolioScreen} />
              <Stack.Screen name="InvestmentDetail" component={InvestmentDetailScreen} />
              <Stack.Screen name="RaiseHome" component={RaiseHomeScreen} />
              <Stack.Screen name="Badge" component={BadgeScreen} />
              <Stack.Screen name="OfferingForm" component={OfferingFormScreen} />
            </>) : null}
          </>)}
        </Stack.Navigator>
      )}
      </View>
      </View>
    </NavigationContainer>
  );
}
