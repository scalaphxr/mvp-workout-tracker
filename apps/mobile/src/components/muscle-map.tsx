import type { Muscle } from '@mvp/schemas';
import { StyleSheet, View } from 'react-native';
import type { BodyPart } from 'react-native-body-highlighter';
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import Svg, { Path } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Side = 'front' | 'back';

/**
 * The library's drawings of the body, front and back, side by side on one canvas.
 *
 * Its own `Body` component is not used: it hands `accessible` to the `<svg>` element, which on
 * the web makes React complain about a non-boolean attribute. Only the shapes are taken from it.
 */
const FIGURES: Record<Side, { parts: readonly BodyPart[]; viewBox: string }> = {
  front: { parts: bodyFront, viewBox: '0 0 724 1448' },
  back: { parts: bodyBack, viewBox: '724 0 724 1448' },
};

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

  const figure = (side: Side) => {
    const regions = (muscles: readonly Muscle[]) =>
      new Set(
        muscles
          .filter((muscle) => muscle.svg_side === side || muscle.svg_side === 'both')
          .map((muscle): string => muscle.svg_region),
      );
    const strong = regions(primary);
    const weak = regions(secondary);
    // When a primary and a secondary muscle share a region, the primary colour wins.
    const fill = (slug: string | undefined) =>
      slug !== undefined && strong.has(slug)
        ? theme.musclePrimary
        : slug !== undefined && weak.has(slug)
          ? theme.muscleSecondary
          : theme.bodyFill;

    const { parts, viewBox } = FIGURES[side];
    return (
      <Svg key={side} viewBox={viewBox} width={200 * scale} height={400 * scale}>
        {parts.flatMap((part) =>
          [...(part.path?.common ?? []), ...(part.path?.left ?? []), ...(part.path?.right ?? [])].map(
            (d, index) => <Path key={`${part.slug}-${index}`} d={d} fill={fill(part.slug)} />,
          ),
        )}
      </Svg>
    );
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.map, scale < 0.4 && styles.small]}>
      {figure('front')}
      {figure('back')}
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
