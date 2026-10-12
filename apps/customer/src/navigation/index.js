import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, Icon, EmailScreen, OtpScreen } from '@p360/shared';
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
import { InventoryScreen, InventoryFormScreen } from '../screens/inventory';
import { useFarm } from '../lib/offlineQueue';
import { syncVaccinationReminders, cancelVaccinationReminders, isVaccinationTap } from '../lib/reminders';

const Stack = createNativeStackNavigator();
const navRef = createNavigationContainerRef();

// Keeps the phone's vaccination reminders in step with the farm's schedule, and opens the schedule when one is tapped.
// Renders nothing. Mounted only for farm accounts.
function VaccinationReminders() {
  const { data } = useFarm();
  // Only re-plan when something that affects reminders changes.
  const key = data.vaccinations.map((v) => v.id + v.scheduled_date + (v.administered_date || '')).join('|') + '#' + data.flocks.map((f) => f.id + f.status).join('|');
  useEffect(() => {
    const t = setTimeout(() => syncVaccinationReminders(data.vaccinations, data.flocks), 1000);
    return () => clearTimeout(t);
  }, [key]);
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!isVaccinationTap(last)) return undefined;
    const t = setTimeout(() => { if (navRef.isReady()) navRef.navigate('Vaccinations'); }, 400);
    return () => clearTimeout(t);
  }, [last]);
  return null;
}
const Tab = createBottomTabNavigator();

function TabBar({ state, descriptors, navigation }) {
  const { c, f } = useTheme();
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.nav, borderTopWidth: 1, borderColor: c.line }}>
      <View style={{ height: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        {state.routes.map((r, i) => {
          const on = state.index === i; const o = descriptors[r.key].options;
          return (
            <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.title}
              onPress={() => navigation.navigate(r.name)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{ width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.navact : 'transparent' }}>
                <Icon name={on ? o.icon : o.iconOff || o.icon} size={22} color={on ? c.navactink : c.mute} />
              </View>
              <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={{ fontFamily: on ? f.bold : f.medium, fontSize: 12, color: on ? c.ink : c.mute }}>{o.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function BuyerTabs() {
  const { profile } = useAuth();
  const investor = INVEST_ENABLED && (profile?.roles || []).includes('investor');
  return (
    <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home', icon: 'home', iconOff: 'home-outline' }} />
      <Tab.Screen name="Market" component={MarketScreen} options={{ title: 'Market', icon: 'storefront', iconOff: 'storefront-outline' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders', icon: 'receipt-text', iconOff: 'receipt-text-outline' }} />
      {investor ? <Tab.Screen name="Invest" component={InvestHomeScreen} options={{ title: 'Invest', icon: 'chart-line', iconOff: 'chart-line' }} /> : null}
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet', icon: 'wallet', iconOff: 'wallet-outline' }} />
    </Tab.Navigator>
  );
}
function VendorTabs() {
  return (
    <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="VendorHome" component={VendorHomeScreen} options={{ title: 'Home', icon: 'home', iconOff: 'home-outline' }} />
      <Tab.Screen name="MyListings" component={MyListingsScreen} options={{ title: 'Listings', icon: 'package-variant-closed' }} />
      <Tab.Screen name="VendorOrders" component={VendorOrdersScreen} options={{ title: 'Orders', icon: 'receipt-text', iconOff: 'receipt-text-outline' }} />
      <Tab.Screen name="FarmHome" component={FarmHomeScreen} options={{ title: 'Farm Hub', icon: 'barn' }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet', icon: 'wallet', iconOff: 'wallet-outline' }} />
    </Tab.Navigator>
  );
}
function Tabs(props) {
  const { isVendorMode, profile } = useAuth();
  if (profile?.active_role === 'vet') return <VetDeskScreen {...props} />;
  return isVendorMode ? <VendorTabs /> : <BuyerTabs />;
}

function AuthFlow() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Email">{({ navigation }) => <EmailScreen onSent={(email) => navigation.navigate('Otp', { email })} />}</Stack.Screen>
      <Stack.Screen name="Otp">{({ navigation, route }) => <OtpScreen email={route.params.email} onEdit={() => navigation.goBack()} />}</Stack.Screen>
    </Stack.Navigator>
  );
}

export default function Navigation() {
  const { c, mode } = useTheme();
  const { session, profile, loading } = useAuth();
  // Signed out: this phone stops reminding about that account's flocks. (Kept above the early return: hooks must run every render.)
  useEffect(() => { if (session === null) cancelVaccinationReminders(); }, [session]);
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.ink, border: c.line, primary: c.ember } };
  if (loading) return <Splash />;
  const needsRole = session && !(profile?.roles || []).length;
  const farms = (profile?.roles || []).some((r) => r === 'vendor' || r === 'supplier');
  // The key on Stack.Navigator matters: Role, Business and VetApply exist in both groups (they double as "add a role" later).
  // Without it, finishing registration keeps you on the same-named screen instead of opening the app. A new key starts the main group at Tabs.
  return (
    <NavigationContainer theme={theme} ref={navRef}>
      {session && farms ? <VaccinationReminders /> : null}
      {!session ? <AuthFlow /> : (
        <Stack.Navigator key={needsRole ? 'onboarding' : 'app'} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {needsRole ? (<>
            <Stack.Screen name="Role" component={RoleScreen} />
            <Stack.Screen name="Business" component={BusinessScreen} />
            <Stack.Screen name="VetApply" component={VetApplyScreen} />
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
            <Stack.Screen name="InventoryForm" component={InventoryFormScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CreditLog" component={CreditLogScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CreditEntry" component={CreditEntryScreen} />
            <Stack.Screen name="CreditCustomer" component={CreditCustomerScreen} />
            <Stack.Screen name="CreditAllow" component={CreditAllowScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="MyCredit" component={MyCreditScreen} />
            <Stack.Screen name="VetApply" component={VetApplyScreen} />
            <Stack.Screen name="VetBooking" component={VetBookingScreen} />
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
    </NavigationContainer>
  );
}
