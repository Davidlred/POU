import { Platform } from 'react-native';
// Design tokens (newdesign.md section 2). Light: white surfaces, green primary. Dark: near-black, bright green primary, teal Hearth.
// Token names are historical: `yolk` is the PRIMARY action colour (green in both modes) and `ember` is the
// highlight used for focus rings and selected days. Text on those fills is `onyolk` / `onember`.
// `orange` is a sparing accent only: live dots, the current step, count badges, freshness badges, low-stock bars,
// rank 1. Never a button and never a whole card. `obg` / `oink` make an orange pill.
// `bar` is the colour of chart bars other than the latest one. `hbtn` / `onhbtn` is the primary button on a Hearth card.
// `logobg` is white in both modes: the Poultry360 logo artwork is drawn for a white background.
// Inside a Hearth card use the h* tokens: hink, hmute, hline, hacc (accent) and herr; the normal accents are too dark there.
export const palettes = {
  light: {
    bg: '#F4F6F3', sf: '#FFFFFF', sf2: '#EAEFEA', ink: '#0E1512', mute: '#55605A',
    line: 'rgba(14,21,18,0.10)', line2: 'rgba(14,21,18,0.20)',
    hc: '#0A2219', hcb: '#0A2219', hink: '#F2F7F4', hmute: '#B4CDC2', hline: 'rgba(255,255,255,0.14)', hacc: '#5FD6A6', herr: '#FF9C94',
    hbtn: '#2DCB8C', onhbtn: '#06281B',
    yolk: '#0B7A53', onyolk: '#FFFFFF', ember: '#0B7A53', onember: '#FFFFFF', acc: '#0A6B49',
    sage: '#0A6B49', sagebg: '#DFF3E9', err: '#A8261E', errbg: '#FCE8E5', warn: '#754A00', warnbg: '#FFF0D2',
    orange: '#F08A24', onorange: '#1F1000', obg: '#FFEBD6', oink: '#8A4206', bar: '#9FD8C0',
    t1: '#DFF3E9', t1i: '#0A6B49', t2: '#FFE6D6', t2i: '#9A4418', t3: '#E1E9FB', t3i: '#2F4F9A', t4: '#FFF1CC', t4i: '#7A5400',
    ripple: 'rgba(14,21,18,0.10)',
    nav: '#FFFFFF', navact: '#DFF3E9', navactink: '#0A6B49', seg: '#FFFFFF', logobg: '#FFFFFF', scrim: 'rgba(14,21,18,0.45)', map: '#E3E9E4',
  },
  dark: {
    bg: '#0C0F0E', sf: '#151918', sf2: '#1F2423', ink: '#F2F5F3', mute: '#A3ACA7',
    line: 'rgba(255,255,255,0.10)', line2: 'rgba(255,255,255,0.20)',
    hc: '#12302A', hcb: '#1C4339', hink: '#F2F7F4', hmute: '#B4CDC2', hline: 'rgba(255,255,255,0.14)', hacc: '#5FD6A6', herr: '#FF9C94',
    hbtn: '#2DCB8C', onhbtn: '#06281B',
    yolk: '#2DCB8C', onyolk: '#06281B', ember: '#2DCB8C', onember: '#06281B', acc: '#5FD6A6',
    sage: '#5FD6A6', sagebg: 'rgba(45,203,140,0.16)', err: '#FF9C94', errbg: '#3A1614', warn: '#FFD27A', warnbg: '#3A2E10',
    orange: '#F08A24', onorange: '#1F1000', obg: '#3A2610', oink: '#FFB870', bar: '#1F6B4E',
    t1: '#14302A', t1i: '#7FD9B7', t2: '#3A2418', t2i: '#F0A27E', t3: '#1A2540', t3i: '#9DB8EE', t4: '#3A3014', t4i: '#F0C36B',
    ripple: 'rgba(255,255,255,0.14)',
    nav: '#111514', navact: 'rgba(45,203,140,0.16)', navactink: '#5FD6A6', seg: '#3A3F3E', logobg: '#FFFFFF', scrim: 'rgba(0,0,0,0.65)', map: '#141817',
  },
};

// Android ignores fontWeight for custom fonts, so each weight is its own family.
// One family throughout (Hanken Grotesk). The website uses the full weights; the phone (and a browser under 900 px)
// is one step lighter everywhere (800→700, 700→600, 600→500) and never uses 800: see VARIANTS in ui.js.
// The phone app uses Roboto (Android's own typeface, which has the ₦ sign) so it feels like an Android app;
// the website keeps Hanken Grotesk.
const ROBOTO = {
  display: 'Roboto_700Bold', displayBold: 'Roboto_700Bold', regular: 'Roboto_400Regular', medium: 'Roboto_500Medium',
  semibold: 'Roboto_600SemiBold', bold: 'Roboto_700Bold', extrabold: 'Roboto_700Bold', mono: 'Roboto_700Bold', monoMedium: 'Roboto_600SemiBold',
};
const HANKEN = {
  display: 'HankenGrotesk_800ExtraBold',
  displayBold: 'HankenGrotesk_700Bold',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extrabold: 'HankenGrotesk_800ExtraBold',
  mono: 'HankenGrotesk_700Bold',
  monoMedium: 'HankenGrotesk_600SemiBold',
};
export const fonts = Platform.OS === 'web' ? HANKEN : ROBOTO;
export const nativeApp = Platform.OS !== 'web';
// The weight one step lighter, for phones.
export const softer = { HankenGrotesk_800ExtraBold: 'HankenGrotesk_700Bold', HankenGrotesk_700Bold: 'HankenGrotesk_600SemiBold',
  HankenGrotesk_600SemiBold: 'HankenGrotesk_500Medium', HankenGrotesk_500Medium: 'HankenGrotesk_500Medium', HankenGrotesk_400Regular: 'HankenGrotesk_400Regular' };

// 12 small tiles and thumbnails · 16 inputs · 20 cards and tables · 24 Hearth and large panels · 28 product hero · pill.
export const radius = { sm: 12, md: 16, lg: 20, hearth: 24, xl: 28, pill: 100 };
export const space = (n) => n * 4;
