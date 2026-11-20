import type { ImageSourcePropType } from 'react-native';

/**
 * Three-dimensional pictures drawn for the app in its palette: tiles, empty screens, onboarding.
 * Each has a transparent background and sits on either theme.
 */
export const Pictures = {
  arm: require('@/assets/images/3d/arm.png'),
  calendar: require('@/assets/images/3d/calendar.png'),
  clipboard: require('@/assets/images/3d/clipboard.png'),
  dumbbell: require('@/assets/images/3d/dumbbell.png'),
  flame: require('@/assets/images/3d/flame.png'),
  sneaker: require('@/assets/images/3d/sneaker.png'),
  stopwatch: require('@/assets/images/3d/stopwatch.png'),
  trophy: require('@/assets/images/3d/trophy.png'),
} satisfies Record<string, ImageSourcePropType>;

export type PictureName = keyof typeof Pictures;
