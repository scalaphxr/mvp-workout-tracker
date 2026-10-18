import type { Muscle } from '@mvp/schemas';
import { StyleSheet, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Side = 'front' | 'back';

/** Every region the library draws: each gets an explicit fill, or it keeps a built-in dark grey. */
const REGIONS: readonly Slug[] = [
  'abs',
  'adductors',
  'ankles',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'feet',
  'forearm',
  'gluteal',
  'hair',
  'hamstring',
  'hands',
  'head',
  'knees',
  'lower-back',
  'neck',
  'obliques',
  'quadriceps',
  'tibialis',
  'trapezius',
  'triceps',
  'upper-back',
];

/**
 * The body from the front and from the back with the muscles an exercise works:
 * primary muscles in a strong colour, secondary ones in a weak one.
 */
export function MuscleMap({
  primary,
  secondary,
  label,
  scale = 0.55,
}: {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  /** What a screen reader says instead of the picture. */
  label: string;
  /** The size of the figures; a small one fits next to a timer. */
  scale?: number;
}) {
  const theme = useTheme();

  const parts = (side: Side): ExtendedBodyPart[] => {
    const regions = (muscles: readonly Muscle[]) =>
      new Set(
        muscles
          .filter((muscle) => muscle.svg_side === side || muscle.svg_side === 'both')
          .map((muscle): string => muscle.svg_region),
      );
    const strong = regions(primary);
    const weak = regions(secondary);

    // When a primary and a secondary muscle share a region, the primary colour wins.
    return REGIONS.map((slug) => ({
      slug,
      styles: {
        fill: strong.has(slug)
          ? theme.musclePrimary
          : weak.has(slug)
            ? theme.muscleSecondary
            : theme.bodyFill,
      },
    }));
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.map, scale < 0.4 && styles.small]}>
      {(['front', 'back'] as const).map((side) => (
        <Body key={side} side={side} data={parts(side)} scale={scale} border="none" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  small: {
    gap: 0,
  },
});
