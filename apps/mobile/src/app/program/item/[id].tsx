import { weightStepKg } from '@mvp/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Card, ConfirmButton, Group, Screen, Stepper, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  dayItems,
  deleteItem,
  getItem,
  type ItemPatch,
  setSuperset,
  updateItem,
} from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { formatDuration, formatNumber } from '@/lib/format';
import { useGym } from '@/lib/gym';
import { mutate, useLocal } from '@/lib/local';

/** RIR is marked in one tap: 0, 1, 2, 3 or "4 and more". */
const RIR_OPTIONS = [0, 1, 2, 3, 4] as const;
const STEP_OPTIONS = [0.5, 1, 1.25, 2, 2.5, 5, 10] as const;

/** How the range of an item is called, by how the exercise is counted. */
const RANGE_LABELS = {
  weight_reps: ['item.repsMin', 'item.repsMax'],
  reps: ['item.repsMin', 'item.repsMax'],
  time: ['item.secondsMin', 'item.secondsMax'],
  distance_time: ['item.minutesMin', 'item.minutesMax'],
} as const;

export default function ProgramItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { catalog, exerciseById } = useCatalog();
  const gym = useGym();
  const item = useLocal((ctx) => getItem(ctx, id));
  const siblings = useLocal((ctx) => (item ? dayItems(ctx, item.program_day_id) : []));
  const [notes, setNotes] = useState(item?.notes ?? '');

  if (!item) {
    return <EmptyState title={t('program.notFoundTitle')} text={t('program.notFoundText')} />;
  }
  const exercise = exerciseById.get(item.exercise_id);
  const tracking = exercise?.tracking ?? 'weight_reps';
  const [minLabel, maxLabel] = RANGE_LABELS[tracking];
  const isLast = siblings.at(-1)?.id === item.id;
  // The step of the equipment in the main gym: what "as in the gym" means for this exercise.
  const gymStep = exercise ? weightStepKg(exercise, catalog.equipment, gym?.steps) : null;
  // Timed holds and cardio are planned in bigger steps than reps.
  const rangeStep = tracking === 'time' ? 5 : 1;

  const change = (patch: ItemPatch) => mutate((ctx) => updateItem(ctx, item.id, patch));
  const kg = (value: number) => t('units.kg', { value: formatNumber(value, locale) });

  return (
    <Screen>
      <ThemedText style={styles.title}>
        {exercise ? exercise.translations[locale].name : t('program.unknownExercise')}
      </ThemedText>

      <Card>
        {tracking !== 'distance_time' && (
          <Stepper
            label={t('item.sets')}
            value={item.sets}
            min={1}
            max={20}
            onChange={(sets) => change({ sets })}
          />
        )}
        {/* The two ends of the range push each other, so min never passes max. */}
        <Stepper
          label={t(minLabel)}
          value={item.rep_min}
          min={1}
          max={999}
          step={rangeStep}
          onChange={(rep_min) => change({ rep_min, rep_max: Math.max(rep_min, item.rep_max) })}
        />
        <Stepper
          label={t(maxLabel)}
          value={item.rep_max}
          min={1}
          max={999}
          step={rangeStep}
          onChange={(rep_max) => change({ rep_max, rep_min: Math.min(rep_max, item.rep_min) })}
        />
        {tracking !== 'distance_time' && (
          <Stepper
            label={t('item.rest')}
            value={item.rest_sec}
            text={formatDuration(t, item.rest_sec)}
            min={0}
            max={3600}
            step={15}
            onChange={(rest_sec) => change({ rest_sec })}
          />
        )}
      </Card>

      {(tracking === 'weight_reps' || tracking === 'reps') && (
        <Group title={t('item.rir')}>
          <View style={styles.chips}>
            <Chip
              label={t('item.rirNone')}
              selected={item.target_rir === null}
              onPress={() => change({ target_rir: null })}
            />
            {RIR_OPTIONS.map((rir) => (
              <Chip
                key={rir}
                label={rir === 4 ? t('item.rirMore') : String(rir)}
                selected={item.target_rir === rir}
                onPress={() => change({ target_rir: rir })}
              />
            ))}
          </View>
        </Group>
      )}

      {gymStep !== null && (
        <Group title={t('item.step')}>
          <View style={styles.chips}>
            <Chip
              label={`${t('item.stepAuto')} (${kg(gymStep)})`}
              selected={item.increment_kg === null}
              onPress={() => change({ increment_kg: null })}
            />
            {STEP_OPTIONS.map((step) => (
              <Chip
                key={step}
                label={kg(step)}
                selected={item.increment_kg === step}
                onPress={() => change({ increment_kg: step })}
              />
            ))}
          </View>
        </Group>
      )}

      <Group title={t('item.notes')}>
        <TextField
          label={t('item.notes')}
          value={notes}
          placeholder={t('item.notesPlaceholder')}
          maxLength={1000}
          onChangeText={(text) => {
            setNotes(text);
            change({ notes: text });
          }}
        />
      </Group>

      <View style={styles.actions}>
        <Button
          variant="secondary"
          title={t('item.replace')}
          onPress={() => router.push({ pathname: '/program/replace/[id]', params: { id: item.id } })}
        />
        {item.superset_group !== null && (
          <Button
            variant="secondary"
            title={t('item.unlink')}
            onPress={() => mutate((ctx) => setSuperset(ctx, item.id, 'unlink'))}
          />
        )}
        {!isLast && (
          <Button
            variant="secondary"
            title={t('item.linkNext')}
            onPress={() => mutate((ctx) => setSuperset(ctx, item.id, 'link-next'))}
          />
        )}
        {exercise && (
          <Button
            variant="secondary"
            title={t('item.openCard')}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
          />
        )}
        <ConfirmButton
          title={t('item.delete')}
          onConfirm={() => {
            mutate((ctx) => deleteItem(ctx, item.id));
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  actions: {
    gap: Spacing.two,
  },
});
