import {
  CARDIO_LIMITS,
  type CardioField,
  cardioFields,
  formatClock,
  parseDuration,
  parseNumber,
} from '@mvp/domain';
import type { Exercise, SetLogRow } from '@mvp/schemas';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/feedback';
import { formatCardio } from '@/lib/format';
import { useStopwatch, watchSeconds } from '@/lib/stopwatch';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { TextField } from './ui';

export type CardioValues = Pick<SetLogRow, 'duration_sec' | CardioField>;

/** A field in the unit it is typed in: kilometres for a distance stored in metres. */
const typed = (field: CardioField, value: number | null) =>
  value === null ? '' : String(field === 'distance_m' ? Math.round(value) / 1000 : value);

const stored = (field: CardioField, value: number) =>
  field === 'distance_m'
    ? Math.round(value * 1000)
    : field === 'avg_hr' || field === 'calories'
      ? Math.round(value)
      : value;

/**
 * A cardio set: a stopwatch, or the time typed by hand, and the numbers the machine shows –
 * only those this machine has (spec, screen "Cardio exercise").
 */
export function CardioSet({
  watchKey,
  exercise,
  plannedMinutes,
  previous,
  last,
  onSave,
}: {
  /** The exercise of the workout: the stopwatch belongs to it. */
  watchKey: string;
  exercise: Exercise | undefined;
  plannedMinutes: number | null;
  /** The set before this one in the same workout: the machine is usually set the same way. */
  previous: SetLogRow | undefined;
  /** What was done in this exercise the last time. */
  last: readonly SetLogRow[];
  onSave: (values: CardioValues) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const theme = useTheme();
  const fields = cardioFields(exercise?.equipment ?? []);
  const watch = useStopwatch((state) => state.watches[watchKey]);
  const { start, stop, reset } = useStopwatch();
  const [now, setNow] = useState(() => Date.now());
  const [time, setTime] = useState(plannedMinutes ? String(plannedMinutes) : '');
  const [values, setValues] = useState<Record<CardioField, string>>(() => {
    const entries = fields.map((field) => [field, typed(field, previous?.[field] ?? null)]);
    return Object.fromEntries(entries) as Record<CardioField, string>;
  });
  const [error, setError] = useState<string | null>(null);

  const running = watch?.startedAt != null;
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running]);
  const seconds = watchSeconds(watch, now);

  const toggle = () => {
    haptic('tap');
    if (running) {
      setTime(formatClock(stop(watchKey)));
    } else {
      start(watchKey);
      setNow(Date.now());
    }
  };

  const save = () => {
    // A running watch is stopped by "done": the set took as long as it shows.
    const duration = running ? stop(watchKey) : parseDuration(time);
    if (!duration) {
      setError(t('cardio.invalidTime'));
      return;
    }
    const result: CardioValues = {
      duration_sec: duration,
      distance_m: null,
      speed_kmh: null,
      incline_pct: null,
      resistance_level: null,
      avg_hr: null,
      calories: null,
    };
    for (const field of fields) {
      const text = values[field].trim();
      if (text === '') continue;
      const number = parseNumber(text);
      const { min, max } = CARDIO_LIMITS[field];
      const value = number === null ? null : stored(field, number);
      if (value === null || value < min || value > max) {
        setError(t('cardio.invalidField', { field: t(`cardio.fields.${field}`) }));
        return;
      }
      result[field] = value;
    }
    setError(null);
    reset(watchKey);
    onSave(result);
  };

  return (
    <View style={styles.cardio}>
      {last.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('workout.lastTime', {
            sets: last.map((set) => formatCardio(t, locale, set)).join('; '),
          })}
        </ThemedText>
      )}

      <View style={[styles.watch, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText
          style={styles.clock}
          accessibilityRole="timer"
          accessibilityLabel={`${t('cardio.stopwatch')}: ${formatClock(seconds)}`}>
          {formatClock(seconds)}
        </ThemedText>
        <View style={styles.watchButtons}>
          {!running && seconds > 0 && (
            <Button variant="secondary" title={t('cardio.reset')} onPress={() => reset(watchKey)} />
          )}
          <Button
            variant={running ? 'secondary' : 'primary'}
            title={running ? t('cardio.stop') : t('cardio.start')}
            onPress={toggle}
          />
        </View>
      </View>

      <View style={styles.grid}>
        <Field label={t('cardio.time')}>
          <TextField
            label={t('cardio.time')}
            value={running ? formatClock(seconds) : time}
            editable={!running}
            placeholder={t('cardio.timePlaceholder')}
            keyboardType="numbers-and-punctuation"
            onChangeText={setTime}
          />
        </Field>
        {fields.map((field) => (
          <Field key={field} label={t(`cardio.fields.${field}`)}>
            <TextField
              label={t(`cardio.fields.${field}`)}
              value={values[field]}
              keyboardType={field === 'incline_pct' ? 'numbers-and-punctuation' : 'decimal-pad'}
              onChangeText={(text) => setValues((current) => ({ ...current, [field]: text }))}
            />
          </Field>
        ))}
      </View>

      {error && (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      )}
      <Button title={t('workout.done')} onPress={save} />
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cardio: {
    gap: Spacing.two,
  },
  watch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.two,
    paddingLeft: Spacing.three,
    borderRadius: Radius.card,
  },
  clock: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
  watchButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  field: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: Spacing.half,
  },
});
