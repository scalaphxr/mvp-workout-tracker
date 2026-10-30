import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeightCard } from '@/components/weight-card';
import { Card, CardLabel, LinkRow, Screen, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { listActivities } from '@/data/activities';
import { listWeights } from '@/data/body';
import {
  cardioProgress,
  exerciseProgress,
  exercisesOnTime,
  exercisesWithProgress,
  listWorkouts,
} from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { useLocal } from '@/lib/local';
import { useWeightFormat } from '@/lib/units';
import { activityName, formatActivity, formatDistance, formatDuration } from '@/lib/format';

const TABS = ['weight', 'exercises', 'history'] as const;

export default function ProgressScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>('weight');

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
      {tab === 'exercises' && <Exercises />}
      {tab === 'history' && <History />}
    </Screen>
  );
}

function Weight() {
  const { t } = useTranslation();
  const theme = useTheme();
  const weights = useLocal(listWeights);
  // The chart shows the last three months: enough to see a trend, few enough to read.
  const recent = weights.slice(-90);
  const weight = useWeightFormat();
  const kg = (value: number) => weight(Math.round(value * 10) / 10);

  return (
    <>
      <WeightCard />
      {recent.length >= 2 ? (
        <ThemedView type="backgroundElement" style={styles.chartCard}>
          <CardLabel icon="trending-up" title={t('progress.weight')} />
          <LineChart
            series={[
              {
                values: recent.map((entry) => entry.weight_kg),
                color: theme.highlight,
              },
            ]}
            format={kg}
            label={t('weight.chartLabel', {
              from: kg(recent[0]?.weight_kg ?? 0),
              to: kg(recent.at(-1)?.weight_kg ?? 0),
            })}
          />
        </ThemedView>
      ) : (
        <ThemedText themeColor="textSecondary">{t('weight.empty')}</ThemedText>
      )}
    </>
  );
}

function Exercises() {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const { exerciseById } = useCatalog();
  // Cardio gets a chart too, without any progression behind it.
  const ids = useLocal((ctx) => [
    ...exercisesWithProgress(ctx),
    ...exercisesOnTime(ctx).filter((id) => exerciseById.get(id)?.tracking === 'distance_time'),
  ]);
  const [chosen, setChosen] = useState<string | null>(null);
  const exerciseId = chosen ?? ids[0] ?? null;
  const cardio = exerciseId !== null && exerciseById.get(exerciseId)?.tracking === 'distance_time';
  const points = useLocal((ctx) => (exerciseId && !cardio ? exerciseProgress(ctx, exerciseId) : []));
  const name = (id: string) => exerciseById.get(id)?.translations[locale].name ?? id;
  const weight = useWeightFormat();
  const kg = (value: number) => weight(Math.round(value * 10) / 10);

  if (!exerciseId) return <ThemedText themeColor="textSecondary">{t('progress.noExercises')}</ThemedText>;
  return (
    <>
      <View style={styles.chips}>
        {ids.map((id) => (
          <Chip key={id} label={name(id)} selected={id === exerciseId} onPress={() => setChosen(id)} />
        ))}
      </View>
      <ThemedView type="backgroundElement" style={styles.chartCard}>
        <CardLabel icon="barbell" title={name(exerciseId)} />
        {cardio ? (
          <CardioChart exerciseId={exerciseId} name={name(exerciseId)} />
        ) : (
          <LineChart
            series={[
              {
                values: points.map((point) => point.e1rm),
                color: theme.textSecondary,
                title: t('progress.e1rm'),
              },
              {
                values: points.map((point) => point.weight_kg),
                color: theme.highlight,
                title: t('progress.topWeight'),
              },
            ]}
            format={kg}
            label={t('progress.chartLabel', {
              name: name(exerciseId),
              from: kg(points[0]?.weight_kg ?? 0),
              to: kg(points.at(-1)?.weight_kg ?? 0),
            })}
          />
        )}
      </ThemedView>
    </>
  );
}

/** The distance of a cardio exercise per workout, or its time when no distance was logged. */
function CardioChart({ exerciseId, name }: { exerciseId: string; name: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const points = useLocal((ctx) => cardioProgress(ctx, exerciseId));
  const byDistance = points.some((point) => point.distance_m > 0);
  const values = points.map((point) => (byDistance ? point.distance_m : point.duration_sec));
  const format = (value: number) =>
    byDistance ? formatDistance(t, locale, value) : formatDuration(t, Math.round(value / 60) * 60);

  return (
    <LineChart
      series={[
        {
          values,
          color: theme.highlight,
          title: byDistance ? t('progress.distance') : t('progress.time'),
        },
      ]}
      format={format}
      label={t('progress.chartLabel', {
        name,
        from: format(values[0] ?? 0),
        to: format(values.at(-1) ?? 0),
      })}
    />
  );
}

/** Workouts and free activities together, newest first. */
function History() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const workouts = useLocal(listWorkouts);
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
      subtitle:
        workout.volumeKg > 0
          ? `${date(workout.session.started_at)}, ${weight(Math.round(workout.volumeKg))}`
          : `${date(workout.session.started_at)}, ${formatDuration(t, Math.max(60, Math.round(workout.durationSec / 60) * 60))}`,
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
    return <ThemedText themeColor="textSecondary">{t('progress.noHistory')}</ThemedText>;
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chartCard: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.three,
  },
});
