import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { type ChartPoint, LineChart } from '@/components/line-chart';
import { ProgressExercisePicker } from '@/components/progress-exercise-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeightCard } from '@/components/weight-card';
import { Card, CardLabel, LinkRow, PictureNote, Screen, Segmented } from '@/components/ui';
import { Pictures } from '@/constants/pictures';
import { Radius, Spacing } from '@/constants/theme';
import { listActivities } from '@/data/activities';
import { listWeights } from '@/data/body';
import type { DataContext } from '@/data/context';
import {
  cardioProgress,
  exerciseProgress,
  listWorkoutTotals,
  performedExerciseIds,
  repetitionProgress,
} from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { useLocal } from '@/lib/local';
import { useWeightFormat } from '@/lib/units';
import { activityName, formatActivity, formatDistance, formatDuration, formatNumber } from '@/lib/format';

const TABS = ['weight', 'exercises', 'history'] as const;

export default function ProgressScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>('weight');
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  return (
    <Screen title={t('tabs.progress')}>
      <Segmented
        options={TABS.map((key) => ({
          value: key,
          label: t(`progress.${key}`),
        }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'weight' && <Weight />}
      {tab === 'exercises' && <Exercises chosen={exerciseId} onChoose={setExerciseId} />}
      {tab === 'history' && <History />}
    </Screen>
  );
}

function Weight() {
  const { t } = useTranslation();
  const weights = useLocal(listWeights);
  const weight = useWeightFormat();

  return (
    <>
      {weights.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.chartCard}>
          <CardLabel icon="trending-up" title={t('progress.weightHistory')} />
          <LineChart
            points={weights.map((entry) => ({ date: new Date(entry.date + 'T00:00:00'), value: entry.weight_kg }))}
            format={weight}
            axis={t('progress.recordedWeight')}
          />
        </ThemedView>
      )}
      <WeightCard />
      {weights.length === 0 && <PictureNote picture={Pictures.stopwatch} text={t('weight.empty')} />}
    </>
  );
}

