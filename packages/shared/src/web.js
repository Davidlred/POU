// Small bridges so the same screens work in a browser (Expo web).
import { Alert, Platform, Share, useWindowDimensions } from 'react-native';

export const isWeb = Platform.OS === 'web';

// True in a browser at desktop width: pages use the website layout (sidebar, wide content).
export const WIDE = 900;
export function useWide() {
  const { width } = useWindowDimensions();
  return isWeb && width >= WIDE;
}

// React Native's Alert does nothing on the web. Map it to the browser's own dialogs:
// one button (or none) -> window.alert; two or more -> window.confirm, OK runs the first
// non-cancel button, Cancel runs the cancel button.
export function installWebShims() {
  if (!isWeb || Alert.__p360) return;
  Alert.__p360 = true;
  // Our inputs draw their own green focus border; the browser's black focus outline doubled it.
  const css = document.createElement('style');
  css.textContent = 'input, textarea, select { outline: none !important; }';
  document.head.appendChild(css);
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons || [];
    if (list.length < 2) { window.alert(text); list[0]?.onPress?.(); return; }
    const cancel = list.find((b) => b.style === 'cancel');
    const action = list.find((b) => b.style !== 'cancel') || list[list.length - 1];
    if (window.confirm(text)) action?.onPress?.(); else cancel?.onPress?.();
  };
}

// Share a piece of text: the phone's share sheet, the browser's share sheet, or copy it.
export async function shareText(message) {
  if (!isWeb) return Share.share({ message });
  if (typeof navigator !== 'undefined' && navigator.share) { try { await navigator.share({ text: message }); return; } catch { /* cancelled */ } return; }
  try { await navigator.clipboard.writeText(message); window.alert('Copied. Paste it into WhatsApp, SMS or email.'); }
  catch { window.prompt('Copy this message:', message); }
}

// Save a text file: a download in the browser.
export function downloadText(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
