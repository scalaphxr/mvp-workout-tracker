import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export interface Series {
  values: readonly number[];
  color: string;
  /** Named in the legend when a chart has more than one line. */
  title?: string;
}

const HEIGHT = 160;
const PAD = 8;

/**
 * A plain line chart: values left to right, the lowest and the highest marked on the side.
 * All series share one scale and are expected to have a value for every point.
 */
export function LineChart({
  series,
  format,
  label,
}: {
  series: readonly Series[];
  format: (value: number) => string;
  /** What a screen reader says instead of the picture. */
  label: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const all = series.flatMap((line) => line.values);
  const low = Math.min(...all);
  const high = Math.max(...all);
  // A flat line sits in the middle rather than on the floor.
  const span = high - low || 1;
  const x = (index: number, count: number) =>
    count === 1 ? width / 2 : PAD + (index * (width - 2 * PAD)) / (count - 1);
  const y = (value: number) =>
    high === low ? HEIGHT / 2 : PAD + ((high - value) * (HEIGHT - 2 * PAD)) / span;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.chart}>
      <View style={styles.scale}>
        <ThemedText type="small" themeColor="textSecondary">
          {format(high)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {format(low)}
        </ThemedText>
      </View>
      <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} x2={width} y1={PAD} y2={PAD} stroke={theme.backgroundSelected} />
            <Line
              x1={0}
              x2={width}
              y1={HEIGHT - PAD}
              y2={HEIGHT - PAD}
              stroke={theme.backgroundSelected}
            />
            {series.map((line) => (
              <Polyline
                key={line.color}
                points={line.values
                  .map((value, index) => `${x(index, line.values.length)},${y(value)}`)
                  .join(' ')}
                fill="none"
                stroke={line.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            ))}
            {/* The latest point is the one the user came to see. */}
            {series.map((line) => (
              <Circle
                key={line.color}
                cx={x(line.values.length - 1, line.values.length)}
                cy={y(line.values.at(-1) ?? low)}
                r={4.5}
                fill={line.color}
              />
            ))}
          </Svg>
        )}
        {series.length > 1 && (
          <View style={styles.legend}>
            {series.map((line) => (
              <View key={line.color} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: line.color }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  {line.title}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  scale: {
    height: HEIGHT,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  plot: {
    flex: 1,
    gap: Spacing.two,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  swatch: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
});
