import { rankAlternatives, substitutedWeight, weightStepKg } from '@mvp/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Card, Group, LinkRow, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { activeSession, getSession, lastPerformance, substituteExercise } from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { ThemeOverride } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { useGym } from '@/lib/gym';
import { mutate, useLocal } from '@/lib/local';
import { formatKg } from '@/lib/workout';

/**
 * "The machine is taken": other exercises for the same muscles that do not need the equipment
 * of this one, each with the weight to start from.
 */
export default function BusyScreen() {
  return (
    <ThemeOverride.Provider value="dark">
      <Busy />
    </ThemeOverride.Provider>
  );
}

function Busy() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { catalog, exerciseById } = useCatalog();
  const gym = useGym();
  const [permanent, setPermanent] = useState(false);
  const found = useLocal((ctx) => {
    const session = activeSession(ctx);
    const entry = session
      ? getSession(ctx, session.id)?.exercises.find((candidate) => candidate.exercise.id === id)
      : undefined;
    if (!session || !entry) return null;
    // What the user has lifted before in each exercise decides the weight offered for it.
    const history = new Map(
      catalog.exercises.flatMap((exercise) => {
        const [last] = lastPerformance(ctx, exercise.id, session.id);
        return last?.weight_kg != null ? [[exercise.id, last.weight_kg] as const] : [];
      }),
    );
    return { entry, history };
  });

  const exercise = found && exerciseById.get(found.entry.exercise.exercise_id);
  if (!found || !exercise || !gym) {
    return <EmptyState title={t('workout.notFoundTitle')} text={t('workout.notFoundText')} />;
  }
  const { entry, history } = found;
  const alternatives = rankAlternatives(exercise, catalog.exercises, {
    equipment: gym.equipment,
    busy: new Set(exercise.equipment),
    withHistory: new Set(history.keys()),
  });

  const startWeight = (candidate: (typeof alternatives)[number]) => {
    const weight = substitutedWeight({
      historyWeightKg: history.get(candidate.exercise.id) ?? null,
      currentWeightKg: entry.plan?.next_weight_kg ?? null,
      weightRatio: candidate.weightRatio,
      stepKg: weightStepKg(candidate.exercise, catalog.equipment, gym.steps) ?? 0,
    });
    if (candidate.exercise.tracking !== 'weight_reps') return undefined;
    return weight.kind === 'find' ? t('busy.findWeight') : formatKg(t, locale, weight.weightKg);
  };

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        {t('replace.instead', { name: exercise.translations[locale].name })}
      </ThemedText>

      {entry.item && (
        <View style={styles.chips}>
          <Chip label={t('busy.onlyNow')} selected={!permanent} onPress={() => setPermanent(false)} />
          <Chip label={t('busy.forever')} selected={permanent} onPress={() => setPermanent(true)} />
        </View>
      )}

      {alternatives.length === 0 ? (
        <Group>
          <ThemedText type="smallBold">{t('busy.noneTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('busy.noneText')}</ThemedText>
        </Group>
      ) : (
        <Card>
          {alternatives.map((candidate) => (
            <LinkRow
              key={candidate.exercise.id}
              title={candidate.exercise.translations[locale].name}
              subtitle={startWeight(candidate)}
              onPress={() => {
                mutate((ctx) =>
                  substituteExercise(ctx, entry.exercise.id, candidate.exercise.id, permanent),
                );
                router.back();
              }}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
