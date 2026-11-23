import Ionicons from '@expo/vector-icons/Ionicons';
import { parseNumber } from '@mvp/domain';
import type { Exercise, SetLogRow } from '@mvp/schemas';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { type CardioValues, CardioSet } from '@/components/cardio-set';
import { ThemedText } from '@/components/themed-text';
import { Stepper, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import {
  removeLastSet,
  type SessionExerciseView,
  setPlannedSets,
  type SetValues,
  updateSet,
} from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/feedback';
import { formatCardio, formatNumber } from '@/lib/format';
import { mutate } from '@/lib/local';
import { fromUnits, toUnits, useUnits, useWeightFormat } from '@/lib/units';

/** The most sets an exercise can be planned with. */
const MAX_SETS = 20;

/** What a set needs written down. */
const LIMITS = { weightKg: 1000, reps: 200, seconds: 3600 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** What the fields of a set suggest. */
export type SetHint = Pick<SetLogRow, 'weight_kg' | 'reps' | 'duration_sec'>;

/** An exercise of a workout as a card with a table of sets, the same with a program or without. */
export function ExerciseSets({
  entry,
  exercise,
  weighted,
  last,
  hintOf,
  plannedMinutes,
  leading,
  trailing,
  details,
  footer,
  onSave,
}: {
  entry: SessionExerciseView;
  exercise: Exercise | undefined;
  /** The sets take a weight. */
  weighted: boolean;
  /** The sets of the exercise the last time. */
  last: readonly SetLogRow[];
  /** What the fields of a set suggest, by its index from 0. */
  hintOf: (index: number) => SetHint | undefined;
  plannedMinutes: number | null;
  /** Before the name of the exercise. */
  leading?: ReactNode;
  /** After the name of the exercise. */
  trailing?: ReactNode;
  /** Under the name of the exercise. */
  details?: ReactNode;
  /** Under the table. */
  footer?: ReactNode;
  onSave: (values: SetValues) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const units = useUnits();
  const { exercise: row, sets, plannedSets } = entry;

  const tracking = exercise?.tracking ?? 'weight_reps';
  const unit = t(units === 'lb' ? 'units.lb' : 'units.kg', { value: '' }).trim();
  const rows = Math.max(plannedSets, sets.length);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardHeader}>
        {leading}
        <ThemedText style={styles.name} numberOfLines={2}>
          {exercise?.translations[locale].name ?? t('program.unknownExercise')}
        </ThemedText>
        {trailing}
      </View>
      {details}

      <Stepper
        label={t('workout.plannedSets')}
        value={plannedSets}
        min={Math.max(1, sets.length)}
        max={MAX_SETS}
        onChange={(count) => {
          haptic('tap');
          mutate((ctx) => setPlannedSets(ctx, row.id, count));
        }}
      />

      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.number}>
          {t('workout.setNumber')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.last}>
          {t('workout.lastColumn')}
        </ThemedText>
        {weighted && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.column}>
            {unit}
          </ThemedText>
        )}
        {tracking !== 'distance_time' && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.column}>
            {t(tracking === 'time' ? 'workout.secondsColumn' : 'workout.repsColumn')}
          </ThemedText>
        )}
        <View style={styles.tickSpace} />
      </View>

      {Array.from({ length: rows }, (_, index) => {
        const done = sets[index];
        return (
          <SetRow
            // A new set starts from its own hints.
            key={`${index}:${sets.length}`}
            number={index + 1}
            tracking={tracking}
            weighted={weighted}
            done={done}
            current={index === sets.length}
            canUndo={index === sets.length - 1}
            before={last[index]}
            hint={hintOf(index)}
            onSave={onSave}
            onEdit={(values) => {
              if (done) mutate((ctx) => updateSet(ctx, done.id, values));
            }}
            onUndo={() => mutate((ctx) => removeLastSet(ctx, row.id))}
          />
        );
      })}

      {tracking === 'distance_time' && sets.length < rows && (
        <CardioSet
          key={sets.length}
          watchKey={row.id}
          exercise={exercise}
          plannedMinutes={plannedMinutes}
          previous={sets.at(-1)}
          last={sets.length === 0 ? last : []}
          onSave={(values: CardioValues) => onSave(values)}
        />
      )}
      {footer}
    </View>
  );
}

