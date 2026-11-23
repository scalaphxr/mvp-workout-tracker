import type { ImageSourcePropType } from 'react-native';

/**
 * Marker-style illustrations for tiles, empty screens, and onboarding.
 * Each has a transparent background and sits on either theme.
 */
export const Pictures = {
  activityLog: require('@/assets/images/illustrations/activity-log.png'),
  arm: require('@/assets/images/illustrations/arm.png'),
  calendar: require('@/assets/images/illustrations/calendar.png'),
  clipboard: require('@/assets/images/illustrations/clipboard.png'),
  dumbbell: require('@/assets/images/illustrations/dumbbell.png'),
  flame: require('@/assets/images/illustrations/flame.png'),
  intervalTimer: require('@/assets/images/illustrations/interval-timer.png'),
  sneaker: require('@/assets/images/illustrations/sneaker.png'),
  stopwatch: require('@/assets/images/illustrations/stopwatch.png'),
  trophy: require('@/assets/images/illustrations/trophy.png'),
} satisfies Record<string, ImageSourcePropType>;

export type PictureName = keyof typeof Pictures;
