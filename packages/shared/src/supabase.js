import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Expo inlines EXPO_PUBLIC_* only when accessed literally as process.env.NAME.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
if (!url || !key) console.warn('Poultry360: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (or packages/shared/src/config.js)');

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

AppState.addEventListener('change', (s) => (s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));

// Realtime channels need a name that is unique per subscriber. supabase-js returns the EXISTING channel when a name repeats,
// and adding listeners to a channel that has already subscribed throws, which closes a release build. Always use this.
export const liveChannel = (name) => supabase.channel(name + ':' + Math.random().toString(36).slice(2, 10));

// Turns Postgres "raise exception 'CODE'" messages into readable copy.
const MESSAGES = {
  OUT_OF_COVERAGE: "We don't deliver to this area yet.",
  INSUFFICIENT_WALLET: 'Your wallet balance is too low for this payment.',
  INSUFFICIENT_FUNDS: "You don't have enough available balance.",
  NO_BANK: 'Add a verified bank account before withdrawing.',
  INVALID_CODE: "That code doesn't match or has expired.",
  INVALID_ACCOUNT: 'Enter a 10-digit NUBAN account number.',
  VENDOR_NOT_VERIFIED: 'Listings unlock once your farm is verified.',
  MORTALITY_EXCEEDS_FLOCK: "That's more than the birds left in this flock.",
  SLOT_TAKEN: 'That time was just taken. Pick another slot.',
  LOCATION_REQUIRED: 'Allow location to go available.',
  PROOF_REQUIRED: 'Capture proof of delivery first.',
  ALREADY_ACTIONED: 'This order was already updated.',
  NOT_CONFIRMED: 'Accept the order before marking it ready.',
  ROLE_REQUIRED: 'Choose at least one role to continue.',
  TRIP_FULL: 'That rider already has 4 orders. Request a new rider instead.',
  RIDER_LEFT: 'That rider has already left your farm. Request a new rider instead.',
  PICKUP_INCOMPLETE: 'Finish checking every order at the farm before you leave.',
  NOT_RIDER: "This account isn't a rider.",
  RIDER_INACTIVE: 'Your rider account is deactivated.',
  KYC_REQUIRED: 'Complete identity verification to invest.',
  KYC_UNDERAGE: 'You must be 18 or older to invest.',
  BADGE_REQUIRED: 'Your farm needs an investment badge before it can raise funds.',
  DOCS_REQUIRED: 'Upload at least one document.',
  FARM_NOT_VERIFIED: 'This farm is no longer verified for investment.',
  OFFERING_CLOSED: 'This opportunity is closed to new investment.',
  BELOW_MINIMUM: 'That is below the minimum investment.',
  EXCEEDS_REMAINING: 'That is more than the amount still being raised.',
  OFFERING_LOCKED: 'This offering can no longer be edited.',
  OFFERING_INVALID: 'Check the closing date. It must be at least 3 days away.',
  OWN_OFFERING: "You can't invest in your own farm.",
  COMMISSION_FUNDS: "Your wallet doesn't hold enough for the 10% commission on this order. Add funds, then mark it paid.",
  CREDIT_NOT_ALLOWED: "This farm hasn't set you up to pay later.",
  CREDIT_LIMIT: 'That is more than your remaining credit with this farm.',
  CREDIT_ONE_FARM: 'Pay later works for one farm at a time. Order from each farm separately.',
  NOT_ELIGIBLE: "This buyer hasn't bought enough from your farm to qualify yet.",
  RECEIPT_REQUIRED: 'Upload the payment receipt first.',
  DESCRIPTION_REQUIRED: 'Say what the customer took.',
  ITEMS_REQUIRED: 'Add at least one item they took.',
  INVALID_STORE_CODE: "That store code doesn't match any store. Check it with the store.",
  OWN_STORE: "That's your own store's code.",
  STORE_NOT_APPROVED: "This store isn't verified yet, so it can't take agents.",
  AGENT_HAS_STORE: 'You already sell for another store. Leave it first from your agent desk.',
  OUT_OF_STOCK: "There isn't enough stock for that.",
  NOT_AGENT: "You're not an agent for a store right now.",
  INVALID_AGENT_CODE: "That agent code isn't valid.",
  OWN_AGENT_CODE: "You can't use your own agent code.",
  INVALID_QTY: 'Enter a quantity above zero for each item.',
  INVALID_DISCOUNT: 'The discount must be from 0 to 99%.',
  NAME_REQUIRED: 'Enter a name.',
  BUSINESS_NAME_REQUIRED: 'Enter your business name.',
  INVALID_TYPE: 'Choose one of the options.',
  INVALID_AMOUNT: 'Enter an amount above zero.',
  NOT_VENDOR: 'Set up your farm or business first.',
  NOT_VET: "This account isn't registered as a vet.",
  VET_NOT_APPROVED: 'You can open slots once your licence is approved.',
  SLOT_BOOKED: "That slot is already booked, so it can't be removed.",
  SLOT_EXISTS: 'You already opened that time.',
  INVALID_TIME: 'Choose a time in the future.',
  INVALID_HOURS: 'The end time must be after the start time, with room for at least one consult.',
  SUMMARY_REQUIRED: 'Write a short summary for the farmer.',
};
export function friendlyError(e) {
  const m = (e && (e.message || e.error_description)) || String(e || 'Something went wrong');
  const code = Object.keys(MESSAGES).find((k) => m.includes(k));
  if (code) return MESSAGES[code];
  if (m.startsWith('ITEM_UNAVAILABLE')) return 'Some items are no longer available.';
  if (/network|fetch/i.test(m)) return "You're offline. Check your connection and try again.";
  return m;
}

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function uploadImage(bucket, uid, uri) {
  const ext = (uri.split('.').pop() || 'jpg').split('?')[0].toLowerCase();
  const path = uid + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/' + (ext === 'png' ? 'png' : 'jpeg') });
  if (error) throw error;
  return path;
}
export const publicUrl = (bucket, path) => (path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null);
