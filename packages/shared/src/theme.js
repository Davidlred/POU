// Design tokens lifted from the Poultry360 flow boards (Sunrise light / Ember night).
export const palettes = {
  light: {
    bg: '#F7F2E8', sf: '#FFFFFF', sf2: '#EFE7D8', ink: '#2A2119', mute: '#75685A',
    line: 'rgba(42,33,25,0.10)', line2: 'rgba(42,33,25,0.20)',
    hc: '#17120E', hcb: '#17120E', hink: '#F3EADF', hmute: '#A8998A', hline: '#3A2F25',
    yolk: '#F2B33D', onyolk: '#2A2119', ember: '#E9904A', acc: '#B5603A',
    sage: '#4F7A40', sagebg: '#E3ECD9', err: '#B83A26', errbg: '#F7DFD7', warn: '#8A5A12', warnbg: '#FBE7C4',
    t1: '#FBE3B0', t1i: '#8A5A12', t2: '#F1D2C2', t2i: '#8E4426', t3: '#E8E0D2', t3i: '#5A4A38', t4: '#E3E4CF', t4i: '#4E5326',
    nav: '#FFFFFF', navact: '#F2B33D', navactink: '#2A2119', scrim: 'rgba(23,18,14,0.45)', map: '#EAE2D2',
  },
  dark: {
    bg: '#17120E', sf: '#221B15', sf2: '#2C241D', ink: '#F3EADF', mute: '#A8998A',
    line: '#3A2F25', line2: '#4A3D31',
    hc: '#2A1E15', hcb: '#4A3626', hink: '#F3EADF', hmute: '#B5A493', hline: '#4A3626',
    yolk: '#F2B33D', onyolk: '#17120E', ember: '#E9904A', acc: '#E9904A',
    sage: '#8DB57A', sagebg: '#26321F', err: '#F08A72', errbg: '#3A1F18', warn: '#F2C46A', warnbg: '#3A2C14',
    t1: '#3A2C14', t1i: '#F2C46A', t2: '#3A231A', t2i: '#F0A27E', t3: '#2E261F', t3i: '#D8C7B0', t4: '#2B2E1D', t4i: '#C5CB8F',
    nav: '#1E1712', navact: 'rgba(233,144,74,0.18)', navactink: '#E9904A', scrim: 'rgba(0,0,0,0.6)', map: '#1C1612',
  },
};

// Android ignores fontWeight for custom fonts, so each weight is its own family.
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  mono: 'JetBrainsMono_600SemiBold',
  monoMedium: 'JetBrainsMono_500Medium',
};

export const radius = { sm: 12, md: 16, lg: 20, xl: 24, pill: 100 };
export const space = (n) => n * 4;