function Exercises({
  chosen,
  onChoose,
}: {
  chosen: string | null;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const exerciseById = useCatalog((state) => state.exerciseById);
  const ids = useLocal(performedExerciseIds);
  const [open, setOpen] = useState(false);
  const options = ids
    .map((id) => ({ id, name: exerciseById.get(id)?.translations[locale].name ?? t('program.unknownExercise') }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const selected = options.find(({ id }) => id === chosen);

  if (options.length === 0) {
    return <PictureNote picture={Pictures.dumbbell} text={t('progress.noExercises')} />;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `${t('progress.chooseExercise')}, ${selected.name}` : t('progress.chooseExercise')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.picker,
          { backgroundColor: theme.backgroundElement, borderColor: theme.separator },
          pressed && styles.pressed,
        ]}>
        <View style={styles.pickerText}>
          <ThemedText type="small" themeColor="textSecondary">{t('progress.exerciseLabel')}</ThemedText>
          <ThemedText type="smallBold">{selected?.name ?? t('progress.chooseExercise')}</ThemedText>
        </View>
        <Ionicons name="chevron-down" size={20} color={theme.accent} />
      </Pressable>
      {selected && (
        <ExerciseChart
          exerciseId={selected.id}
          tracking={exerciseById.get(selected.id)?.tracking}
        />
      )}
      {open && (
        <ProgressExercisePicker
          options={options}
          selected={chosen}
          onClose={() => setOpen(false)}
          onSelect={(id) => { onChoose(id); setOpen(false); }}
        />
      )}
    </>
  );
}

type ExerciseMetric = 'topWeight' | 'repetitions' | 'distance' | 'time';

function exerciseSeries(ctx: DataContext, id: string, timed: boolean): {
  metric: ExerciseMetric;
  points: ChartPoint[];
} {
  if (!timed) {
    const weighted = exerciseProgress(ctx, id).filter((entry) => entry.weight_kg > 0);
    if (weighted.length) {
      return {
        metric: 'topWeight',
        points: weighted.map((entry) => ({ date: new Date(entry.date), value: entry.weight_kg })),
      };
    }
    const reps = repetitionProgress(ctx, id);
    if (reps.length) {
      return {
        metric: 'repetitions',
        points: reps.map((entry) => ({ date: new Date(entry.date), value: entry.reps })),
      };
    }
  }

  const efforts = cardioProgress(ctx, id);
  const distances = efforts.filter((entry) => entry.distance_m > 0);
  return distances.length
    ? { metric: 'distance', points: distances.map((entry) => ({ date: new Date(entry.date), value: entry.distance_m })) }
    : {
      metric: 'time',
      points: efforts.filter((entry) => entry.duration_sec > 0)
        .map((entry) => ({ date: new Date(entry.date), value: entry.duration_sec })),
    };
}

function ExerciseChart({ exerciseId, tracking }: { exerciseId: string; tracking?: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const weight = useWeightFormat();
  const timed = tracking === 'distance_time' || tracking === 'time';
  const { metric, points } = useLocal((ctx) => exerciseSeries(ctx, exerciseId, timed), [exerciseId, timed]);
  const formatters: Record<ExerciseMetric, (value: number) => string> = {
    topWeight: weight,
    repetitions: (value) => formatNumber(Math.round(value), locale),
    distance: (value) => formatDistance(t, locale, value),
    time: (value) => formatDuration(t, Math.round(value)),
  };

  return (
    <ThemedView type="backgroundElement" style={styles.chartCard}>
      {points.length > 0
        ? <LineChart points={points} axis={t(`progress.${metric}`)} format={formatters[metric]} />
        : <ThemedText themeColor="textSecondary">{t('progress.noExerciseData')}</ThemedText>}
    </ThemedView>
  );
}

/** Workouts and free activities together, newest first. */
function History() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const workouts = useLocal(listWorkoutTotals);
  const weight = useWeightFormat();
  const activities = useLocal(listActivities);
  const [latest] = workouts;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));

  const entries = [
    ...workouts.map((workout) => ({
      key: workout.session.id,
      at: workout.session.started_at,
      title: `${t('progress.workout', { number: workout.number })}, ${workout.dayTitle || t('workout.freeTitle')}`,
      // The date, then what the workout took and gave: time, calories, weight lifted.
      subtitle: [
        date(workout.session.started_at),
        formatDuration(t, Math.max(60, Math.round(workout.durationSec / 60) * 60)),
        workout.kcal !== null ? t('summary.kcalValue', { kcal: formatNumber(workout.kcal, locale) }) : null,
        workout.volumeKg > 0 ? weight(Math.round(workout.volumeKg)) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      open: () =>
        router.push({
          pathname: '/workout/summary/[id]',
          params: { id: workout.session.id },
        }),
    })),
    ...activities.map((activity) => ({
      key: activity.id,
      at: activity.started_at,
      title: activityName(t, activity.activity_type),
      subtitle: `${date(activity.started_at)}, ${formatActivity(t, locale, activity).split(': ').slice(1).join(': ')}`,
      open: () => router.push({ pathname: '/activity', params: { id: activity.id } }),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (entries.length === 0) {
    return <PictureNote picture={Pictures.calendar} text={t('progress.noHistory')} />;
  }
  return (
    <>
      <Card>
        <LinkRow
          icon="calendar"
          title={t('progress.weekReport')}
          onPress={() => router.push({ pathname: '/report', params: { kind: 'week' } })}
        />
        {latest && (
          <LinkRow
            icon="repeat"
            title={t('progress.cycleReport')}
            onPress={() =>
              router.push({
                pathname: '/report',
                params: {
                  kind: 'cycle',
                  program: latest.session.program_id,
                  cycle: String(latest.session.cycle_number),
                },
              })
            }
          />
        )}
      </Card>
      <Card>
        {entries.map((entry) => (
          <LinkRow key={entry.key} title={entry.title} subtitle={entry.subtitle} onPress={entry.open} />
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.field,
    minHeight: 64,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  pickerText: { flex: 1, gap: Spacing.one },
  pressed: { opacity: 0.7 },
  chartCard: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.three,
  },
});
