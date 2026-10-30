// Design tokens. Light: white surfaces, green primary. Dark: near-black, bright green primary, teal cards. No orange primary in either mode.
// Token names are historical: `yolk` is the PRIMARY action colour (green in both modes) and `ember` is the
// highlight used for focus rings, selected days and live dots. Text on those fills is `onyolk` / `onember`.
// `logobg` is white in both modes: the Poultry360 logo artwork is drawn for a white background.
// Inside a Hearth card use the h* tokens: hink, hmute, hacc (accent) and herr; the normal accents are too dark there.
export const palettes = {
  light: {
    bg: '#F5F7F5', sf: '#FFFFFF', sf2: '#ECF0ED', ink: '#0E1512', mute: '#66706A',
    line: 'rgba(14,21,18,0.08)', line2: 'rgba(14,21,18,0.16)',
    hc: '#0A2219', hcb: '#0A2219', hink: '#F2F8F5', hmute: '#9DB7AB', hline: '#1F4335', hacc: '#5FD6A6', herr: '#F5A79E',
    yolk: '#0F8A5F', onyolk: '#FFFFFF', ember: '#14A06E', onember: '#FFFFFF', acc: '#0B7550',
    sage: '#0F8A5F', sagebg: '#E1F4EB', err: '#C8372D', errbg: '#FCE8E5', warn: '#8F5B00', warnbg: '#FFF0D2',
    t1: '#E1F4EB', t1i: '#0B7550', t2: '#FFE8DC', t2i: '#B4532A', t3: '#E6EDFA', t3i: '#3559A8', t4: '#FFF1CC', t4i: '#8A6100',
    nav: '#FFFFFF', navact: '#E1F4EB', navactink: '#0B7550', seg: '#FFFFFF', logobg: '#FFFFFF', scrim: 'rgba(14,21,18,0.45)', map: '#E7ECE8',
  },
  dark: {
    bg: '#0C0D0D', sf: '#161818', sf2: '#222525', ink: '#F4F5F3', mute: '#9AA09C',
    line: '#262929', line2: '#3A3E3E',
    hc: '#15322D', hcb: '#27564C', hink: '#EAF5F1', hmute: '#9FC2B8', hline: '#27564C', hacc: '#5FD6A6', herr: '#F5A79E',
    yolk: '#2DCB8C', onyolk: '#06140E', ember: '#2DCB8C', onember: '#06140E', acc: '#5FD6A6',
    sage: '#5FC7A0', sagebg: '#14302A', err: '#F3857A', errbg: '#3A1C19', warn: '#F0C36B', warnbg: '#35290F',
    t1: '#14302A', t1i: '#7FD9B7', t2: '#3A2118', t2i: '#F0A27E', t3: '#1D2636', t3i: '#9DB8EE', t4: '#33290F', t4i: '#F0C36B',
    nav: '#111313', navact: 'rgba(45,203,140,0.16)', navactink: '#5FD6A6', seg: '#3A3E3E', logobg: '#FFFFFF', scrim: 'rgba(0,0,0,0.65)', map: '#141616',
  },
};

// Android ignores fontWeight for custom fonts, so each weight is its own family.
// One family throughout (Hanken Grotesk): `display` for headings, `mono` for money, codes and timers
// (same face, bold, with tabular figures set where it is used).
export const fonts = {
  display: 'HankenGrotesk_800ExtraBold',
  displayBold: 'HankenGrotesk_700Bold',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  mono: 'HankenGrotesk_700Bold',
  monoMedium: 'HankenGrotesk_600SemiBold',
};

export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 100 };
export const space = (n) => n * 4;
