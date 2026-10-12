// Offline-first store for Farm Hub (PRD §10). Writes land locally first, then sync.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase, friendlyError } from '@p360/shared';

const Q = 'p360-farm-queue', C = 'p360-farm-cache', D = 'p360-device';
const TABLES = ['flocks', 'farm_logs', 'vaccinations', 'farm_inventory'];   // pulled into the local cache
const STAMPED = new Set(TABLES);                          // tables with updated_at / updated_by (last-write-wins)
const RETRY_MS = 15000;
const empty = () => ({ flocks: [], farm_logs: [], vaccinations: [], farm_inventory: [] });
let uid, queue = null, cache = null, device = null, online = true, syncing = null, again = false, lastSync = null, retryTimer = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f(snapshot()));
const key = (base) => base + ':' + (uid || 'anon');   // queue and cache are per signed-in user

export const uuid = () => Crypto.randomUUID();
function snapshot() {
  return {
    online, lastSync,
    pending: (queue || []).filter((x) => !x.error).length,
    failed: (queue || []).filter((x) => x.error),
    // Fresh arrays every time: screens memoise on these, so handing back the same objects would hide new entries until they remount.
    data: cache ? Object.fromEntries(Object.entries({ ...empty(), ...cache }).map(([k, v]) => [k, [...v]])) : empty(),
  };
}

async function load() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id || null;
  if (queue && id === uid) return;
  uid = id;
  let q = await AsyncStorage.getItem(key(Q)), ch = await AsyncStorage.getItem(key(C));
  // Earlier versions stored entries without the user id: adopt them once so nothing unsynced is lost.
  if (uid && q === null) {
    const [oq, oc] = await Promise.all([AsyncStorage.getItem(Q), AsyncStorage.getItem(C)]);
    if (oq || oc) { q = oq; ch = ch || oc; await AsyncStorage.multiRemove([Q, C]); }
  }
  // Failed entries get a fresh attempt each time the app starts.
  queue = JSON.parse(q || '[]').map((x) => ({ table: x.table, row: x.row, error: null }));
  cache = { ...empty(), ...JSON.parse(ch || '{}') };
  device = await AsyncStorage.getItem(D);
  if (!device) { device = 'Phone ' + uuid().slice(0, 4).toUpperCase(); AsyncStorage.setItem(D, device); }
}
const persist = () => Promise.all([AsyncStorage.setItem(key(Q), JSON.stringify(queue)), AsyncStorage.setItem(key(C), JSON.stringify(cache))]);

function applyLocal(table, row) {
  const list = cache[table] || (cache[table] = []);
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = { ...list[i], ...row }; else list.unshift(row);
}
// What actually goes to Postgres: no local flags, and no sync stamps on tables that don't have those columns.
function clean(table, row) {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_') && (STAMPED.has(table) || (k !== 'updated_at' && k !== 'updated_by'))));
}
// Worth retrying later (no connection, expired session) rather than a rejected entry.
const transient = (e) => !e.code && /network|fetch|timeout|timed out|abort/i.test(e.message || '') || e.code === 'PGRST301' || /jwt/i.test(e.message || '');

export async function save(table, row) {
  await load();
  const r = { ...row, id: row.id || uuid() };
  if (STAMPED.has(table)) { r.updated_at = new Date().toISOString(); r.updated_by = device; }
  applyLocal(table, { ...r, _pending: true, _failed: false });
  queue = queue.filter((x) => !(x.table === table && x.row.id === r.id));
  queue.push({ table, row: r, error: null });
  await persist(); emit(); sync();
  return r;
}

