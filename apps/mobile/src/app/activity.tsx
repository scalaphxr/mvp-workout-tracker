import {
  ACTIVITY_TYPES,
  CARDIO_LIMITS,
  formatClock,
  isKnownActivity,
  parseDuration,
  parseNumber,
} from '@mvp/domain';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ConfirmButton, Group, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { deleteActivity, getActivity, saveActivity } from '@/data/activities';
import { useLocale } from '@/hooks/use-locale';
import { activityName, toLocalDate } from '@/lib/format';
import { mutate, useLocal } from '@/lib/local';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ['today', 'yesterday', 'dayBefore'] as const;
const INTENSITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** A number field of the form, as typed: kilometres for a distance stored in metres. */
const typed = (value: number | null, scale = 1) => (value === null ? '' : String(value / scale));

/** A free record of any activity outside the program: a new one, or the one with `id`. */
export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const existing = useLocal((ctx) => (id ? getActivity(ctx, id) : null));

  const [type, setType] = useState(existing?.activity_type ?? '');
  const [ownType, setOwnType] = useState(
    existing && !isKnownActivity(existing.activity_type) ? existing.activity_type : '',
  );
  const [own, setOwn] = useState(existing !== null && !isKnownActivity(existing.activity_type));
  // How many days ago it was; an older record keeps its own day until another one is picked.
  const [daysAgo, setDaysAgo] = useState<number | null>(existing ? null : 0);
  const [duration, setDuration] = useState(existing ? formatClock(existing.duration_sec) : '');
  const [intensity, setIntensity] = useState<number | null>(existing?.intensity ?? null);
  const [distance, setDistance] = useState(typed(existing?.distance_m ?? null, 1000));
  const [hr, setHr] = useState(typed(existing?.avg_hr ?? null));
  const [calories, setCalories] = useState(typed(existing?.calories ?? null));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  // The days the chips stand for, fixed when the screen opens.
  const [openedAt] = useState(() => Date.now());

  if (id && !existing) {
    return <EmptyState title={t('activity.notFoundTitle')} text={t('activity.notFoundText')} />;
  }

  /** A number field: `undefined` when it is filled in wrong. */
  const number = (text: string, field: 'distance_m' | 'avg_hr' | 'calories', scale = 1) => {
    if (text.trim() === '') return null;
    const value = parseNumber(text);
    if (value === null) return undefined;
    const scaled = Math.round(value * scale);
    const { min, max } = CARDIO_LIMITS[field];
    return scaled >= min && scaled <= max ? scaled : undefined;
  };

  const save = () => {
    const activityType = own ? ownType.trim() : type;
    if (activityType === '') return setError(t('activity.chooseType'));
    const seconds = parseDuration(duration);
    if (!seconds) return setError(t('cardio.invalidTime'));
    const fields = {
      distance_m: number(distance, 'distance_m', 1000),
      avg_hr: number(hr, 'avg_hr'),
      calories: number(calories, 'calories'),
    };
    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) {
        const label = t(`cardio.fields.${field as keyof typeof fields}`);
        return setError(t('cardio.invalidField', { field: label }));
      }
    }
    // It ended about now on the day picked; an older record keeps the time it had.
    const startedAt =
      daysAgo === null && existing
        ? existing.started_at
        : new Date(Date.now() - (daysAgo ?? 0) * DAY_MS - seconds * 1000).toISOString();

    mutate((ctx) =>
      saveActivity(
        ctx,
        {
          activity_type: activityType,
          started_at: startedAt,
          duration_sec: seconds,
          intensity,
          distance_m: fields.distance_m ?? null,
          avg_hr: fields.avg_hr ?? null,
          calories: fields.calories ?? null,
          notes: notes.trim(),
        },
        existing?.id,
      ),
    );
    router.back();
  };

  const day = (offset: number) => toLocalDate(new Date(openedAt - offset * DAY_MS));
  const existingDay = existing ? toLocalDate(new Date(existing.started_at)) : null;
  const olderDay = existingDay !== null && ![0, 1, 2].some((offset) => day(offset) === existingDay);

  return (
    <Screen>
      <Stack.Screen
        options={{ title: existing ? t('activity.editTitle') : t('activity.newTitle') }}
      />

      <Group title={t('activity.type')}>
        <View style={styles.chips}>
          {ACTIVITY_TYPES.map((key) => (
            <Chip
              key={key}
              label={activityName(t, key)}
              selected={!own && type === key}
              onPress={() => {
                setOwn(false);
                setType(key);
              }}
            />
          ))}
          <Chip label={t('activity.own')} selected={own} onPress={() => setOwn(true)} />
        </View>
        {own && (
          <TextField
            label={t('activity.own')}
            value={ownType}
            placeholder={t('activity.ownPlaceholder')}
            maxLength={60}
            autoFocus={!existing}
            onChangeText={setOwnType}
          />
        )}
      </Group>

      <Group title={t('activity.day')}>
        <View style={styles.chips}>
          {olderDay && existing && (
            <Chip
              label={new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
                new Date(existing.started_at),
              )}
              selected={daysAgo === null}
              onPress={() => setDaysAgo(null)}
            />
          )}
          {DAYS.map((key, offset) => (
            <Chip
              key={key}
              label={t(`activity.${key}`)}
              selected={daysAgo === offset || (daysAgo === null && !olderDay && day(offset) === existingDay)}
              onPress={() => setDaysAgo(offset)}
            />
          ))}
        </View>
      </Group>

      <Group title={t('activity.duration')}>
        <TextField
          label={t('activity.duration')}
          value={duration}
          placeholder={t('cardio.timePlaceholder')}
          keyboardType="numbers-and-punctuation"
          onChangeText={setDuration}
        />
      </Group>

      <Group title={t('activity.intensity')}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('activity.intensityHint')}
        </ThemedText>
        <View style={styles.chips}>
          {INTENSITIES.map((value) => (
            <Chip
              key={value}
              label={String(value)}
              selected={intensity === value}
              onPress={() => setIntensity(intensity === value ? null : value)}
            />
          ))}
        </View>
      </Group>

      <View style={styles.numbers}>
        {(
          [
            ['distance_m', distance, setDistance],
            ['avg_hr', hr, setHr],
            ['calories', calories, setCalories],
          ] as const
        ).map(([field, value, set]) => (
          <View key={field} style={styles.number}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {t(`cardio.fields.${field}`)}
            </ThemedText>
            <TextField
              label={t(`cardio.fields.${field}`)}
              value={value}
              keyboardType="decimal-pad"
              onChangeText={set}
            />
          </View>
        ))}
      </View>

      <Group title={t('activity.notes')}>
        <TextField
          label={t('activity.notes')}
          value={notes}
          placeholder={t('activity.notesPlaceholder')}
          maxLength={1000}
          multiline
          onChangeText={setNotes}
        />
      </Group>

      {error && (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      )}
      <View style={styles.actions}>
        <Button title={t('activity.save')} onPress={save} />
        {existing && (
          <ConfirmButton
            title={t('activity.delete')}
            onConfirm={() => {
              mutate((ctx) => deleteActivity(ctx, existing.id));
              router.back();
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  numbers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  number: {
    flexBasis: '30%',
    flexGrow: 1,
    gap: Spacing.half,
  },
  actions: {
    gap: Spacing.two,
  },
});
