import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { activitiesSince } from '@/data/activities';
import { finishedWorkoutTimes } from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';
import { usePlannedWorkouts } from '@/lib/planned-workouts';
import { weekOf } from '@/lib/week';

import { ThemedText } from './themed-text';

/**
 * The days of this week, Monday first, as tall pills: today filled with the accent, a dot under
 * every day with a workout or an activity in it.
 */
export function WeekStrip() {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const router = useRouter();
  const plans = usePlannedWorkouts((state) => state.plans);
  const [offset, setOffset] = useState(0);
  const at = new Date();
  const today = toLocalDate(at);
  at.setDate(at.getDate() + offset * 7);
  const days = weekOf(at);
  const since = days[0]!.toISOString();
  const trained = useLocal((ctx) => {
    return new Set([
      ...finishedWorkoutTimes(ctx)
        .filter((at) => at >= since)
        .map((at) => toLocalDate(new Date(at))),
      ...activitiesSince(ctx, since).map((activity) => toLocalDate(new Date(activity.started_at))),
    ]);
  }, [since]);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const range = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('week.previous')}
          style={styles.arrow} onPress={() => setOffset((week) => week - 1)}>
          <Ionicons name="chevron-back" color={theme.accent} size={21} />
        </Pressable>
        <ThemedText type="smallBold">{range.format(days[0]!)} – {range.format(days[6]!)}</ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('week.next')}
          style={styles.arrow} onPress={() => setOffset((week) => week + 1)}>
          <Ionicons name="chevron-forward" color={theme.accent} size={21} />
        </Pressable>
      </View>
      <View style={styles.strip}>
        {days.map((day) => {
          const date = toLocalDate(day);
          const isToday = date === today;
          const done = trained.has(date);
          const plan = plans[date];
          const future = date > today;
          const color = isToday ? theme.onAccent : future ? theme.textSecondary : theme.text;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={[full.format(day), done && t('week.trained'), plan && t('week.plannedAt', { time: plan.time })].filter(Boolean).join(', ')}
              onPress={() => router.push({ pathname: '/week/[date]', params: { date } })}
              style={({ pressed }) => [
                styles.day,
                isToday
                  ? { backgroundColor: theme.accent, borderColor: theme.accent }
                  : { backgroundColor: theme.backgroundElement, borderColor: theme.separator },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="small" style={[styles.weekday, { color: isToday ? theme.onAccent : theme.textSecondary }]}>
                {weekday.format(day).replace('.', '')}
              </ThemedText>
              <ThemedText style={[styles.number, { color }]}>{day.getDate()}</ThemedText>
              <View style={styles.markers}>
                {done && <View style={[styles.dot, { backgroundColor: isToday ? theme.onAccent : theme.bright }]} />}
                {plan && <Ionicons name="time" size={10} color={isToday ? theme.onAccent : theme.highlight} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
  strip: {
    flexDirection: 'row',
    gap: Spacing.one + Spacing.half,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.two + Spacing.one,
    paddingBottom: Spacing.two,
    gap: Spacing.half,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 84,
  },
  weekday: {
    fontSize: 13,
    lineHeight: 16,
  },
  number: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  markers: { minHeight: 10, flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
});
