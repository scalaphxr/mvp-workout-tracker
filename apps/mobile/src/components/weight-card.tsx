import { cutPace, weightStats } from '@mvp/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { listWeights, setWeight } from '@/data/body';
import { getProgramTree } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { haptic } from '@/lib/feedback';
import { formatNumber, toLocalDate } from '@/lib/format';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';
import { formatKg } from '@/lib/workout';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { StepButton, TextField } from './ui';

/** The limits of `BodyLogRowSchema`. */
const MIN_KG = 20;
const MAX_KG = 400;
const STEP_KG = 0.1;

/** The morning weight: entering today's, the 7-day average and the change over the week. */
export function WeightCard() {
  const { t } = useTranslation();
  const locale = useLocale();
  const today = toLocalDate(new Date());
  const weights = useLocal(listWeights);
  const programId = useActiveProgram((state) => state.id);
  const goal = useLocal((ctx) => (programId ? getProgramTree(ctx, programId)?.program.goal : null));
  const stats = weightStats(weights, today);

  const [editing, setEditing] = useState(false);
  // The field starts from the last known weight: today's is rarely far from it.
  const known = stats.today ?? weights.at(-1)?.weight_kg;
  const [text, setText] = useState(known === undefined ? '' : formatNumber(known, locale));
  // Typed with a comma or a point, kept to 0.1 kg.
  const value = Math.round(Number(text.trim().replace(',', '.')) * 10) / 10;
  const valid = text.trim() !== '' && value >= MIN_KG && value <= MAX_KG;
  const kg = (weight: number) => formatKg(t, locale, Math.round(weight * 10) / 10);
  const signed = (number: number, digits: number) =>
    `${number > 0 ? '+' : number < 0 ? '−' : ''}${formatNumber(Math.abs(Number(number.toFixed(digits))), locale)}`;

  const step = (delta: number) => {
    haptic('tap');
    // Steps of 0.1 would otherwise pile up binary rounding errors.
    setText(formatNumber(Math.round((value + delta) * 10) / 10, locale));
  };
  const save = () => {
    if (!valid) return;
    mutate((ctx) => setWeight(ctx, today, value));
    setText(formatNumber(value, locale));
    setEditing(false);
    haptic('tap');
    void syncNow();
  };
  // The hint about the pace is for those who are cutting.
  const pace = goal === 'cut' ? cutPace(stats.change_pct) : null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('weight.title')}
      </ThemedText>

      {stats.today !== null && !editing ? (
        <View style={styles.row}>
          <ThemedText style={styles.value}>{kg(stats.today)}</ThemedText>
          <Button variant="secondary" title={t('weight.change')} onPress={() => setEditing(true)} />
        </View>
      ) : (
        <>
          {/* Typed for the first time, then nudged by 0.1 kg from yesterday's. */}
          <View style={styles.row}>
            <StepButton
              label={`${t('weight.label')}: ${t('item.decrease')}`}
              icon="remove"
              disabled={!valid || value - STEP_KG < MIN_KG}
              onPress={() => step(-STEP_KG)}
            />
            <TextField
              label={t('weight.label')}
              value={text}
              onChangeText={setText}
              placeholder={t('weight.placeholder')}
              inputMode="decimal"
              returnKeyType="done"
              onSubmitEditing={save}
              style={styles.input}
            />
            <StepButton
              label={`${t('weight.label')}: ${t('item.increase')}`}
              icon="add"
              disabled={!valid || value + STEP_KG > MAX_KG}
              onPress={() => step(STEP_KG)}
            />
          </View>
          {text.trim() !== '' && !valid && (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
              {t('weight.invalid', { min: MIN_KG, max: MAX_KG })}
            </ThemedText>
          )}
          <Button title={t('weight.save')} disabled={!valid} onPress={save} />
        </>
      )}

      <View>
        <ThemedText type="small">
          {stats.average7 !== null
            ? t('weight.average', { weight: kg(stats.average7) })
            : t('weight.averageNeeds')}
        </ThemedText>
        {stats.change_kg !== null && stats.change_pct !== null && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('weight.weekChange', {
              change: t('units.kg', { value: signed(stats.change_kg, 1) }),
              percent: signed(stats.change_pct, 1),
            })}
          </ThemedText>
        )}
        {pace && (
          <ThemedText type="small" themeColor={pace === 'too_fast' ? 'danger' : 'textSecondary'}>
            {t(`weight.pace.${pace}`)}
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    // A narrow phone leaves the field less room than its placeholder asks for.
    minWidth: 0,
    fontSize: 20,
    textAlign: 'center',
  },
  value: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
});
