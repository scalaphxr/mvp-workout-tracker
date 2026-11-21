/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/**
 * Emerald and gold. The page is a grey leaning green with white sheets on it; emerald is what can
 * be pressed, gold is what was measured, amber marks what stands out (a record, something new).
 * The dark theme turns it round: a near-black page, a brighter emerald and a yellow gold.
 */
export const Colors = {
  light: {
    text: '#0B1410',
    background: '#F1F5F3',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E9E5',
    // The greys lean slightly green, towards the accent.
    textSecondary: '#5B6B63',
    // Emerald: what can be pressed – buttons, links, the chosen tab and day.
    accent: '#047857',
    onAccent: '#FFFFFF',
    // Gold: what was measured – metric labels, numbers.
    highlight: '#AA640A',
    onHighlight: '#FFFFFF',
    // A bright emerald for marks: the line under a chosen heading, a day trained.
    bright: '#10B981',
    // Emerald as a soft surface: the plate under an icon.
    accentSoft: '#D9F2E6',
    // Bars of a chart other than the latest one.
    chart: '#A7DFC3',
    // Amber: a record, a badge, something new.
    hot: '#F4A64C',
    // The glow behind the large title of the first screen, fading into the background.
    hero: '#C9EBDB',
    separator: '#D3DCD7',
    tabBar: '#FFFFFF',
    danger: '#B3261E',
    // The body map: muscles an exercise works, on a neutral body.
    musclePrimary: '#D7263D',
    muscleSecondary: '#F3B0A6',
    bodyFill: '#D6DED9',
  },
  dark: {
    text: '#F3F8F5',
    background: '#030705',
    backgroundElement: '#111916',
    backgroundSelected: '#1D2722',
    textSecondary: '#93A39B',
    accent: '#10B981',
    onAccent: '#03140D',
    highlight: '#FACC15',
    onHighlight: '#1A1400',
    bright: '#34D399',
    accentSoft: '#0F3326',
    chart: '#1E4D3A',
    hot: '#FBBF24',
    hero: '#0C3E2D',
    separator: '#2A3530',
    tabBar: '#111916',
    danger: '#FF8A80',
    musclePrimary: '#FF4D5E',
    muscleSecondary: '#8A3A44',
    bodyFill: '#33403A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The faces of the app: a condensed display face for headings and big numbers, set in capitals,
 * and a geometric sans for everything else. Both have Cyrillic. Loaded in the root layout.
 */
export const Typeface = {
  // Oswald with its corners rounded for the app: assets/fonts/OFL-OswaldSoft.txt.
  display: 'OswaldSoft_700Bold',
  displayMedium: 'OswaldSoft_600SemiBold',
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
} as const;

/** The body face for a weight: a custom face has a file per weight, not a weight per file. */
export function bodyFace(weight: string | number | undefined): string {
  const value = Number(weight ?? 400);
  if (value >= 700 || weight === 'bold') return Typeface.bold;
  if (value >= 600) return Typeface.semibold;
  if (value >= 500) return Typeface.medium;
  return Typeface.regular;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Rounded corners: a card, a tile, a field. */
export const Radius = {
  card: 28,
  field: 16,
  pill: 999,
} as const;

/** The floating tab bar covers the bottom of a tab screen: its content scrolls out from under it. */
export const FloatingTabBarSpace = 96;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
