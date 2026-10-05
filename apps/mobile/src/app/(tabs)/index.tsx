import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, LinkRow, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getProgramTree } from '@/data/programs';
import {
  activeSession,
  lastFinishedSession,
  nextWorkout,
  sessionSummary,
  startSession,
} from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { formatDuration } from '@/lib/format';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { formatKg } from '@/lib/workout';

export default function TodayScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const programId = useActiveProgram((state) => state.id);
  const [pickedDayId, setPickedDayId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const today = useLocal((ctx) => {
    const last = lastFinishedSession(ctx);
    return {
      running: activeSession(ctx),
      tree: programId ? getProgramTree(ctx, programId) : null,
      next: programId ? nextWorkout(ctx, programId) : null,
      last: last ? sessionSummary(ctx, last.id) : null,
    };
  });

  const open = (sessionId: string) =>
    router.push({ pathname: '/workout/[id]', params: { id: sessionId } });

  const { running, tree, next, last } = today;
  const day = next?.days.find((candidate) => candidate.id === pickedDayId) ?? next?.day;
  const exercises = tree && day ? tree.items.filter((item) => item.program_day_id === day.id) : [];

  return (
    <Screen>
      {running ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.title}>{t('today.running')}</ThemedText>
          <Button title={t('today.resume')} onPress={() => open(running.id)} />
        </ThemedView>
      ) : tree && next && day ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('today.next')}
            </ThemedText>
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
                    onPress={() => setPickedDayId(option.id)}
                  />
                ))}
              </View>
            ) : (
              <Button variant="secondary" title={t('today.otherDay')} onPress={() => setChoosing(true)} />
            ))}
        </ThemedView>
      ) : (
        <View style={styles.empty}>
          <ThemedText style={styles.title}>{t('today.emptyTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            {tree ? t('today.noDaysText') : t('today.emptyText')}
          </ThemedText>
          <Button title={t('today.toPrograms')} onPress={() => router.push('/programs')} />
        </View>
      )}

      {last && (
        <Group title={t('today.last')}>
          <ThemedView type="backgroundElement" style={styles.row}>
            <LinkRow
              title={new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
                new Date(last.session.started_at),
              )}
              subtitle={`${t('today.volume', { volume: formatKg(t, locale, Math.round(last.volumeKg)) })}, ${t('today.duration', { duration: formatDuration(t, last.durationSec) })}`}
              onPress={() =>
                router.push({ pathname: '/workout/summary/[id]', params: { id: last.session.id } })
              }
            />
          </ThemedView>
        </Group>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  centered: {
    textAlign: 'center',
  },
  row: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
});