function SetRow({
  number,
  tracking,
  weighted,
  done,
  current,
  canUndo,
  before,
  hint,
  onSave,
  onEdit,
  onUndo,
}: {
  number: number;
  tracking: Exercise['tracking'];
  weighted: boolean;
  done: SetLogRow | undefined;
  /** This is the next set to do: only it can be filled in. */
  current: boolean;
  /** This is the last set done: only it can be taken back. */
  canUndo: boolean;
  /** The same set the last time. */
  before: SetLogRow | undefined;
  /** What the fields suggest. */
  hint: SetHint | undefined;
  onSave: (values: SetValues) => void;
  /** A set already done was corrected. */
  onEdit: (values: Pick<SetValues, 'weight_kg' | 'reps' | 'duration_sec'>) => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const locale = useLocale();
  const units = useUnits();
  const kg = useWeightFormat();
  const inUnits = (kilos: number) => Math.round(toUnits(kilos, units) * 100) / 100;
  const [weight, setWeight] = useState(() =>
    done?.weight_kg != null ? formatNumber(inUnits(done.weight_kg), locale) : '',
  );
  const [count, setCount] = useState(() => {
    const doneCount = tracking === 'time' ? done?.duration_sec : done?.reps;
    return doneCount != null ? String(doneCount) : '';
  });

  const shown =(set: SetLogRow | undefined) => {
    if (!set) return '–';
    if (set.reps !== null) return `${set.weight_kg ? `${kg(set.weight_kg)} × ` : ''}${set.reps}`;
    return formatCardio(t, locale, set);
  };

  // What an empty field shows: a set already done keeps what is stored for it.
  const suggested = done ?? hint;
  const hintWeight = suggested?.weight_kg != null ? inUnits(suggested.weight_kg) : null;
  const hintCount =
    tracking === 'time' ? (suggested?.duration_sec ?? null) : (suggested?.reps ?? null);

  // A field left empty takes what it suggests: one tap repeats the set before.
  const typedCount = parseNumber(count) ?? hintCount;
  const canSave = current && typedCount !== null && typedCount >= 1;

  const save = () => {
    if (!canSave) return;
    if (tracking === 'time') {
      onSave({ duration_sec: clamp(Math.round(typedCount), 1, LIMITS.seconds) });
      return;
    }
    const entered = parseNumber(weight);
    // The hint is stored as it was: through the units and back it would drift.
    const kilos = entered !== null ? fromUnits(entered, units) : (hint?.weight_kg ?? 0);
    onSave({
      // A weight left at zero means it was not entered: the set counts by reps alone.
      weight_kg: weighted && kilos > 0 ? clamp(kilos, 0, LIMITS.weightKg) : null,
      reps: clamp(Math.round(typedCount), 1, LIMITS.reps),
    });
  };

  // A set already done changes as it is typed: there is nothing more to press, and a field
  // still open when the workout is finished loses nothing.
  const changeWeight = (text: string) => {
    setWeight(text);
    if (!done) return;
    const entered = parseNumber(text);
    if (entered === null && text.trim() !== '') return;
    const kilos = entered !== null ? fromUnits(entered, units) : 0;
    onEdit({ weight_kg: kilos > 0 ? clamp(kilos, 0, LIMITS.weightKg) : null });
  };

  const changeCount = (text: string) => {
    setCount(text);
    const entered = parseNumber(text);
    if (!done || entered === null || entered < 1) return;
    onEdit(
      tracking === 'time'
        ? { duration_sec: clamp(Math.round(entered), 1, LIMITS.seconds) }
        : { reps: clamp(Math.round(entered), 1, LIMITS.reps) },
    );
  };

  const field = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    placeholder: number | null,
    keyboardType: 'decimal-pad' | 'number-pad',
  ) => (
    <TextField
      label={t('workout.setField', { field: label, number })}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder === null ? '–' : formatNumber(placeholder, locale)}
      keyboardType={keyboardType}
      returnKeyType="done"
      selectTextOnFocus
      style={[styles.field, styles.column, { backgroundColor: theme.backgroundSelected }]}
    />
  );

  const value = (text: string | number | null) => (
    <ThemedText
      style={[styles.value, styles.column, { color: theme.textSecondary }]}
      numberOfLines={1}>
      {text ?? '–'}
    </ThemedText>
  );

  // A cardio set is written under the table: a row only shows how it went.
  const cardio = tracking === 'distance_time';
  const fields = cardio ? null : current || done ? (
    <>
      {weighted && field(t('workout.weight'), weight, changeWeight, hintWeight, 'decimal-pad')}
      {field(
        t(tracking === 'time' ? 'workout.seconds' : 'workout.reps'),
        count,
        changeCount,
        hintCount,
        'number-pad',
      )}
    </>
  ) : (
    <>
      {weighted && value(hintWeight !== null ? formatNumber(hintWeight, locale) : null)}
      {value(hintCount)}
    </>
  );

  const marked = done !== undefined;
  const enabled = marked ? canUndo : canSave && !cardio;
  return (
    <View style={styles.row}>
      <ThemedText style={styles.number}>{number}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.last} numberOfLines={2}>
        {cardio && done ? formatCardio(t, locale, done) : shown(before)}
      </ThemedText>
      {fields}
      <Pressable
        accessibilityRole="checkbox"
        aria-checked={marked}
        accessibilityLabel={t(marked ? 'workout.unmarkSet' : 'workout.markSet', { number })}
        disabled={!enabled}
        hitSlop={Spacing.one}
        onPress={marked ? onUndo : save}
        style={[
          styles.tick,
          {
            backgroundColor: marked ? theme.accent : theme.backgroundSelected,
            opacity: enabled || marked ? 1 : 0.5,
          },
        ]}>
        {marked && <Ionicons name="checkmark" size={20} color={theme.onAccent} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
  },
  number: {
    width: 20,
    fontVariant: ['tabular-nums'],
  },
  last: {
    flex: 1,
  },
  column: {
    width: 60,
    textAlign: 'center',
  },
  field: {
    height: 40,
    minHeight: 40,
    paddingVertical: 0,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
  tick: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickSpace: {
    width: 36,
  },
});
