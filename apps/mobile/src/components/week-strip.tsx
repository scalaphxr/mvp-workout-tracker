import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { toLocalDate } from '@/lib/format';
import { usePlannedWorkouts } from '@/lib/planned-workouts';
import { dateFromCalendarDay } from '@/lib/week';

import { ThemedText } from './themed-text';

export function WeekStrip({
  today, selected, position, recorded, onSelect,
}: {
  today: number;
  selected: number;
  position: SharedValue<number>;
  recorded: ReadonlySet<string>;
  onSelect: (day: number) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const router = useRouter();
  const plans = usePlannedWorkouts((state) => state.plans);
  const [width, setWidth] = useState(0);
  const trackStart = selected - 2;
  const cell = width / 3;
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (trackStart - position.get() + 1) * cell }],
  }));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const full = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const nearbyLabels = [t('week.yesterday'), t('tabs.today'), t('week.tomorrow')];

  return (
    <View style={styles.viewport} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <View
        pointerEvents="none"
        style={[styles.focus, { left: cell, width: cell, backgroundColor: theme.accentSoft }]}
      />
      {cell > 0 && (
        <Animated.View style={[styles.track, { width: cell * 5 }, trackStyle]}>
          {Array.from({ length: 5 }, (_, offset) => trackStart + offset).map((index) => {
            const day = dateFromCalendarDay(index);
            const date = toLocalDate(day);
            const focused = index === selected;
            const visible = Math.abs(index - selected) <= 1;
            const nearbyLabel = nearbyLabels[index - today + 1];
            const done = recorded.has(date);
            const plan = plans[date];
            return (
              <Pressable
                key={date}
                pointerEvents={visible ? 'auto' : 'none'}
                focusable={visible}
                accessibilityElementsHidden={!visible}
                importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={[
                  full.format(day),
                  nearbyLabel,
                  done && t('week.trained'),
                  plan && t('week.plannedAt', { time: plan.time }),
                ].filter(Boolean).join(', ')}
                accessibilityActions={focused ? [
                  { name: 'previousDay', label: t('week.previousDay') },
                  { name: 'nextDay', label: t('week.nextDay') },
                ] : undefined}
                onAccessibilityAction={({ nativeEvent: { actionName } }) => {
                  if (actionName === 'previousDay') onSelect(selected - 1);
                  if (actionName === 'nextDay') onSelect(selected + 1);
                }}
                onPress={() => {
                  if (focused) router.push({ pathname: '/week/[date]', params: { date } });
                  else onSelect(index);
                }}
                style={({ pressed }) => [
                  styles.day,
                  { width: cell },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="small" numberOfLines={1} adjustsFontSizeToFit themeColor="textSecondary">
                  {nearbyLabel ?? weekday.format(day)}
                </ThemedText>
                <View style={styles.dateRow}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.label}>
                    {short.format(day)}
                  </ThemedText>
                  {done && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
                  {plan && <Ionicons name="time" size={10} color={theme.highlight} />}
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minWidth: 0, minHeight: 44, overflow: 'hidden' },
  track: { flexDirection: 'row' },
  focus: { position: 'absolute', top: 0, bottom: 0, borderRadius: 12 },
  day: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.half,
    borderRadius: 12,
  },
  dateRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  label: { flexShrink: 1 },
  pressed: { opacity: 0.68 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
