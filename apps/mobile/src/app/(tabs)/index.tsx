import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { StreakCard } from '@/components/streak-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar, CardLabel, MetricCard, Screen, Section, Tile, TileGrid } from '@/components/ui';
import { VolumeHighlight } from '@/components/volume-highlight';
import { WeightCard } from '@/components/weight-card';
import { Radius, Spacing } from '@/constants/theme';
import { listWorkouts } from '@/data/history';
import { getProgramTree, listPrograms } from '@/data/programs';
import {
  activeSession,
  lastFinishedSession,
  nextWorkout,
  sessionSummary,
  startSession,
} from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, formatNumber } from '@/lib/format';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { usePreferences } from '@/lib/preferences';
import { toUnits, useUnits } from '@/lib/units';

/** How many workouts the bars of the last workout card show, the last one included. */
const RECENT_WORKOUTS = 7;

export default function TodayScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const theme = useTheme();
  const units = useUnits();
  const programId = useActiveProgram((state) => state.id);
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const onboarded = usePreferences((state) => state.onboarded);
  // Someone who already has programs or workouts (an update, a second device) needs no slides.
  const fresh = useLocal((ctx) => listPrograms(ctx).length === 0 && lastFinishedSession(ctx) === null);
  const today = useLocal((ctx) => {
    const last = lastFinishedSession(ctx);
    return {
      running: activeSession(ctx),
      tree: programId ? getProgramTree(ctx, programId) : null,
      next: programId ? nextWorkout(ctx, programId) : null,
      last: last ? sessionSummary(ctx, last.id) : null,
      // Oldest first: the last bar is the last workout.
      volumes: listWorkouts(ctx, RECENT_WORKOUTS)
        .map((workout) => workout.volumeKg)
        .reverse(),
    };
  });

  const open = (sessionId: string) => router.push({ pathname: '/workout/[id]', params: { id: sessionId } });

  const { running, tree, next, last, volumes } = today;
  const day = next?.days.find((candidate) => candidate.id === pickedDayId) ?? next?.day;
  const exercises = tree && day ? tree.items.filter((item) => item.program_day_id === day.id) : [];
  const weightUnit = t(units === 'lb' ? 'units.lb' : 'units.kg', { value: '' }).trim();
  const lifted = (kg: number) => formatNumber(Math.round(toUnits(kg, units)), locale);

  if (!onboarded && fresh) return <Redirect href="/onboarding" />;

  return (
    <Screen
      title={t('tabs.today')}
      hero
      headerRight={<Avatar label={t('tabs.profile')} onPress={() => router.push('/profile')} />}>
      {running ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <CardLabel icon="pulse" title={t('today.running')} color={theme.accent} />
          <Button title={t('today.resume')} onPress={() => open(running.id)} />
        </ThemedView>
      ) : tree && next && day ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <CardLabel icon="barbell" title={t('today.next')} color={theme.accent} />
          <View style={styles.dayText}>
            <ThemedText style={styles.title}>{day.title}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {tree.program.title}, {t('today.cycle', { cycle: next.cycle })},{' '}
              {t('programs.exercises', { count: exercises.length })}
            </ThemedText>
          </View>
          {next.deload && <ThemedText type="small">{t('today.deload')}</ThemedText>}
          <Button
            title={t('today.start')}
            disabled={exercises.length === 0}
            onPress={() => open(mutate((ctx) => startSession(ctx, tree.program.id, day.id)).id)}
          />
          {next.days.length > 1 &&
            (choosing ? (
              <View style={styles.chips}>
                {next.days.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.title}
                    selected={option.id === day.id}
                    onCard
                    onPress={() => setPickedDayId(option.id)}
                  />
                ))}
              </View>
            ) : (
              <Button variant="secondary" title={t('today.otherDay')} onPress={() => setChoosing(true)} />
            ))}
        </ThemedView>
      ) : (
        <ThemedView type="backgroundElement" style={[styles.card, styles.empty]}>
          <ThemedText style={[styles.title, styles.centered]}>{t('today.emptyTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            {tree ? t('today.noDaysText') : t('today.emptyText')}
          </ThemedText>
          <Button title={t('today.toPrograms')} onPress={() => router.push('/programs')} />
        </ThemedView>
      )}

      <Section title={t('today.quickLog')}>
        <TileGrid>
          <Tile
            icon="walk"
            color={theme.highlight}
            title={t('activity.record')}
            onPress={() => router.push('/activity')}
          />
          <Tile
            icon="timer"
            color={theme.accent}
            title={t('interval.title')}
            onPress={() => router.push('/interval')}
          />
        </TileGrid>
      </Section>

      <Section title={t('today.metrics')}>
        <StreakCard />
        <WeightCard />
        {last && (
          <MetricCard
            icon="stats-chart"
            title={t('today.last')}
            meta={new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
              new Date(last.session.started_at),
            )}
            // Cardio alone lifts nothing: its card shows the time instead of "0 kg".
            value={
              last.volumeKg > 0
                ? lifted(last.volumeKg)
                : formatDuration(t, Math.max(60, Math.round(last.durationSec / 60) * 60))
            }
            unit={last.volumeKg > 0 ? weightUnit : undefined}
            note={
              last.volumeKg > 0
                ? t('today.duration', { duration: formatDuration(t, last.durationSec) })
                : undefined
            }
            bars={volumes}
            barsLabel={t('today.volumesLabel', { list: volumes.map(lifted).join(', ') })}
            onPress={() =>
              router.push({ pathname: '/workout/summary/[id]', params: { id: last.session.id } })
            }
          />
        )}
      </Section>

      <VolumeHighlight onShowAll={() => router.push('/progress')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.three,
  },
  dayText: {
    gap: Spacing.half,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
});
