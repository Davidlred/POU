import { useFonts } from 'expo-font';
import { Roboto_400Regular, Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk';

export function useP360Fonts() {
  const [loaded] = useFonts({ Roboto_400Regular, Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold, HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold,
    // Hanken Grotesk has no ₦: these hold just that sign, drawn from its own N (see Txt in ui.js)
    P360Naira_400: require('../assets/fonts/P360Naira_400.otf'), P360Naira_500: require('../assets/fonts/P360Naira_500.otf'),
    P360Naira_600: require('../assets/fonts/P360Naira_600.otf'), P360Naira_700: require('../assets/fonts/P360Naira_700.otf'),
    P360Naira_800: require('../assets/fonts/P360Naira_800.otf') });
  return loaded;
}
