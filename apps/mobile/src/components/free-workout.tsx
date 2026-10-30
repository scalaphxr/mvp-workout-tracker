import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ExerciseSets } from '@/components/exercise-sets';
import { RecordBanner } from '@/components/record-banner';
import { RestTimer } from '@/components/rest-timer';
import { ThemedText } from '@/components/themed-text';
import { ConfirmButton } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  abandonSession,
  finishSession,
  lastPerformance,
  logSet,
  recordsOfSet,
  removeFreeExercise,
  type SessionExerciseView,
  type SessionView,
  type SetRecords,
  type SetValues,
} from '@/data/sessions';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { haptic } from '@/lib/feedback';
import { useFreeWorkoutFocus } from '@/lib/free-workout';
import { itemDefaults } from '@/lib/item-defaults';
import { mutate, useLocal } from '@/lib/local';
import { useRestTimer } from '@/lib/rest-timer';
import { syncNow } from '@/lib/sync';
import { useRecordText } from '@/lib/workout';

/** The workout without a program: the exercises the user picked, each with a table of sets. */
export function FreeWorkout({ view }: { view: SessionView }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stopRest = useRestTimer((state) => state.stop);
  const resting = useRestTimer((state) => state.endsAt !== null);
  const focusId = useFreeWorkoutFocus((state) => state.id);
  const clearFocus = useFreeWorkoutFocus((state) => state.set);
  const scroll = useRef<ScrollViewInstance>(null);
  const positions = useRef(new Map<string, number>());
  // A record just set: shown for a few seconds.
  const [record, setRecord] = useState<string | null>(null);
  useEffect(() => {
    if (!record) return;
    const hide = setTimeout(() => setRecord(null), 4000);
    return () => clearTimeout(hide);
  }, [record]);

  const showCard = (id: string) => {
    const y = positions.current.get(id);
    if (y === undefined) return;
    scroll.current?.scrollTo({ y, animated: true });
    clearFocus(null);
  };
  // A card that was already there; a new one is shown once it has been laid out.
  useEffect(() => {
    if (focusId) showCard(focusId);
  });

  const { session, exercises } = view;

  const finish = () => {
    stopRest();
    // Nothing was done: there is no workout to keep, and it must not count for the streak.
    if (!exercises.some((entry) => entry.sets.length > 0)) {
      mutate((ctx) => abandonSession(ctx, session.id));
      router.back();
      return;
    }
    // The facts are for planning by a program, and this workout has none.
    mutate((ctx) => finishSession(ctx, session.id, () => null, { smart: false }));
    void syncNow();
    router.replace({ pathname: '/workout/summary/[id]', params: { id: session.id } });
  };

  const abandon = () => {
    stopRest();
    mutate((ctx) => abandonSession(ctx, session.id));
    router.back();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Only the list makes way for the keyboard: the panel under it stays where it is. */}
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.four }]}>
          <ThemedText style={styles.title}>{t('workout.freeTitle')}</ThemedText>
          {exercises.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {t('workout.freeEmpty')}
            </ThemedText>
          )}
          {exercises.map((entry) => (
            <View
              key={entry.exercise.id}
              onLayout={({ nativeEvent }) => {
                positions.current.set(entry.exercise.id, nativeEvent.layout.y);
                if (focusId === entry.exercise.id) showCard(entry.exercise.id);
              }}>
              <ExerciseCard sessionId={session.id} entry={entry} onRecord={setRecord} />
            </View>
          ))}
          <View style={styles.ending}>
            <Button
              title={t('workout.addExercise')}
              onPress={() =>
                router.push({ pathname: '/exercise-picker', params: { sessionId: session.id } })
              }
            />
            <Button variant="secondary" title={t('workout.finish')} onPress={finish} />
            <ConfirmButton title={t('workout.abandonFree')} onConfirm={abandon} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {(record !== null || resting) && (
        <View
          style={[
            styles.panel,
            { borderTopColor: theme.backgroundElement, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          {record && <RecordBanner text={record} />}
          <RestTimer />
        </View>
      )}
    </View>
  );
}

function ExerciseCard({
  sessionId,
  entry,
  onRecord,
}: {
  sessionId: string;
  entry: SessionExerciseView;
  onRecord: (text: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { exerciseById } = useCatalog();
  const startRest = useRestTimer((state) => state.start);
  const recordText = useRecordText();
  const { exercise: row, sets } = entry;
  const exercise = exerciseById.get(row.exercise_id);
  const last = useLocal((ctx) => lastPerformance(ctx, row.exercise_id, sessionId));

  /** The set is in the database before the screen moves on, and checked for records first. */
  const save = (values: SetValues) => {
    haptic('done');
    const records: SetRecords = mutate((ctx) => {
      const found = recordsOfSet(ctx, row.id, values);
      logSet(ctx, row.id, values);
      return found;
    });
    const text = recordText(records);
    if (text) {
      haptic('record');
      onRecord(text);
    }
    if (exercise) {
      startRest(itemDefaults(exercise, null).rest_sec, {
        title: t('rest.overTitle'),
        body: t('rest.overBody'),
        channel: t('rest.channel'),
      });
    }
  };

  return (
    <ExerciseSets
      entry={entry}
      exercise={exercise}
      weighted={(exercise?.tracking ?? 'weight_reps') === 'weight_reps'}
      last={last}
      // The set before this one, else the same set the last time.
      hintOf={(index) => sets[index - 1] ?? last[index]}
      plannedMinutes={null}
      trailing={
        sets.length === 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.removeExercise')}
            hitSlop={Spacing.two}
            onPress={() => mutate((ctx) => removeFreeExercise(ctx, row.id))}>
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        )
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
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
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
});
