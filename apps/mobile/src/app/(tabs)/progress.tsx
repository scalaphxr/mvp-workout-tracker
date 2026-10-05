import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { WeightCard } from '@/components/weight-card';
import { Card, LinkRow, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { listWeights } from '@/data/body';
import { exerciseProgress, exercisesWithProgress, listWorkouts } from '@/data/history';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { useLocal } from '@/lib/local';
import { formatKg } from '@/lib/workout';

const TABS = ['weight', 'exercises', 'history'] as const;

export default function ProgressScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<(typeof TABS)[number]>('weight');

  return (
    <Screen>
      <View style={styles.chips}>
        {TABS.map((key) => (
          <Chip key={key} label={t(`progress.${key}`)} selected={tab === key} onPress={() => setTab(key)} />
        ))}
      </View>
      {tab === 'weight' && <Weight />}
      {tab === 'exercises' && <Exercises />}
      {tab === 'history' && <History />}
    </Screen>
  );
}

function Weight() {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const weights = useLocal(listWeights);
  // The chart shows the last three months: enough to see a trend, few enough to read.
  const recent = weights.slice(-90);
  const kg = (value: number) => formatKg(t, locale, Math.round(value * 10) / 10);

  return (
    <>
      <WeightCard />
      {recent.length >= 2 ? (
        <LineChart
          series={[{ values: recent.map((entry) => entry.weight_kg), color: theme.accent }]}
          format={kg}
          label={t('weight.chartLabel', {
            from: kg(recent[0]?.weight_kg ?? 0),
            to: kg(recent.at(-1)?.weight_kg ?? 0),
          })}
        />
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
  const ids = useLocal(exercisesWithProgress);
  const [chosen, setChosen] = useState<string | null>(null);
  const exerciseId = chosen ?? ids[0] ?? null;
  const points = useLocal((ctx) => (exerciseId ? exerciseProgress(ctx, exerciseId) : []));
  const name = (id: string) => exerciseById.get(id)?.translations[locale].name ?? id;
  const kg = (value: number) => formatKg(t, locale, Math.round(value * 10) / 10);

  if (!exerciseId) return <ThemedText themeColor="textSecondary">{t('progress.noExercises')}</ThemedText>;
  return (
    <>
      <View style={styles.chips}>
        {ids.map((id) => (
          <Chip key={id} label={name(id)} selected={id === exerciseId} onPress={() => setChosen(id)} />
        ))}
      </View>
      <LineChart
        series={[
          {
            values: points.map((point) => point.e1rm),
            color: theme.textSecondary,
            title: t('progress.e1rm'),
          },
          {
            values: points.map((point) => point.weight_kg),
            color: theme.accent,
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
    </>
  );
}

function History() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const workouts = useLocal(listWorkouts);
  const [latest] = workouts;

  if (!latest) return <ThemedText themeColor="textSecondary">{t('progress.noHistory')}</ThemedText>;
  return (
    <>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          title={t('progress.weekReport')}
          onPress={() => router.push({ pathname: '/report', params: { kind: 'week' } })}
        />
        <Button
          variant="secondary"
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
      </View>
      <Card>
        {workouts.map((workout) => (
          <LinkRow
            key={workout.session.id}
            title={`${t('progress.workout', { number: workout.number })}, ${workout.dayTitle}`}
            subtitle={`${new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(workout.session.started_at),
            )}, ${formatKg(t, locale, Math.round(workout.volumeKg))}`}
            onPress={() =>
              router.push({ pathname: '/workout/summary/[id]', params: { id: workout.session.id } })
            }
          />
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
  actions: {
    gap: Spacing.two,
  },
});
