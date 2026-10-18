import Ionicons from '@expo/vector-icons/Ionicons';
import { shiftDate, weekStart, weeklyStreak } from '@mvp/domain';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { finishedWorkoutTimes } from '@/data/history';
import { useTheme } from '@/hooks/use-theme';
import { toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';
import { useWeeklyGoal } from '@/lib/weekly-goal';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** Weeks in a row with the plan done (spec 6.13), in a friendly tone, without pressure. */
export function StreakCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const goal = useWeeklyGoal();
  const times = useLocal(finishedWorkoutTimes);
  if (goal === null) return null;

  const today = toLocalDate(new Date());
  const streak = weeklyStreak(
    times.map((time) => toLocalDate(new Date(time))),
    goal,
    today,
  );
  const { done } = streak.thisWeek;
  const lastWeekFrozen = streak.frozen.at(-1) === shiftDate(weekStart(today), -7);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="flame" size={28} color={streak.current > 0 ? theme.accent : theme.textSecondary} />
        <View style={styles.grow}>
          <ThemedText type="smallBold">
            {streak.current > 0 ? t('streak.current', { count: streak.current }) : t('streak.none')}
          </ThemedText>
          {streak.best > streak.current && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('streak.best', { count: streak.best })}
            </ThemedText>
          )}
        </View>
      </View>
      <ThemedText type="small">
        {done >= goal ? t('streak.weekDone') : t('streak.thisWeek', { done, goal })}
      </ThemedText>
      {lastWeekFrozen && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('streak.frozen')}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {streak.freezeLeft ? t('streak.freezeLeft') : t('streak.freezeUsed')}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
});
