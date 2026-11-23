import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useAppleHealthSteps } from '@/lib/apple-health';
import { readFoodEntries } from '@/lib/food-log';
import { formatNumber, toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';

import { GraffitiIcon } from './graffiti-icon';
import { ThemedText } from './themed-text';

const STEP_SCALE = 10_000;
const CALORIE_SCALE = 2_000;
const RING_MAX_SIZE = 64;
const RING_RADIUS = 43;
const RING_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PREVIEW = {
  steps: 15_000,
  calories: 1_570,
  activity: { amount: 24, scale: 35 },
  food: { amount: 2, scale: 3 },
} as const;

export function DayCounters({ date }: { date: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const paddingLeft = insets.left + Spacing.three;
  const paddingRight = insets.right + Spacing.three;
  const steps = useAppleHealthSteps(date);
  const calories = useLocal(() => {
    const entries = readFoodEntries(date);
    if (!entries.some((entry) => entry.kcal !== undefined)) return null;
    return entries.reduce((total, entry) => total + (entry.kcal ?? 0), 0);
  }, [date]);
  const showPreview = __DEV__ && date === toLocalDate(new Date());
  const counters = [
    {
      icon: 'steps', amount: steps, preview: PREVIEW.steps, label: t('appleHealth.metrics.steps'),
      color: theme.accent, track: theme.accentSoft, scale: STEP_SCALE,
    },
    {
      icon: 'calories', amount: calories ?? (showPreview ? null : 0), preview: PREVIEW.calories, label: t('today.counterCalories'),
      color: theme.highlight, track: theme.highlightSoft, scale: CALORIE_SCALE,
    },
    {
      icon: 'activity', amount: null, preview: PREVIEW.activity.amount, label: t('activity.title'),
      color: theme.activityInk, track: theme.activitySoft, scale: PREVIEW.activity.scale,
    },
    {
      icon: 'food', amount: null, preview: PREVIEW.food.amount, label: t('today.counterFood'),
      color: theme.nutritionInk, track: theme.nutritionSoft, scale: PREVIEW.food.scale,
    },
  ] as const;
  const panelInsets = paddingLeft + paddingRight + 2 * Spacing.two;
  const ringSpace = Math.min(width, MaxContentWidth) - panelInsets - (counters.length - 1) * Spacing.one;
  const ringSize = Math.min(RING_MAX_SIZE, ringSpace / counters.length);

  return (
    <View style={[styles.wrapper, { paddingLeft, paddingRight }]}>
      <View style={styles.row}>
        {counters.map(({ icon, amount, preview, label, color, track, scale }) => {
          const isPreview = amount === null && showPreview;
          const total = isPreview ? preview : amount;
          const value = total === null ? '—' : formatNumber(Math.round(total), locale);
          const displayValue = icon === 'food' && isPreview ? `${value}/${scale}` : value;
          const progress = total === null ? null : Math.max(0, Math.min(total / scale, 1));
          const spokenValue = total === null ? t('today.counterUnavailable') : displayValue;
          const accessibilityLabel = isPreview ? t('today.counterPreview', { label, value: spokenValue }) : `${label}, ${spokenValue}`;
          const valueSize = Math.min(19, ringSize * 0.32, ringSize / (displayValue.length * 0.85));

          return (
            <View
              key={icon}
              accessible
              accessibilityRole={progress === null ? undefined : 'progressbar'}
              accessibilityLabel={accessibilityLabel}
              aria-valuemin={progress === null ? undefined : 0}
              aria-valuemax={progress === null ? undefined : 100}
              aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
              style={styles.counter}>
              <View style={styles.ring}>
                <Svg width="100%" height="100%" viewBox="0 0 100 100" style={StyleSheet.absoluteFill} aria-hidden>
                  <Circle cx={50} cy={50} r={RING_RADIUS} fill="none" stroke={track} strokeWidth={RING_WIDTH} />
                  {progress !== null && progress > 0 && (
                    <Circle
                      cx={50}
                      cy={50}
                      r={RING_RADIUS}
                      fill="none"
                      stroke={color}
                      strokeWidth={RING_WIDTH}
                      strokeLinecap="round"
                      strokeDasharray={progress < 1 ? [CIRCUMFERENCE, CIRCUMFERENCE] : undefined}
                      strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                      transform="rotate(-90 50 50)"
                    />
                  )}
                </Svg>
                <GraffitiIcon name={icon} color={color} size={16} />
                <ThemedText
                  type="metric"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.value, {
                    color: total === null ? theme.textSecondary : color,
                    fontSize: valueSize,
                    lineHeight: Math.ceil(valueSize * 1.17),
                  }]}>
                  {displayValue}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    marginTop: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.one,
    padding: Spacing.two,
    paddingVertical: Spacing.one + Spacing.half,
  },
  counter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  ring: {
    width: '100%',
    maxWidth: RING_MAX_SIZE,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { width: '74%', textAlign: 'center', includeFontPadding: false },
});
