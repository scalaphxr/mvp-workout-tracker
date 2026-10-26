/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1410',
    background: '#F1F5F3',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E9E5',
    // The greys lean slightly green, towards the accent.
    textSecondary: '#5B6B63',
    // Emerald: what can be pressed – buttons, links, the chosen tab.
    accent: '#047857',
    onAccent: '#FFFFFF',
    // Gold: what was measured – metric labels, the latest bar of a chart.
    highlight: '#A16207',
    onHighlight: '#FFFFFF',
    // The glow behind the large title of the first screen, fading into the background.
    hero: '#C9EBDB',
    separator: '#D3DCD7',
    // The floating tab bar: the content shows faintly through it.
    tabBar: 'rgba(255, 255, 255, 0.92)',
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
    hero: '#0C3E2D',
    separator: '#2A3530',
    tabBar: 'rgba(17, 25, 22, 0.92)',
    danger: '#FF8A80',
    musclePrimary: '#FF4D5E',
    muscleSecondary: '#8A3A44',
    bodyFill: '#33403A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
  card: 22,
  field: 14,
  pill: 999,
} as const;

/** The floating tab bar covers the bottom of a tab screen: its content scrolls out from under it. */
export const FloatingTabBarSpace = 96;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
