import Ionicons from '@expo/vector-icons/Ionicons';
import { hasFeature, substitutedWeight } from '@mvp/domain';
import type { Exercise } from '@mvp/schemas';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CardioSet } from '@/components/cardio-set';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { MuscleMap } from '@/components/muscle-map';
import { RecordBanner } from '@/components/record-banner';
import { RestTimer } from '@/components/rest-timer';
import { ThemedText } from '@/components/themed-text';
import { ConfirmButton, Stepper } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { afterSet } from '@/data/flow';
import {
  abandonSession,
  finishSession,
  getSession,
  lastPerformance,
  logSet,
  recordsOfSet,
  removeLastSet,
  type SessionExerciseView,
  type SetRecords,
} from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { ThemeOverride, useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { haptic } from '@/lib/feedback';
import { formatCardio, formatDistance, formatDuration, formatRange } from '@/lib/format';
import { mutate, useLocal } from '@/lib/local';
import { useRestTimer } from '@/lib/rest-timer';
import { syncNow } from '@/lib/sync';
import { fromUnits, toUnits, useUnits, useWeightFormat } from '@/lib/units';
import { explainPlan, useExerciseFacts } from '@/lib/workout';

/** RIR is marked in one tap: 0, 1, 2, 3 or "4 and more". */
const RIR_OPTIONS = [0, 1, 2, 3, 4] as const;

export default function WorkoutScreen() {
  // The workout screen is dark whatever the system theme is.
  return (
    <ThemeOverride.Provider value="dark">
      <Workout />
    </ThemeOverride.Provider>
  );
}

function Workout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { exerciseById } = useCatalog();
  const facts = useExerciseFacts();
  const weight = useWeightFormat();
  const startRest = useRestTimer((state) => state.start);
  const stopRest = useRestTimer((state) => state.stop);
  const view = useLocal((ctx) => getSession(ctx, id));
  // What the user tapped in the list; otherwise the workout leads on by itself.
  const [chosenId, setChosenId] = useState<string | null>(null);
  // A record just set: shown over the next set for a few seconds.
  const [record, setRecord] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!record) return;
    const hide = setTimeout(() => setRecord(null), 4000);
    return () => clearTimeout(hide);
  }, [record]);
  useKeepAwake();

  if (!view || view.session.status !== 'active') {
    return <EmptyState title={t('workout.notFoundTitle')} text={t('workout.notFoundText')} />;
  }
  const { exercises } = view;
  const firstUnfinished = exercises.find((entry) => entry.sets.length < entry.plannedSets);
  const current =
    exercises.find((entry) => entry.exercise.id === chosenId) ?? firstUnfinished ?? exercises.at(-1);

  /** A superset is the items of one day with one group number. */
  const groupOf = ({ item }: SessionExerciseView) =>
    item?.superset_group != null ? `${item.program_day_id}:${item.superset_group}` : null;

  const onLogged = (entry: SessionExerciseView) => {
    haptic('done');
    const { nextId, rest_sec } = afterSet(
      exercises.map((other) => ({
        id: other.exercise.id,
        group: groupOf(other),
        // The screen still holds the state from before this set.
        done: other.sets.length + (other === entry ? 1 : 0),
        planned: other.plannedSets,
        rest_sec: other.item?.rest_sec ?? 0,
      })),
      entry.exercise.id,
    );
    setChosenId(nextId);
    startRest(rest_sec, {
      title: t('rest.overTitle'),
      body: t('rest.overBody'),
      channel: t('rest.channel'),
    });
  };

  const finish = () => {
    stopRest();
    mutate((ctx) =>
      finishSession(ctx, view.session.id, facts, {
        smart: hasFeature(null, 'smart_progression'),
      }),
    );
    void syncNow();
    router.replace({ pathname: '/workout/summary/[id]', params: { id: view.session.id } });
  };

  const abandon = () => {
    stopRest();
    mutate((ctx) => abandonSession(ctx, view.session.id));
    router.back();
  };

  return (
    // The fields of a cardio set are typed in: the keyboard must not cover them.
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.list}>
        {exercises.map((entry, index) => {
          const exercise = exerciseById.get(entry.exercise.exercise_id);
          const isCurrent = entry === current;
          const group = groupOf(entry);
          return (
            <Pressable
              key={entry.exercise.id}
              accessibilityRole="button"
              aria-selected={isCurrent}
              onPress={() => setChosenId(entry.exercise.id)}
              style={[
                styles.row,
                isCurrent && { backgroundColor: theme.backgroundElement },
                group !== null && { borderLeftWidth: 3, borderLeftColor: theme.accent },
              ]}>
              <ExerciseNumber number={index + 1} current={isCurrent} />
              <View style={styles.rowText}>
                {group !== null && group !== (exercises[index - 1] && groupOf(exercises[index - 1]!)) && (
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    {t('workout.superset')}
                  </ThemedText>
                )}
                <ThemedText>
                  {exercise?.translations[locale].name ?? t('program.unknownExercise')}
                </ThemedText>
                {entry.sets.length > 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {entry.sets
                      .map((set) =>
                        set.reps !== null
                          ? `${set.weight_kg ? `${weight(set.weight_kg)} × ` : ''}${set.reps}`
                          : formatCardio(t, locale, set),
                      )
                      .join(exercise?.tracking === 'distance_time' ? '; ' : ', ')}
                  </ThemedText>
                )}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {t('workout.progress', { done: entry.sets.length, total: entry.plannedSets })}
              </ThemedText>
              {entry.sets.length >= entry.plannedSets && (
                <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
              )}
            </Pressable>
          );
        })}

        <View style={styles.ending}>
          <Button
            variant={firstUnfinished ? 'secondary' : 'primary'}
            title={t('workout.finish')}
            onPress={finish}
          />
          <ConfirmButton title={t('workout.abandon')} onConfirm={abandon} />
        </View>
      </ScrollView>

      {/* Everything a set needs sits in the lower half of the screen, under one thumb. */}
      <View
        style={[
          styles.panel,
          { borderTopColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.three },
        ]}>
        {record && <RecordBanner text={record.text} />}
        <RestTimer
          aside={
            current && (
              <ExerciseMuscles exercise={exerciseById.get(current.exercise.exercise_id)} />
            )
          }
        />
        {current && (
          <SetEntry
            // A new set starts from its own defaults.
            key={`${current.exercise.id}:${current.exercise.exercise_id}:${current.sets.length}`}
            sessionId={view.session.id}
            entry={current}
            number={exercises.indexOf(current) + 1}
            exercise={exerciseById.get(current.exercise.exercise_id)}
            stepKg={current.item ? (current.item.increment_kg ?? facts(current.exercise.exercise_id, current.item)?.step_kg ?? null) : null}
            onLogged={() => onLogged(current)}
            onRecord={(text) => {
              haptic('record');
              setRecord({ text, at: Date.now() });
            }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** The number of an exercise in the workout, in a circle: which one of the list this is. */
function ExerciseNumber({
  number,
  current,
  large,
}: {
  number: number;
  current: boolean;
  large?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.number,
        large && styles.numberLarge,
        { backgroundColor: current ? theme.accent : theme.backgroundSelected },
      ]}>
      <ThemedText
        type={large ? 'default' : 'small'}
        style={[styles.numberText, { color: current ? theme.onAccent : theme.text }]}>
        {number}
      </ThemedText>
    </View>
  );
}

/** A small body map of an exercise: shown next to the rest count-down, for the set to come. */
function ExerciseMuscles({ exercise }: { exercise: Exercise | undefined }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { muscleByCode } = useCatalog();
  if (!exercise) return null;
  const muscles = (codes: readonly string[]) =>
    codes.flatMap((code) => muscleByCode.get(code) ?? []);
  const primary = muscles(exercise.primary_muscles);
  return (
    <MuscleMap
      primary={primary}
      secondary={muscles(exercise.secondary_muscles)}
      scale={0.25}
      label={t('exercise.mapLabelPrimaryOnly', {
        primary: primary.map((muscle) => muscle.name[locale]).join(', '),
      })}
    />
  );
}

function SetEntry({
  sessionId,
  entry,
  number,
  exercise,
  stepKg,
  onLogged,
  onRecord,
}: {
  sessionId: string;
  entry: SessionExerciseView;
  /** Which exercise of the workout this is, from 1. */
  number: number;
  exercise: Exercise | undefined;
  stepKg: number | null;
  onLogged: () => void;
  /** A set beat everything before it: the text to celebrate it with. */
  onRecord: (text: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { exerciseById } = useCatalog();
  const { item, plan, sets } = entry;
  const last = useLocal((ctx) => lastPerformance(ctx, entry.exercise.exercise_id, sessionId));
  const units = useUnits();
  const kg = useWeightFormat();

  const tracking = exercise?.tracking ?? 'weight_reps';
  const setIndex = sets.length;
  const previous = sets.at(-1);
  const lastSame = last[setIndex] ?? last.at(-1);
  const replaced = item !== null && entry.exercise.exercise_id !== item.exercise_id;

  // The weight to start from. For a replacement: its own history, else the weight of the
  // planned exercise through the ratio of the hand-made link, else nothing ("find the weight").
  const link = replaced
    ? exerciseById.get(item.exercise_id)?.alternatives.find((alt) => alt.slug === exercise?.slug)
    : undefined;
  const swapped = replaced
    ? substitutedWeight({
        historyWeightKg: lastSame?.weight_kg ?? null,
        currentWeightKg: plan?.next_weight_kg ?? null,
        weightRatio: link?.weight_ratio ?? null,
        stepKg: stepKg ?? 0,
      })
    : null;
  const plannedWeight = swapped
    ? swapped.kind === 'find'
      ? null
      : swapped.weightKg
    : (plan?.next_weight_kg ?? lastSame?.weight_kg ?? null);
  // A new or lighter weight starts from the bottom of the range; otherwise from last time.
  const freshWeight = plan?.reason_code === 'increase' || plan?.reason_code === 'increase_fast' || plan?.reason_code === 'reduced';
  const plannedReps = freshWeight ? item?.rep_min : (lastSame?.reps ?? item?.rep_min);

  const [weight, setWeight] = useState(previous?.weight_kg ?? plannedWeight ?? 0);
  const [reps, setReps] = useState(previous?.reps ?? plannedReps ?? item?.rep_min ?? 10);
  const [rir, setRir] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(previous?.duration_sec ?? item?.rep_min ?? 30);

  const tap = <T,>(set: (value: T) => void) => (value: T) => {
    haptic('tap');
    set(value);
  };
  const loaded = tracking === 'weight_reps' && stepKg !== null;

  const save = () => {
    const planned = {
      planned_weight_kg: loaded ? plannedWeight : null,
      planned_rep_min: item?.rep_min ?? null,
      planned_rep_max: item?.rep_max ?? null,
    };
    const done =
      tracking === 'time'
        ? { duration_sec: seconds }
        : // A weight left at zero means it was not entered: the set counts by reps alone.
          { weight_kg: loaded && weight > 0 ? weight : null, reps, rir };
    // The set is in the database before the screen moves on; its records are checked before
    // it is saved, so it is not compared with itself.
    const records = mutate((ctx) => {
      const found = recordsOfSet(ctx, entry.exercise.id, done);
      logSet(ctx, entry.exercise.id, { ...planned, ...done });
      return found;
    });
    onLogged();
    celebrate(records);
  };

  /** "Record! 85 kg × 8", "Record! 5,1 km, 30 min" – one line however many records it is. */
  const celebrate = ({ weight, cardio }: SetRecords) => {
    // A new top weight says more than a new estimated maximum with it.
    const lifted = weight.find((record) => record.kind !== 'e1rm') ?? weight[0];
    const parts = [
      lifted
        ? lifted.kind === 'e1rm'
          ? t('workout.recordE1rm')
          : `${kg(lifted.weight_kg)} × ${lifted.reps}`
        : null,
      ...cardio.map((found) =>
        found.kind === 'distance' ? formatDistance(t, locale, found.value) : formatDuration(t, found.value),
      ),
    ].filter(Boolean);
    if (parts.length > 0) onRecord(t('workout.recordSet', { records: parts.join(', ') }));
  };

  const range = item ? formatRange(item.rep_min, item.rep_max) : '';
  const beyond = setIndex >= entry.plannedSets;

  return (
    <View style={styles.entry}>
      <View style={styles.header}>
        <ExerciseNumber number={number} current large />
        <View style={styles.headerText}>
          <ThemedText type="small" themeColor="textSecondary">
            {beyond
              ? t('workout.extraSet', { number: setIndex + 1 })
              : t('workout.set', { number: setIndex + 1, total: entry.plannedSets })}
            {replaced ? ` · ${t('workout.replaced')}` : ''}
          </ThemedText>
          <ThemedText style={styles.name} numberOfLines={2}>
            {exercise?.translations[locale].name ?? t('program.unknownExercise')}
          </ThemedText>
          {(tracking === 'weight_reps' || tracking === 'reps') && (
            <ThemedText style={styles.plan}>
              {loaded && plannedWeight !== null
                ? t('workout.plan', { weight: kg(plannedWeight), range })
                : t('workout.planNoWeight', { range })}
            </ThemedText>
          )}
          {loaded && plannedWeight === null && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('workout.findWeight')}
            </ThemedText>
          )}
          {last.length > 0 && tracking !== 'time' && tracking !== 'distance_time' && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('workout.lastTime', {
                sets: `${last[0]?.weight_kg ? `${kg(last[0].weight_kg)} × ` : ''}${last.map((set) => set.reps).join(', ')}`,
              })}
            </ThemedText>
          )}
          {plan && !replaced && setIndex === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {explainPlan(t, locale, plan, units)}
            </ThemedText>
          )}
        </View>
      </View>

      {tracking === 'time' && (
        <Stepper label={t('workout.seconds')} value={seconds} min={5} max={3600} step={5} onChange={tap(setSeconds)} />
      )}
      {tracking === 'distance_time' && (
        <CardioSet
          watchKey={entry.exercise.id}
          exercise={exercise}
          plannedMinutes={item?.rep_min ?? null}
          previous={previous}
          last={setIndex === 0 ? last : []}
          onSave={(values) => {
            const records = mutate((ctx) => {
              const found = recordsOfSet(ctx, entry.exercise.id, values);
              logSet(ctx, entry.exercise.id, {
                planned_rep_min: item?.rep_min ?? null,
                planned_rep_max: item?.rep_max ?? null,
                ...values,
              });
              return found;
            });
            onLogged();
            celebrate(records);
          }}
        />
      )}
      {(tracking === 'weight_reps' || tracking === 'reps') && (
        <>
          {loaded && (
            <Stepper
              label={t('workout.weight')}
              value={weight}
              text={kg(weight)}
              min={0}
              max={1000}
              step={stepKg}
              onChange={tap(setWeight)}
              typed={{
                value: Math.round(toUnits(weight, units) * 100) / 100,
                apply: (typed) => setWeight(Math.min(1000, Math.max(0, fromUnits(typed, units)))),
              }}
            />
          )}
          <Stepper label={t('workout.reps')} value={reps} min={0} max={200} onChange={tap(setReps)} />
          <View style={styles.rir} accessibilityLabel={t('workout.rir')}>
            <ThemedText type="small" themeColor="textSecondary">
              RIR
            </ThemedText>
            {RIR_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={option === 4 ? t('item.rirMore') : String(option)}
                selected={rir === option}
                onPress={() => tap(setRir)(rir === option ? null : option)}
              />
            ))}
          </View>
        </>
      )}

      {/* A cardio set has its own "done", under its stopwatch. */}
      {tracking !== 'distance_time' && (
        <View style={styles.buttons}>
          {lastSame && (tracking === 'weight_reps' || tracking === 'reps') && (
            <Button
              variant="secondary"
              title={t('workout.likeLastTime')}
              onPress={() => {
                haptic('tap');
                if (lastSame.weight_kg !== null) setWeight(lastSame.weight_kg);
                if (lastSame.reps !== null) setReps(lastSame.reps);
                setRir(lastSame.rir);
              }}
            />
          )}
          <View style={styles.done}>
            <Button title={t('workout.done')} onPress={save} />
          </View>
        </View>
      )}

      <View style={styles.links}>
        {exercise && exercise.equipment.length > 0 && sets.length === 0 && (
          <Button
            variant="secondary"
            title={t('workout.busy')}
            onPress={() =>
              router.push({ pathname: '/workout/replace/[id]', params: { id: entry.exercise.id } })
            }
          />
        )}
        {sets.length > 0 && (
          <Button
            variant="secondary"
            title={t('workout.undo')}
            onPress={() => mutate((ctx) => removeLastSet(ctx, entry.exercise.id))}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  list: {
    padding: Spacing.two,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
  ending: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  panel: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  entry: {
    gap: Spacing.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberLarge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginTop: Spacing.three,
  },
  numberText: {
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  name: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: 600,
  },
  plan: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: 700,
  },
  rir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  done: {
    flex: 1,
  },
  links: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
