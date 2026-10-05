/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { createContext, useContext } from 'react';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Forces a theme for a part of the app whatever the system says: the workout screen is
 * dark by default, so it does not light up a dim gym.
 */
export const ThemeOverride = createContext<'light' | 'dark' | null>(null);

export function useTheme() {
  const forced = useContext(ThemeOverride);
  const scheme = useColorScheme();
  const theme = forced ?? (scheme === 'dark' ? 'dark' : 'light');

  return Colors[theme];
}