// Sends queued entries. Returns true if the connection dropped part-way.
async function push() {
  if (!uid || !queue.length) return false;
  // Flocks first: logs and vaccinations reference them.
  const batch = [...queue].sort((a, b) => (a.table === 'flocks' ? 0 : 1) - (b.table === 'flocks' ? 0 : 1));
  const blocked = new Set();   // flocks that aren't on the server yet; their entries wait
  for (const item of batch) {
    if (!queue.includes(item)) continue;   // replaced by a newer edit while syncing
    if (item.error) { if (item.table === 'flocks') blocked.add(item.row.id); continue; }
    if (blocked.has(item.row.flock_id)) continue;
    const row = clean(item.table, item.row);
    const { error } = await supabase.from(item.table).upsert(row);
    const current = queue.includes(item);   // entries saved during the request stay queued
    if (!error) {
      if (current) { queue = queue.filter((x) => x !== item); applyLocal(item.table, { ...row, _pending: false, _failed: false }); }
      continue;
    }
    if (transient(error)) return true;
    if (item.table === 'flocks') blocked.add(item.row.id);
    if (current) { item.error = friendlyError(error); applyLocal(item.table, { id: item.row.id, _pending: false, _failed: true }); }
  }
  return false;
}

async function fetchAll() {
  if (!uid) return;
  const res = await Promise.all(TABLES.map((t) => supabase.from(t).select('*').order('updated_at', { ascending: false }).limit(500)));
  if (res.every((r) => r.error)) return;
  // A table that fails (say, a migration not run yet) must not stop the others refreshing.
  TABLES.forEach((t, i) => { if (!res[i].error) cache[t] = res[i].data; });
  // Anything still queued is newer than the server copy.
  queue.forEach((x) => applyLocal(x.table, { ...x.row, _pending: !x.error, _failed: !!x.error }));
  if (!queue.some((x) => !x.error)) lastSync = new Date().toISOString();
}

// One sync at a time: push the queue, then refresh from the server. Safe to call as often as you like.
export function sync() {
  if (syncing) { again = true; return syncing; }
  syncing = (async () => {
    try {
      do {
        again = false;
        await load();
        const dropped = await push();
        if (!dropped) await fetchAll();
        await persist(); emit();
      } while (again);
    } catch (e) { /* storage or network hiccup: the retry below picks it up */ }
    finally {
      syncing = null;
      clearTimeout(retryTimer);
      // Keep trying while anything is waiting; a dropped request must never strand entries on the phone.
      if (again) { again = false; retryTimer = setTimeout(sync, 0); }
      else if (queue && queue.some((x) => !x.error)) retryTimer = setTimeout(sync, RETRY_MS);
      emit();
    }
  })();
  return syncing;
}
export const flush = sync;
export const pull = sync;

export async function retryFailed() { await load(); queue.forEach((x) => { x.error = null; }); await persist(); emit(); sync(); }
export async function discardFailed() {
  await load();
  const gone = new Set(queue.filter((x) => x.error && x.table === 'flocks').map((x) => x.row.id));
  queue = queue.filter((x) => !x.error && !gone.has(x.row.flock_id));
  await persist(); emit(); sync();
}

// isInternetReachable is unreliable on some networks, so only a definite "not connected" counts as offline.
NetInfo.addEventListener((s) => {
  const was = online;
  online = s.isConnected !== false;
  emit();
  if (online && !was) sync();
});
AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
// Signing in or out switches to that user's own queue and cache.
supabase.auth.onAuthStateChange(() => { setTimeout(sync, 0); });   // load() notices the user change

export function useFarm() {
  const [st, setSt] = useState(snapshot());
  useEffect(() => { subs.add(setSt); load().then(() => { emit(); sync(); }); return () => subs.delete(setSt); }, []);
  return st;
}

// Derived numbers used across Farm Hub screens.
export function flockStats(flock, logs) {
  const mine = logs.filter((l) => l.flock_id === flock.id);
  const dead = mine.filter((l) => l.kind === 'mortality').reduce((s, l) => s + Number(l.quantity), 0);
  const alive = flock.size - dead;
  const days = Math.max(0, Math.floor((Date.now() - new Date(flock.start_date).getTime()) / 864e5));
  const prod = mine.filter((l) => l.kind === 'production').sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  return { alive, dead, mortality: flock.size ? (dead / flock.size) * 100 : 0, days, week: Math.floor(days / 7) + 1,
    lastProduction: prod[0]?.quantity, pending: mine.filter((l) => l._pending).length };
}
