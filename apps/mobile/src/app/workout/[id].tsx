import { hasFeature, substitutedWeight } from '@mvp/domain';
import type { Exercise } from '@mvp/schemas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ExerciseSets, type SetHint } from '@/components/exercise-sets';
import { FreeWorkout } from '@/components/free-workout';
import { MuscleMap } from '@/components/muscle-map';
import { RecordBanner } from '@/components/record-banner';
import { RestTimer } from '@/components/rest-timer';
import { ThemedText } from '@/components/themed-text';
import { ConfirmButton } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { afterSet } from '@/data/flow';
import {
  abandonSession,
  finishSession,
  getSession,
  lastPerformance,
  logSet,
  recordsOfSet,
  type SessionExerciseView,
  type SetRecords,
  type SetValues,
} from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { ThemeOverride, useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { haptic } from '@/lib/feedback';
import { formatRange } from '@/lib/format';
import { useScreenAwake } from '@/lib/keep-awake';
import { mutate, useLocal } from '@/lib/local';
import { useRestTimer } from '@/lib/rest-timer';
import { syncNow } from '@/lib/sync';
import { useUnits, useWeightFormat } from '@/lib/units';
import { explainPlan, useExerciseFacts, useRecordText } from '@/lib/workout';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { exerciseById } = useCatalog();
  const facts = useExerciseFacts();
  const startRest = useRestTimer((state) => state.start);
  const stopRest = useRestTimer((state) => state.stop);
  const resting = useRestTimer((state) => state.endsAt !== null);
  const view = useLocal((ctx) => getSession(ctx, id));
  const scroll = useRef<ScrollViewInstance>(null);
  const positions = useRef(new Map<string, number>());
  // A workout picked up again opens on the exercise it stopped at, once.
  const opened = useRef(false);
  // Where the last set led; otherwise the workout leads on by itself.
  const [chosenId, setChosenId] = useState<string | null>(null);
  // A record just set: shown over the next set for a few seconds.
  const [record, setRecord] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!record) return;
    const hide = setTimeout(() => setRecord(null), 4000);
    return () => clearTimeout(hide);
  }, [record]);
  useScreenAwake();

  if (!view || view.session.status !== 'active') {
    return <EmptyState title={t('workout.notFoundTitle')} text={t('workout.notFoundText')} />;
  }
  if (view.session.program_id === null) return <FreeWorkout view={view} />;
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
    if (nextId && nextId !== entry.exercise.id) {
      const y = positions.current.get(nextId);
      if (y !== undefined) scroll.current?.scrollTo({ y, animated: true });
    }
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
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* The fields of a set are typed in: the keyboard must not cover them. Only the list makes
          way for it: the panel under it stays where it is. */}
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}>
          {exercises.map((entry, index) => {
            const group = groupOf(entry);
            return (
              <View
                key={entry.exercise.id}
                onLayout={({ nativeEvent }) => {
                  positions.current.set(entry.exercise.id, nativeEvent.layout.y);
                  if (entry === current && !opened.current) {
                    opened.current = true;
                    scroll.current?.scrollTo({ y: nativeEvent.layout.y, animated: false });
                  }
                }}
                style={[
                  styles.exercise,
                  group !== null && { borderLeftWidth: 3, borderLeftColor: theme.accent },
                ]}>
                {group !== null && group !== (exercises[index - 1] && groupOf(exercises[index - 1]!)) && (
                  <ThemedText type="smallBold" style={[styles.superset, { color: theme.accent }]}>
                    {t('workout.superset')}
                  </ThemedText>
                )}
                <ExerciseCard
                  sessionId={view.session.id}
                  entry={entry}
                  number={index + 1}
                  current={entry === current}
                  exercise={exerciseById.get(entry.exercise.exercise_id)}
                  stepKg={entry.item ? (entry.item.increment_kg ?? facts(entry.exercise.exercise_id, entry.item)?.step_kg ?? null) : null}
                  onLogged={() => onLogged(entry)}
                  onRecord={(text) => {
                    haptic('record');
                    setRecord({ text, at: Date.now() });
                  }}
                />
              </View>
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
      </KeyboardAvoidingView>

      {(record !== null || resting) && (
        <View
          style={[
            styles.panel,
            { borderTopColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          {record && <RecordBanner text={record.text} />}
          <RestTimer
            aside={
              current && (
                <ExerciseMuscles exercise={exerciseById.get(current.exercise.exercise_id)} />
              )
            }
          />
        </View>
      )}
    </View>
  );
}

/** The number of an exercise in the workout, in a circle: which one of the list this is. */
function ExerciseNumber({ number, current }: { number: number; current: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.number,
        { backgroundColor: current ? theme.accent : theme.backgroundSelected },
      ]}>
      <ThemedText
        type="small"
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

/** An exercise by the program: the table of sets of any workout, filled in from the plan. */
function ExerciseCard({
  sessionId,
  entry,
  number,
  current,
  exercise,
  stepKg,
  onLogged,
  onRecord,
}: {
  sessionId: string;
  entry: SessionExerciseView;
  /** Which exercise of the workout this is, from 1. */
  number: number;
  /** The workout is at this exercise. */
  current: boolean;
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
  const recordText = useRecordText();
  const [rir, setRir] = useState<number | null>(null);

  const tracking = exercise?.tracking ?? 'weight_reps';
  const replaced = item !== null && entry.exercise.exercise_id !== item.exercise_id;
  const loaded = tracking === 'weight_reps' && stepKg !== null;
  const counted = tracking === 'weight_reps' || tracking === 'reps';

  // A new or lighter weight starts from the bottom of the range; otherwise from last time.
  const freshWeight = plan?.reason_code === 'increase' || plan?.reason_code === 'increase_fast' || plan?.reason_code === 'reduced';

  /** What a set is planned with. */
  const plannedOf = (setIndex: number): SetHint => {
    const lastSame = last[setIndex] ?? last.at(-1);
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
    return {
      weight_kg: swapped
        ? swapped.kind === 'find'
          ? null
          : swapped.weightKg
        : (plan?.next_weight_kg ?? lastSame?.weight_kg ?? null),
      reps: (freshWeight ? null : lastSame?.reps) ?? item?.rep_min ?? 10,
      duration_sec: item?.rep_min ?? 30,
    };
  };

  const hintOf = (index: number): SetHint => {
    const previous = sets[index - 1];
    const planned = plannedOf(index);
    return {
      weight_kg: previous?.weight_kg ?? planned.weight_kg,
      reps: previous?.reps ?? planned.reps,
      duration_sec: previous?.duration_sec ?? planned.duration_sec,
    };
  };

  const plannedWeight = plannedOf(sets.length).weight_kg;

  const save = (values: SetValues) => {
    const done = { ...values, ...(counted ? { rir } : {}) };
    // The set is in the database before the screen moves on; its records are checked before
    // it is saved, so it is not compared with itself.
    const records: SetRecords = mutate((ctx) => {
      const found = recordsOfSet(ctx, entry.exercise.id, done);
      logSet(ctx, entry.exercise.id, {
        planned_weight_kg: loaded ? plannedWeight : null,
        planned_rep_min: item?.rep_min ?? null,
        planned_rep_max: item?.rep_max ?? null,
        ...done,
      });
      return found;
    });
    setRir(null);
    onLogged();
    const text = recordText(records);
    if (text) onRecord(text);
  };

  const range = item ? formatRange(item.rep_min, item.rep_max) : '';

  return (
    <ExerciseSets
      entry={entry}
      exercise={exercise}
      weighted={loaded}
      last={last}
      hintOf={hintOf}
      plannedMinutes={item?.rep_min ?? null}
      leading={<ExerciseNumber number={number} current={current} />}
      details={
        <View>
          {replaced && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('workout.replaced')}
            </ThemedText>
          )}
          {counted && (
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
          {plan && !replaced && sets.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {explainPlan(t, locale, plan, units)}
            </ThemedText>
          )}
        </View>
      }
      footer={
        <>
          {counted && sets.length < entry.plannedSets && (
            <View style={styles.rir} accessibilityLabel={t('workout.rir')}>
              <ThemedText type="small" themeColor="textSecondary">
                RIR
              </ThemedText>
              {RIR_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  label={option === 4 ? t('item.rirMore') : String(option)}
                  selected={rir === option}
                  onPress={() => {
                    haptic('tap');
                    setRir(rir === option ? null : option);
                  }}
                />
              ))}
            </View>
          )}
          {exercise && exercise.equipment.length > 0 && sets.length === 0 && (
            <Button
              variant="secondary"
              title={t('workout.busy')}
              onPress={() =>
                router.push({ pathname: '/workout/replace/[id]', params: { id: entry.exercise.id } })
              }
            />
          )}
        </>
      }
      onSave={save}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  keyboard: {
    flex: 1,
  },
  list: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  exercise: {
    gap: Spacing.one,
    borderRadius: Radius.card,
  },
  superset: {
    paddingLeft: Spacing.two,
  },
  ending: {
    gap: Spacing.two,
  },
  panel: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  plan: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
  rir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
});
