import { hasFeature } from '@mvp/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { resolveReduction, sessionSummary, setWellbeing, startDeload } from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { formatCardio, formatDistance, formatDuration, formatNumber } from '@/lib/format';
import { mutate, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';
import { explainPlan, formatKg } from '@/lib/workout';

const WELLBEING = [1, 2, 3, 4, 5] as const;

/** What a workout came to: volume, records, and the plan for next time with its reasons. */
export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { exerciseById } = useCatalog();
  const summary = useLocal((ctx) => sessionSummary(ctx, id));
  const [deloadAccepted, setDeloadAccepted] = useState(false);

  if (!summary) {
    return <EmptyState title={t('workout.notFoundTitle')} text={t('workout.notFoundText')} />;
  }
  const { session } = summary;
  const name = (exerciseId: string) =>
    exerciseById.get(exerciseId)?.translations[locale].name ?? t('program.unknownExercise');
  const kg = (value: number) => formatKg(t, locale, value);
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
  // Cardio has no plan for next time: what was done is what there is to show.
  const cardio = summary.exercises.filter(
    ({ exercise, sets }) =>
      sets.length > 0 && exerciseById.get(exercise.exercise_id)?.tracking === 'distance_time',
  );

  return (
    <Screen>
      <ThemedText style={styles.title}>{t('summary.title')}</ThemedText>

      <View style={styles.totals}>
        {/* A workout of cardio alone has no volume to speak of. */}
        {summary.volumeKg > 0 && (
          <Total label={t('summary.volume')} value={kg(Math.round(summary.volumeKg))} />
        )}
        <Total label={t('summary.duration')} value={formatDuration(t, summary.durationSec)} />
      </View>

      {records.length > 0 && (
        <Group title={t('summary.records')}>
          {records.map((record) => (
            <ThemedText key={record}>{record}</ThemedText>
          ))}
        </Group>
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
            return (
              <ThemedView key={exercise.id} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{name(exercise.exercise_id)}</ThemedText>
                <ThemedText style={styles.next}>
                  {plan.next_weight_kg !== null
                    ? t('summary.nextWeight', { weight: kg(plan.next_weight_kg), reps: plan.next_target_reps })
                    : t('summary.nextReps', { reps: plan.next_target_reps })}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {explainPlan(t, locale, plan)}
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
              </ThemedView>
            );
          })}
        </Group>
      )}

      {summary.offerDeload && hasFeature(null, 'deload') && (
        <Group title={t('summary.deloadTitle')}>
          <ThemedText>{t('summary.deloadText')}</ThemedText>
          <Button
            variant="secondary"
            title={t('summary.deloadYes')}
            onPress={() => {
              change((ctx) => startDeload(ctx, session.program_id));
              setDeloadAccepted(true);
            }}
          />
        </Group>
      )}
      {deloadAccepted && <ThemedText themeColor="textSecondary">{t('summary.deloadAccepted')}</ThemedText>}

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

function Total({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.total}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.totalValue}>{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  totals: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  total: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  totalValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
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
