// Vaccination reminders as local notifications: scheduled on the phone, so they fire with no signal.
// Each pending vaccination gets one at 9am two days before and one at 7am on the day.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CHANNEL = 'vaccinations';
const PREFIX = 'vac-';
const TOLD = 'p360-vac-told';   // vaccinations already announced "due today", so it is said once
const MAX = 40;                 // iOS allows 64 pending notifications per app; stay well inside it

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function notificationsAllowed() {
  try { return (await Notifications.getPermissionsAsync()).granted; } catch { return false; }
}
// Shows the system prompt if it can still be shown. { granted, canAskAgain }
export async function askForNotifications() {
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
    return { granted: p.granted, canAskAgain: p.canAskAgain };
  } catch { return { granted: false, canAskAgain: false }; }
}

const localTime = (ymd, hour, addDays = 0) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d + addDays, hour, 0, 0); };
const niceDate = (ymd) => localTime(ymd, 12).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });

// Pure: which reminders should exist right now. Exported so it can be tested without a phone.
export function planReminders(vaccinations, flocks, now, told = {}) {
  const plan = [];
  for (const v of vaccinations || []) {
    const f = (flocks || []).find((x) => x.id === v.flock_id);
    if (v.administered_date || !f || f.status === 'inactive' || !/^\d{4}-\d{2}-\d{2}$/.test(v.scheduled_date || '')) continue;
    const what = v.vaccine + ' for ' + (f.code || 'your flock');
    const early = localTime(v.scheduled_date, 9, -2), onDay = localTime(v.scheduled_date, 7), dayEnds = localTime(v.scheduled_date, 24);
    if (early.getTime() > now) plan.push({ id: PREFIX + v.id + '-early', at: early.getTime(), title: 'Vaccination in 2 days', body: what + ' is due on ' + niceDate(v.scheduled_date) + '. Check that you have the vaccine in store.' });
    if (onDay.getTime() > now) plan.push({ id: PREFIX + v.id, at: onDay.getTime(), title: 'Vaccination due today', body: what + ' is due today. Mark it administered in Farm Hub once it is done.' });
    // Scheduled for today after 7am has passed: say so straight away, once.
    else if (now < dayEnds.getTime() && told[v.id] !== v.scheduled_date) plan.push({ id: PREFIX + v.id, now: true, vaccination: v.id, date: v.scheduled_date, title: 'Vaccination due today', body: what + ' is due today. Mark it administered in Farm Hub once it is done.' });
  }
  const later = plan.filter((p) => !p.now).sort((a, b) => a.at - b.at).slice(0, MAX);
  return [...plan.filter((p) => p.now), ...later];
}

let chain = Promise.resolve();   // one sync at a time; overlapping runs would double-schedule

export function syncVaccinationReminders(vaccinations, flocks) {
  chain = chain.then(() => run(vaccinations, flocks)).catch(() => {});
  return chain;
}

async function run(vaccinations, flocks) {
  if (!(await notificationsAllowed())) return;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Vaccination reminders', importance: Notifications.AndroidImportance.HIGH });
  const told = JSON.parse((await AsyncStorage.getItem(TOLD)) || '{}');
  const plan = planReminders(vaccinations, flocks, Date.now(), told);
  const wanted = new Map(plan.filter((p) => !p.now).map((p) => [p.id, p]));
  const existing = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(PREFIX));
  // Remove reminders for vaccinations that were given, moved, deleted, or belong to a closed flock.
  await Promise.all(existing.filter((n) => !wanted.has(n.identifier)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  for (const p of wanted.values()) {
    const cur = existing.find((n) => n.identifier === p.id);
    if (cur && cur.content?.data?.at === p.at) continue;   // already set for the same moment
    await Notifications.scheduleNotificationAsync({ identifier: p.id, content: { title: p.title, body: p.body, sound: true, data: { kind: 'vaccination', at: p.at } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: CHANNEL } });
  }
  for (const p of plan.filter((x) => x.now)) {
    await Notifications.scheduleNotificationAsync({ identifier: p.id, content: { title: p.title, body: p.body, sound: true, data: { kind: 'vaccination' } }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
    told[p.vaccination] = p.date;
  }
  // Forget "told" marks for vaccinations that no longer exist.
  const ids = new Set((vaccinations || []).map((v) => v.id));
  Object.keys(told).forEach((k) => { if (!ids.has(k)) delete told[k]; });
  await AsyncStorage.setItem(TOLD, JSON.stringify(told));
}

// Signing out: this phone should stop reminding about that account's flocks.
export function cancelVaccinationReminders() {
  chain = chain.then(async () => {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  }).catch(() => {});
  return chain;
}

export const isVaccinationTap = (response) => response?.notification?.request?.content?.data?.kind === 'vaccination';
