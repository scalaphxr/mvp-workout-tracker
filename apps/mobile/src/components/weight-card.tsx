import { cutPace, weightStats } from '@mvp/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { listWeights, setWeight } from '@/data/body';
import { getProgramTree } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { haptic } from '@/lib/feedback';
import { formatNumber, toLocalDate } from '@/lib/format';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';
import { fromUnits, toUnits, useUnits, useWeightFormat } from '@/lib/units';

import { Button } from './button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { CardLabel, Metric, StepButton, TextField } from './ui';

/** The limits of `BodyLogRowSchema`. */
const MIN_KG = 20;
const MAX_KG = 400;
/** The step of the − and + buttons, in the user's units. */
const STEP = 0.1;

/** The morning weight: entering today's, the 7-day average and the change over the week. */
export function WeightCard() {
  const { t } = useTranslation();
  const locale = useLocale();
  const today = toLocalDate(new Date());
  const weights = useLocal(listWeights);
  const programId = useActiveProgram((state) => state.id);
  const goal = useLocal((ctx) => (programId ? getProgramTree(ctx, programId)?.program.goal : null));
  const stats = weightStats(weights, today);
  const units = useUnits();
  const weight = useWeightFormat();
  /** A number in the user's units, kept to a tenth. */
  const shown = (kg: number) => Math.round(toUnits(kg, units) * 10) / 10;

  const [editing, setEditing] = useState(false);
  // The field starts from the last known weight: today's is rarely far from it.
  const known = stats.today ?? weights.at(-1)?.weight_kg;
  const [text, setText] = useState(known === undefined ? '' : formatNumber(shown(known), locale));
  // Typed with a comma or a point in the user's units, kept to a tenth.
  const value = Math.round(Number(text.trim().replace(',', '.')) * 10) / 10;
  const valueKg = fromUnits(value, units);
  const valid = text.trim() !== '' && valueKg >= MIN_KG && valueKg <= MAX_KG;
  const kg = (kilograms: number) => weight(Math.round(kilograms * 10) / 10);
  const signed = (number: number, digits: number) =>
    `${number > 0 ? '+' : number < 0 ? '−' : ''}${formatNumber(Math.abs(Number(number.toFixed(digits))), locale)}`;

  const step = (delta: number) => {
    haptic('tap');
    // Steps of 0.1 would otherwise pile up binary rounding errors.
    setText(formatNumber(Math.round((value + delta) * 10) / 10, locale));
  };
  const save = () => {
    if (!valid) return;
    // Stored in kilograms, to the gram: a weight typed in pounds comes back the same.
    mutate((ctx) => setWeight(ctx, today, Math.round(valueKg * 1000) / 1000));
    setText(formatNumber(value, locale));
    setEditing(false);
    haptic('tap');
    void syncNow();
  };
  // The hint about the pace is for those who are cutting.
  const pace = goal === 'cut' ? cutPace(stats.change_pct) : null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <CardLabel icon="body" title={t('weight.title')} />

      {stats.today !== null && !editing ? (
        <View style={styles.row}>
          <Metric
            value={formatNumber(shown(stats.today), locale)}
            unit={t(units === 'lb' ? 'units.lb' : 'units.kg', { value: '' }).trim()}
          />
          <Button variant="secondary" title={t('weight.change')} onPress={() => setEditing(true)} />
        </View>
      ) : (
        <>
          {/* Typed for the first time, then nudged by 0.1 kg from yesterday's. */}
          <View style={styles.row}>
            <StepButton
              label={`${t(units === 'lb' ? 'weight.labelLb' : 'weight.label')}: ${t('item.decrease')}`}
              icon="remove"
              disabled={!valid || fromUnits(value - STEP, units) < MIN_KG}
              onPress={() => step(-STEP)}
            />
            <TextField
              label={t(units === 'lb' ? 'weight.labelLb' : 'weight.label')}
              value={text}
              onChangeText={setText}
              placeholder={t(units === 'lb' ? 'weight.placeholderLb' : 'weight.placeholder')}
              inputMode="decimal"
              returnKeyType="done"
              onSubmitEditing={save}
              style={styles.input}
            />
            <StepButton
              label={`${t(units === 'lb' ? 'weight.labelLb' : 'weight.label')}: ${t('item.increase')}`}
              icon="add"
              disabled={!valid || fromUnits(value + STEP, units) > MAX_KG}
              onPress={() => step(STEP)}
            />
          </View>
          {text.trim() !== '' && !valid && (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
              {t('weight.invalid', { min: weight(MIN_KG), max: weight(MAX_KG) })}
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
              change: t(units === 'lb' ? 'units.lb' : 'units.kg', {
                value: signed(toUnits(stats.change_kg, units), 1),
              }),
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
    borderRadius: Radius.card,
    gap: Spacing.three,
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
});
