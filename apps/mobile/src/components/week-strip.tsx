import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { activitiesSince } from '@/data/activities';
import { finishedWorkoutTimes } from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';
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
  const days = weekOf(new Date());
  const since = days[0]!.toISOString();
  const trained = useLocal((ctx) => {
    return new Set([
      ...finishedWorkoutTimes(ctx)
        .filter((at) => at >= since)
        .map((at) => toLocalDate(new Date(at))),
      ...activitiesSince(ctx, since).map((activity) => toLocalDate(new Date(activity.started_at))),
    ]);
  }, [since]);
  const today = toLocalDate(new Date());
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const full = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={styles.strip}>
      {days.map((day) => {
        const date = toLocalDate(day);
        const isToday = date === today;
        const done = trained.has(date);
        const future = date > today;
        const color = isToday ? theme.onAccent : future ? theme.textSecondary : theme.text;
        return (
          <View
            key={date}
            accessible
            accessibilityLabel={`${full.format(day)}${done ? `, ${t('week.trained')}` : ''}`}
            style={[
              styles.day,
              isToday
                ? { backgroundColor: theme.accent, borderColor: theme.accent }
                : { backgroundColor: theme.backgroundElement, borderColor: theme.separator },
            ]}>
            <ThemedText type="small" style={[styles.weekday, { color: isToday ? theme.onAccent : theme.textSecondary }]}>
              {weekday.format(day).replace('.', '')}
            </ThemedText>
            <ThemedText style={[styles.number, { color }]}>{day.getDate()}</ThemedText>
            <View
              style={[
                styles.dot,
                { backgroundColor: done ? (isToday ? theme.onAccent : theme.bright) : 'transparent' },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
