import { shiftDate, weekStart, weeklyStreak } from '@mvp/domain';
import { useTranslation } from 'react-i18next';

import { finishedWorkoutTimes } from '@/data/history';
import { toLocalDate } from '@/lib/format';
import { useLocal } from '@/lib/local';
import { useWeeklyGoal } from '@/lib/weekly-goal';

import { ThemedText } from './themed-text';
import { MetricCard } from './ui';

/** How many weeks the bars of the card look back, this one included. */
const WEEKS = 6;

/** Weeks in a row with the plan done (spec 6.13), in a friendly tone, without pressure. */
export function StreakCard() {
  const { t } = useTranslation();
  const goal = useWeeklyGoal();
  const times = useLocal(finishedWorkoutTimes);
  if (goal === null) return null;

  const today = toLocalDate(new Date());
  const days = times.map((time) => toLocalDate(new Date(time)));
  const streak = weeklyStreak(days, goal, today);
  const { done } = streak.thisWeek;
  const thisMonday = weekStart(today);
  const lastWeekFrozen = streak.frozen.at(-1) === shiftDate(thisMonday, -7);
  // Workouts per week, oldest first: the last bar is this week.
  const perWeek = Array.from({ length: WEEKS }, (_, index) => {
    const monday = shiftDate(thisMonday, -7 * (WEEKS - 1 - index));
    return days.filter((day) => day <= today && weekStart(day) === monday).length;
  });

  return (
    <MetricCard
      icon="flame"
      title={streak.current > 0 ? t('streak.current', { count: streak.current }) : t('streak.title')}
      value={String(done)}
      unit={t('streak.unit', { goal })}
      note={done >= goal ? t('streak.weekDone') : undefined}
      bars={perWeek}
      barsLabel={t('streak.barsLabel', { list: perWeek.join(', ') })}>
      {streak.current === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('streak.none')}
        </ThemedText>
      )}
      {streak.best > streak.current && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('streak.best', { count: streak.best })}
        </ThemedText>
      )}
      {lastWeekFrozen && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('streak.frozen')}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {streak.freezeLeft ? t('streak.freezeLeft') : t('streak.freezeUsed')}
      </ThemedText>
    </MetricCard>
  );
}
