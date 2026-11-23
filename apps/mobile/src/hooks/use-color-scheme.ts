import { useColorScheme as useSystemScheme } from 'react-native';

import { usePreferences } from '@/lib/preferences';

/** Light or dark: as chosen in the profile, or as the phone is set. */
export function useColorScheme(): 'light' | 'dark' {
  const system = useSystemScheme();
  const chosen = usePreferences((state) => state.theme);
  if (chosen !== 'system') return chosen;
  return system === 'dark' ? 'dark' : 'light';
}
