import { hasFeature, setsByMuscleGroup } from '@mvp/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, Screen, TextField } from '@/components/ui';
import { Pictures } from '@/constants/pictures';
import { Radius, Spacing } from '@/constants/theme';
import {
  resolveIncrease,
  resolveReduction,
  saveSessionAsProgram,
  sessionSummary,
  setWellbeing,
  startDeload,
} from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { formatCardio, formatDistance, formatDuration, formatNumber } from '@/lib/format';
import { itemDefaults } from '@/lib/item-defaults';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';
import { useUnits, useWeightFormat } from '@/lib/units';
import { explainPlan } from '@/lib/workout';

const WELLBEING = [1, 2, 3, 4, 5] as const;

/** What a workout came to: volume, records, and the plan for next time with its reasons. */
export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { exerciseById, muscleByCode } = useCatalog();
  const units = useUnits();
  const kg = useWeightFormat();
  const theme = useTheme();
  const summary = useLocal((ctx) => sessionSummary(ctx, id), [id]);
  const [deloadAccepted, setDeloadAccepted] = useState(false);

  if (!summary) {
    return <EmptyState title={t('workout.notFoundTitle')} text={t('workout.notFoundText')} />;
  }
  const { session } = summary;
  const { program_id: programId } = session;
  const name = (exerciseId: string) =>
    exerciseById.get(exerciseId)?.translations[locale].name ?? t('program.unknownExercise');
  /** Answers of the user change rows that have to reach the server too. */
  const change = (write: Parameters<typeof mutate>[0]) => {
    mutate(write);
    void syncNow();
  };

  const records = summary.exercises.flatMap(({ exercise, records: found, cardioRecords }) => [
    ...found.map((record) => {
      const params = { name: name(exercise.exercise_id), weight: kg(record.weight_kg), reps: record.reps };
      return record.kind === 'weight'
        ? t('summary.recordWeight', params)
        : record.kind === 'reps_at_weight'
          ? t('summary.recordReps', params)
          : t('summary.recordE1rm', params);
    }),
    ...cardioRecords.map((record) =>
      record.kind === 'distance'
        ? t('summary.recordDistance', {
            name: name(exercise.exercise_id),
            distance: formatDistance(t, locale, record.value),
          })
        : t('summary.recordDuration', {
            name: name(exercise.exercise_id),
            duration: formatDuration(t, record.value),
          }),
    ),
  ]);
  const planned = summary.exercises.filter((entry) => entry.plan !== null);
  const muscles = setsByMuscleGroup(
    summary.exercises.flatMap(({ exercise, sets }) => {
      const known = exerciseById.get(exercise.exercise_id);
      const work = sets.filter((set) => !set.is_warmup).length;
      return known ? [{ exercise: known, sets: work }] : [];
    }),
  );
  // Cardio has no plan for next time: what was done is what there is to show.
  const cardio = summary.exercises.filter(
    ({ exercise, sets }) =>
      sets.length > 0 && exerciseById.get(exercise.exercise_id)?.tracking === 'distance_time',
  );

  return (
    <Screen>
      <ThemedText type="subtitle">{t('summary.title')}</ThemedText>

      <View style={styles.totals}>
        {/* A workout of cardio alone has no volume to speak of. */}
        {summary.volumeKg > 0 && (
          <Total label={t('summary.volume')} value={kg(Math.round(summary.volumeKg))} large />
        )}
        <Total label={t('summary.duration')} value={formatDuration(t, summary.durationSec)} />
        <Total
          label={t('summary.kcal')}
          value={summary.kcal !== null ? t('summary.kcalValue', { kcal: formatNumber(summary.kcal, locale) }) : '—'}
          note={summary.kcal === null ? t('summary.kcalNoWeight') : undefined}
        />
      </View>

      {muscles.length > 0 && (
        <Group title={t('summary.muscles')}>
          <ThemedView type="backgroundElement" style={styles.card}>
            {muscles.map((group) => {
              const detail = group.muscles.filter((muscle) => muscle.code !== group.category);
              return (
                <View key={group.category} style={styles.muscleRow}>
                  <View style={styles.muscleText}>
                    <ThemedText type="smallBold">{t(`muscleCategories.${group.category}`)}</ThemedText>
                    {detail.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {detail
                          .map((muscle) => `${muscleByCode.get(muscle.code)?.name[locale] ?? muscle.code} ${muscle.sets}`)
                          .join(' · ')}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.muscleSets}>{t('summary.sets', { count: group.sets })}</ThemedText>
                </View>
              );
            })}
          </ThemedView>
        </Group>
      )}

      {records.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.records}>
          <View style={styles.recordsHeader}>
            <Image source={Pictures.trophy} style={styles.trophy} accessibilityIgnoresInvertColors />
            <View style={styles.recordsHeading}>
              <ThemedText type="section">{t('summary.records')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('summary.recordsCount', { count: records.length })}
              </ThemedText>
            </View>
          </View>
          {records.map((record) => (
            <View key={record} style={styles.record}>
              <View style={[styles.recordDot, { backgroundColor: theme.highlight }]} />
              <ThemedText style={styles.recordText}>{record}</ThemedText>
            </View>
          ))}
        </ThemedView>
      )}

      {cardio.length > 0 && (
        <Group title={t('summary.cardio')}>
          {cardio.map(({ exercise, sets }) => (
            <ThemedView key={exercise.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{name(exercise.exercise_id)}</ThemedText>
              {sets.map((set) => (
                <ThemedText key={set.id}>{formatCardio(t, locale, set)}</ThemedText>
              ))}
            </ThemedView>
          ))}
        </Group>
      )}

      {planned.length > 0 && (
        <Group title={t('summary.next')}>
          {planned.map(({ exercise, plan }) => {
            if (!plan) return null;
            const offer = plan.reason_code === 'reduce_offer' ? plan.reason_params.reduced_weight_kg : undefined;
            const raise = plan.reason_code === 'increase_offer' ? plan.reason_params.increased_weight_kg : undefined;
            return (
              <ThemedView key={exercise.id} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{name(exercise.exercise_id)}</ThemedText>
                <ThemedText style={styles.next}>
                  {plan.next_weight_kg !== null
                    ? t('summary.nextWeight', { weight: kg(plan.next_weight_kg), reps: plan.next_target_reps })
                    : t('summary.nextReps', { reps: plan.next_target_reps })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {explainPlan(t, locale, plan, units)}
                </ThemedText>
                {offer !== undefined && plan.next_weight_kg !== null && (
                  <View style={styles.choice}>
                    <Button
                      title={t('summary.reduceYes', { weight: kg(offer) })}
                      onPress={() => change((ctx) => resolveReduction(ctx, plan.program_item_id, true))}
                    />
                    <Button
                      variant="secondary"
                      title={t('summary.reduceNo', { weight: kg(plan.next_weight_kg) })}
                      onPress={() => change((ctx) => resolveReduction(ctx, plan.program_item_id, false))}
                    />
                  </View>
                )}
                {raise !== undefined && plan.next_weight_kg !== null && (
                  <View style={styles.choice}>
                    <Button
                      title={t('summary.increaseYes', { weight: kg(raise) })}
                      onPress={() => change((ctx) => resolveIncrease(ctx, plan.program_item_id, true))}
                    />
                    <Button
                      variant="secondary"
                      title={t('summary.reduceNo', { weight: kg(plan.next_weight_kg) })}
                      onPress={() => change((ctx) => resolveIncrease(ctx, plan.program_item_id, false))}
                    />
                  </View>
                )}
              </ThemedView>
            );
          })}
        </Group>
      )}

      {summary.offerDeload && programId !== null && hasFeature(null, 'deload') && (
        <Group title={t('summary.deloadTitle')}>
          <ThemedText>{t('summary.deloadText')}</ThemedText>
          <Button
            variant="secondary"
            title={t('summary.deloadYes')}
            onPress={() => {
              change((ctx) => startDeload(ctx, programId));
              setDeloadAccepted(true);
            }}
          />
        </Group>
      )}
      {deloadAccepted && <ThemedText themeColor="textSecondary">{t('summary.deloadAccepted')}</ThemedText>}

      {programId === null && summary.exercises.some((entry) => entry.sets.length > 0) && (
        <SaveAsProgram sessionId={session.id} startedAt={session.started_at} />
      )}

      <Group title={t('summary.wellbeing')}>
        <View style={styles.chips}>
          {WELLBEING.map((value) => (
            <Chip
              key={value}
              label={formatNumber(value, locale)}
              selected={session.wellbeing === value}
              onPress={() =>
                change((ctx) => setWellbeing(ctx, session.id, session.wellbeing === value ? null : value))
              }
            />
          ))}
        </View>
      </Group>

      <View style={styles.choice}>
        <Button
          variant="secondary"
          title={t('report.open')}
          onPress={() => router.push({ pathname: '/report', params: { kind: 'session', id: session.id } })}
        />
        <Button title={t('summary.close')} onPress={() => router.dismissTo('/')} />
      </View>
    </Screen>
  );
}

