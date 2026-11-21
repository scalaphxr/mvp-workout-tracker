import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export interface ChartPoint {
  date: Date;
  value: number;
}

const HEIGHT = 174;
const PAD = 10;
const DAY_MS = 86_400_000;

/** Recorded values against a calendar time axis. Missing dates retain their spacing. */
export function LineChart({
  points,
  format,
  axis,
}: {
  points: readonly ChartPoint[];
  format: (value: number) => string;
  axis: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const [width, setWidth] = useState(0);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const yTicks = high === low ? [high] : [high, (low + high) / 2, low];
  const shownTicks = yTicks.filter((tick, index) => yTicks.findIndex((value) => format(value) === format(tick)) === index);
  const start = first.date.getTime();
  const end = last.date.getTime();
  const sameDay = first.date.toDateString() === last.date.toDateString();
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(first.date.getFullYear() === last.date.getFullYear() ? {} : { year: '2-digit' }),
  });
  const middle = width >= 230 && end - start >= DAY_MS * 4 ? new Date((end + start) / 2) : null;
  const x = (point: ChartPoint) => end === start
    ? width / 2
    : PAD + ((point.date.getTime() - start) / (end - start)) * (width - 2 * PAD);
  const y = (value: number) => high === low
    ? HEIGHT / 2
    : PAD + ((high - value) / (high - low)) * (HEIGHT - 2 * PAD);

  return (
    <View style={styles.chart}>
      <View style={styles.heading}>
        <ThemedText type="smallBold">{axis}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {date.format(last.date)} · {format(last.value)}
        </ThemedText>
      </View>
      <View accessible accessibilityRole="image"
        accessibilityLabel={t('progress.axisSummary', {
          axis, start: date.format(first.date), end: date.format(last.date),
          initial: format(first.value), latest: format(last.value),
        })}
        style={styles.axes}>
        <View style={styles.scale}>
          {/* Invisible labels reserve the exact width of the widest value. */}
          {shownTicks.map((tick) => (
            <ThemedText key={`sizer-${tick}`} type="small" numberOfLines={1} style={styles.scaleSizer}>
              {format(tick)}
            </ThemedText>
          ))}
          {shownTicks.map((tick) => (
            <ThemedText key={tick} type="small" numberOfLines={1} themeColor="textSecondary"
              style={[styles.tick, { top: y(tick) - 9 }]}>
              {format(tick)}
            </ThemedText>
          ))}
        </View>
        <View style={styles.plot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {width > PAD * 2 && (
            <Svg width={width} height={HEIGHT}>
              {shownTicks.map((tick) => (
                <Line key={tick} x1={0} x2={width} y1={y(tick)} y2={y(tick)} stroke={theme.separator} />
              ))}
              <Line x1={0} x2={0} y1={0} y2={HEIGHT} stroke={theme.separator} />
              <Line x1={0} x2={width} y1={HEIGHT - 1} y2={HEIGHT - 1} stroke={theme.separator} />
              {points.length > 1 && (
                <Polyline points={points.map((point) => `${x(point)},${y(point.value)}`).join(' ')}
                  fill="none" stroke={theme.accent} strokeWidth={2.5} strokeLinejoin="round" />
              )}
              {(points.length <= 16 ? points : [last]).map((point, index) => (
                <Circle key={index} cx={x(point)} cy={y(point.value)} r={point === last ? 4.5 : 3} fill={theme.accent} />
              ))}
            </Svg>
          )}
          <View style={[styles.dates, sameDay && styles.singleDate]}>
            <ThemedText type="small" themeColor="textSecondary">{date.format(first.date)}</ThemedText>
            {middle && <ThemedText type="small" themeColor="textSecondary">{date.format(middle)}</ThemedText>}
            {!sameDay && <ThemedText type="small" themeColor="textSecondary">{date.format(last.date)}</ThemedText>}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.dateTitle}>
            {t('progress.dateAxis')}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: Spacing.two },
  heading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.one },
  axes: { flexDirection: 'row', gap: Spacing.two },
  scale: { height: HEIGHT },
  scaleSizer: { opacity: 0, paddingRight: 2 },
  tick: { position: 'absolute', right: 0, lineHeight: 18 },
  plot: { flex: 1, minHeight: HEIGHT + 20 },
  dates: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.one },
  singleDate: { justifyContent: 'center' },
  dateTitle: { textAlign: 'center' },
});
