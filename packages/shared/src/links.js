// Share links and what a link brought with it.
//   Store invite:  <WEB_URL>/join/<STORE CODE>  -> "Join <store> as an agent" page
//   Agent's link:  <WEB_URL>/?agent=<AGENT CODE> -> the agent code is filled in at checkout
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WEB_URL = 'https://poultry360-web.vercel.app';
// Set this to the Play Store listing once the app is published; the join page then offers "Get the Android app".
export const PLAY_STORE_URL = null;

export const inviteLink = (code) => WEB_URL + '/join/' + encodeURIComponent(code);
export const agentLink = (code) => WEB_URL + '/?agent=' + encodeURIComponent(code);

const INVITE = 'p360-pending-invite';
const AGENT = 'p360-pending-agent-code';

// In the browser, read the link the page was opened with (once, at startup), keep the codes,
// and tidy the address bar back to the home page.
function readLaunchLink() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  const out = {};
  try {
    const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9-]{4,})/);
    if (m) { out.invite = m[1].toUpperCase(); window.localStorage.setItem(INVITE, out.invite); }
    const a = new URLSearchParams(window.location.search).get('agent');
    if (a) { out.agent = a.toUpperCase(); window.localStorage.setItem(AGENT, out.agent); }
    if (m || a) window.history.replaceState(null, '', '/');
  } catch { /* storage blocked: the link still works for this visit */ }
  return out;
}
export const LAUNCH = readLaunchLink();

// A store invite this browser/phone is holding (from the link it was opened with).
export function pendingInviteNow() {
  if (LAUNCH.invite) return LAUNCH.invite;
  if (Platform.OS === 'web') { try { return window.localStorage.getItem(INVITE); } catch { return null; } }
  return null;
}
export const getPendingInvite = async () => pendingInviteNow() || (await AsyncStorage.getItem(INVITE).catch(() => null));
export const clearPendingInvite = async () => { LAUNCH.invite = null; await AsyncStorage.removeItem(INVITE).catch(() => {}); };
export const getPendingAgentCode = async () => LAUNCH.agent || (await AsyncStorage.getItem(AGENT).catch(() => null));
export const clearPendingAgentCode = async () => { LAUNCH.agent = null; await AsyncStorage.removeItem(AGENT).catch(() => {}); };
