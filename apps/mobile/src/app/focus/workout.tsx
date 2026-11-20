import { planFocusWorkout } from '@mvp/domain';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { startFocusSession } from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { useFocusContext, useFocusEdits } from '@/lib/focus-workout';
import { useLibraryFilters } from '@/lib/library-filters';
import { mutate } from '@/lib/local';

const DURATIONS = [30, 45, 60, 75, 90] as const;

/** One workout for the chosen muscles: its length, a look at the exercises, the start. */
export default function FocusWorkoutScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ muscles?: string }>();
  const { exerciseById, muscleByCode } = useCatalog();
  const context = useFocusContext();
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(60);
  const { replaced, removed, remove, reset } = useFocusEdits();

  // The picker narrows the library down to one muscle: back here, the library is as it was.
  useFocusEffect(
    useCallback(() => {
      useLibraryFilters.getState().reset();
    }, []),
  );

  const muscles = params.muscles ? params.muscles.split(',') : [];
  const plan = planFocusWorkout(muscles, duration, context);
  const nameOf = (code: string) => muscleByCode.get(code)?.name[locale] ?? code;

  const seen = new Set<string>();
  const items = plan.items.flatMap((item) => {
    if (removed.includes(item.exercise_id)) return [];
    const id = replaced[item.exercise_id] ?? item.exercise_id;
    // The same exercise picked twice is done once, as anywhere in a free workout.
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ ...item, planned_id: item.exercise_id, exercise_id: id }];
  });

  const start = () => {
    const session = mutate((ctx) => startFocusSession(ctx, items));
    router.dismissTo('/');
    router.push({ pathname: '/workout/[id]', params: { id: session.id } });
  };

  return (
    <Screen>
      <Group title={t('focus.duration')}>
        <View style={styles.chips}>
          {DURATIONS.map((option) => (
            <Chip
              key={option}
              label={t('units.min', { value: option })}
              selected={duration === option}
              onPress={() => {
                reset();
                setDuration(option);
              }}
            />
          ))}
        </View>
      </Group>

      {plan.dropped.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('focus.dropped', { muscles: plan.dropped.map(nameOf).join(', ') })}
        </ThemedText>
      )}
      {plan.short && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('focus.short')}
        </ThemedText>
      )}

      <Group title={t('focus.exercises')}>
        {items.map((item) => (
          <ThemedView key={item.planned_id} type="backgroundElement" style={styles.item}>
            <ThemedText>{exerciseById.get(item.exercise_id)?.translations[locale].name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('focus.itemPlan', { muscle: nameOf(item.muscle), count: item.sets })}
            </ThemedText>
            <View style={styles.itemActions}>
              <View style={styles.grow}>
                <Button
                  variant="secondary"
                  title={t('focus.replace')}
                  onPress={() => {
                    useLibraryFilters.getState().setMuscles([item.muscle]);
                    router.push({
                      pathname: '/exercise-picker',
                      params: { focusItem: item.planned_id },
                    });
                  }}
                />
              </View>
              <View style={styles.grow}>
                <Button
                  variant="secondary"
                  title={t('focus.remove')}
                  onPress={() => remove(item.planned_id)}
                />
              </View>
            </View>
          </ThemedView>
        ))}
        {items.length === 0 && (
          <ThemedText themeColor="textSecondary">{t('focus.empty')}</ThemedText>
        )}
      </Group>

      <Button title={t('focus.start')} disabled={items.length === 0} onPress={start} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  item: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  grow: {
    flex: 1,
  },
});