/** The offer to turn a workout without a program into a program of one day. */
function SaveAsProgram({ sessionId, startedAt }: { sessionId: string; startedAt: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { exerciseById } = useCatalog();
  const [title, setTitle] = useState(() =>
    t('summary.saveDefaultName', {
      date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(
        new Date(startedAt),
      ),
    }),
  );
  const [savedId, setSavedId] = useState<string | null>(null);

  const save = () => {
    const program = mutate((ctx) =>
      saveSessionAsProgram(ctx, sessionId, {
        title: title.trim(),
        dayTitle: t('programs.dayTitle', { number: 1 }),
        params: (exerciseId) => {
          const exercise = exerciseById.get(exerciseId);
          return exercise ? itemDefaults(exercise, null) : null;
        },
      }),
    );
    if (!program) return;
    const active = useActiveProgram.getState();
    if (active.id === null) active.set(program.id);
    setSavedId(program.id);
    void syncNow();
  };

  if (savedId) {
    return (
      <Group title={t('summary.saved')}>
        <Button
          variant="secondary"
          title={t('summary.openProgram')}
          onPress={() => router.push({ pathname: '/program/[id]', params: { id: savedId } })}
        />
      </Group>
    );
  }
  return (
    <Group title={t('summary.saveTitle')}>
      <TextField label={t('summary.saveName')} value={title} maxLength={120} onChangeText={setTitle} />
      <Button title={t('summary.save')} disabled={title.trim() === ''} onPress={save} />
    </Group>
  );
}

/** One of the totals; the `large` one, the volume, takes a row of its own. */
function Total({ label, value, note, large }: { label: string; value: string; note?: string; large?: boolean }) {
  return (
    <ThemedView type="backgroundElement" style={[styles.total, large && styles.totalLarge]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="metric" style={!large && styles.totalValue}>
        {value}
      </ThemedText>
      {note && (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  totals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  total: {
    flexGrow: 1,
    flexBasis: 120,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  totalLarge: {
    flexBasis: '100%',
  },
  totalValue: {
    fontSize: 28,
    lineHeight: 34,
  },
  records: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  recordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  trophy: {
    width: 72,
    height: 72,
  },
  recordsHeading: {
    flex: 1,
  },
  record: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  recordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  recordText: {
    flex: 1,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  muscleText: {
    flex: 1,
  },
  muscleSets: {
    fontWeight: 700,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.one,
  },
  next: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
  },
  choice: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
