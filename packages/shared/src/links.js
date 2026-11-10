// Share links and what a link brought with it.
//   Store invite:  <WEB_URL>/join/<STORE CODE>  -> "Join <store> as an agent" page
//   Agent's shop:  <WEB_URL>/a/<AGENT CODE>     -> the agent's own shop. Older links (/?agent=<CODE>) open it too.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WEB_URL = 'https://poultry360-web.vercel.app';
// Set this to the Play Store listing once the app is published; the join page then offers "Get the Android app".
export const PLAY_STORE_URL = null;

export const inviteLink = (code) => WEB_URL + '/join/' + encodeURIComponent(code);
export const agentLink = (code) => WEB_URL + '/a/' + encodeURIComponent(code);

const INVITE = 'p360-pending-invite';
// How long an invite is remembered in this browser. One that is never answered must not keep
// opening the join page (or the agent sign-up) weeks later.
const INVITE_DAYS = 3;
const stamp = (code) => JSON.stringify({ code, at: Date.now() });
// The stored code if it is still fresh; stale or old-format values are removed.
function readStamped(key, days) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = raw.startsWith('{') ? JSON.parse(raw) : null;
    if (v && v.code && Date.now() - v.at < days * 864e5) return v.code;
    window.localStorage.removeItem(key);
  } catch { /* storage blocked */ }
  return null;
}

// In the browser, read the link the page was opened with (once, at startup), keep an invite code,
// and tidy the address bar. An agent's shop keeps its address (/a/<code>): the navigator opens it.
function readLaunchLink() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  const out = {};
  try {
    const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9-]{4,})/);
    const a = new URLSearchParams(window.location.search).get('agent');
    if (m) { out.invite = m[1].toUpperCase(); window.history.replaceState(null, '', '/'); window.localStorage.setItem(INVITE, stamp(out.invite)); }
    else if (a) window.history.replaceState(null, '', '/a/' + encodeURIComponent(a.toUpperCase()));   // older ?agent= link
  } catch { /* storage blocked: the link still works for this visit */ }
  return out;
}
export const LAUNCH = readLaunchLink();

// A store invite this browser is holding: from this visit's link, or one opened in the last few days.
// Used to fill in the code (sign-up role, Join page). Only a link opened on this visit opens the Join page by itself.
export function pendingInviteNow() {
  if (LAUNCH.invite) return LAUNCH.invite;
  return Platform.OS === 'web' ? readStamped(INVITE, INVITE_DAYS) : null;
}
// The invite this visit was opened with (the website opens the Join page only for that).
export const inviteOpenedNow = () => LAUNCH.invite || null;
export const getPendingInvite = async () => pendingInviteNow() || (Platform.OS === 'web' ? null : await AsyncStorage.getItem(INVITE).catch(() => null));
export const clearPendingInvite = async () => { LAUNCH.invite = null; await AsyncStorage.removeItem(INVITE).catch(() => {}); };
