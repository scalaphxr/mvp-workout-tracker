import { intervalPhases, intervalTotalSec } from '@mvp/domain';
import { INTERVAL_LIMITS } from '@mvp/schemas';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Card, ConfirmButton, Group, Screen, Stepper, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  deleteIntervalPreset,
  getIntervalPreset,
  type IntervalPresetInput,
  saveIntervalPreset,
} from '@/data/intervals';
import { formatDuration } from '@/lib/format';
import { mutate, useLocal } from '@/lib/local';

const NEW_PRESET: Omit<IntervalPresetInput, 'title'> = {
  work_sec: 30,
  rest_sec: 15,
  rounds: 8,
  cycles: 1,
  cycle_rest_sec: 60,
};

/** A preset of the user's own: a new one, or the one with `id`. */
export default function IntervalPresetScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const existing = useLocal((ctx) => (id ? getIntervalPreset(ctx, id) : null));
  const [form, setForm] = useState<IntervalPresetInput>(() => existing ?? { ...NEW_PRESET, title: '' });

  if (id && !existing) {
    return <EmptyState title={t('interval.notFoundTitle')} text={t('interval.notFoundText')} />;
  }

  const change = (patch: Partial<IntervalPresetInput>) => setForm((current) => ({ ...current, ...patch }));
  const title = form.title.trim();
  const total = intervalTotalSec(intervalPhases(form, 0));

  const save = () => {
    mutate((ctx) => saveIntervalPreset(ctx, { ...form, title }, existing?.id));
    router.back();
  };

  /** A stepper of one field, in seconds shown as "1 min 30 s" or as a bare count. */
  const field = (key: keyof typeof INTERVAL_LIMITS, label: string, step: number, seconds: boolean) => (
    <Stepper
      label={label}
      value={form[key]}
      text={seconds ? formatDuration(t, form[key]) : undefined}
      min={INTERVAL_LIMITS[key].min}
      max={INTERVAL_LIMITS[key].max}
      step={step}
      onChange={(value) => change({ [key]: value })}
    />
  );

  return (
    <Screen>
      <Stack.Screen
        options={{ title: existing ? t('interval.form.editTitle') : t('interval.form.newTitle') }}
      />
      <Group title={t('interval.form.title')}>
        <TextField
          label={t('interval.form.title')}
          value={form.title}
          placeholder={t('interval.form.titlePlaceholder')}
          maxLength={80}
          onChangeText={(text) => change({ title: text })}
        />
      </Group>

      <Card>
        {field('work_sec', t('interval.form.work'), 5, true)}
        {field('rest_sec', t('interval.form.rest'), 5, true)}
        {field('rounds', t('interval.form.rounds'), 1, false)}
        {field('cycles', t('interval.form.cycles'), 1, false)}
        {form.cycles > 1 && field('cycle_rest_sec', t('interval.form.cycleRest'), 15, true)}
      </Card>

      <ThemedText themeColor="textSecondary">
        {t('interval.form.total', { time: formatDuration(t, total) })}
      </ThemedText>

      <View style={styles.actions}>
        <Button title={t('interval.form.save')} disabled={title === ''} onPress={save} />
        {existing && (
          <ConfirmButton
            title={t('interval.form.delete')}
            onConfirm={() => {
              mutate((ctx) => deleteIntervalPreset(ctx, existing.id));
              router.back();
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.two,
  },
});
