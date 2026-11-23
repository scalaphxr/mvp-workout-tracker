import Ionicons from '@expo/vector-icons/Ionicons';
import { parseNumber } from '@mvp/domain';
import { BODY_WEIGHT_LIMITS } from '@mvp/schemas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { loggedWeightOn, setWeight } from '@/data/body';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/feedback';
import { mutate, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';
import { fromUnits, type Units, useUnits, useWeightFormat } from '@/lib/units';

import { ThemedText } from './themed-text';
import { TextField } from './ui';

const { min, max } = BODY_WEIGHT_LIMITS;
const weightExit = FadeOutUp.duration(240).withTargetValues({ translateY: -8 }).reduceMotion(ReduceMotion.System);

export function MorningWeightRow({ date }: { date: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const formatWeight = useWeightFormat();
  const saved = useLocal((ctx) => loggedWeightOn(ctx, date), [date]);
  const [draft, setDraft] = useState<{ units: Units; text: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  if (saved !== null) return null;

  const text = draft?.units === units ? draft.text : '';
  const parsed = parseNumber(text);
  const value = parsed === null ? null : Math.round(parsed * 10) / 10;
  const kg = value === null ? null : Math.round(fromUnits(value, units) * 1000) / 1000;
  const valid = kg !== null && kg >= min && kg <= max;
  const invalid = draft?.units === units && text.trim() !== '' && !valid;
  const unit = t(units === 'lb' ? 'units.lb' : 'units.kg', { value: '' }).trim();

  function save() {
    if (!valid || kg === null) return;
    try {
      mutate((ctx) => setWeight(ctx, date, kg));
    } catch {
      setSaveFailed(true);
      return;
    }
    setDraft(null);
    setSaveFailed(false);
    Keyboard.dismiss();
    haptic('tap');
    void syncNow();
  }

  return (
    <Animated.View exiting={weightExit} collapsable={false} style={[styles.wrapper, {
      paddingLeft: insets.left + Spacing.three,
      paddingRight: insets.right + Spacing.three,
    }]}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
        <View style={styles.row}>
          <Ionicons name="scale-outline" size={20} color={theme.accent} aria-hidden />
          <ThemedText type="smallBold" style={styles.label}>{t('today.morningWeight')}</ThemedText>
          <View style={styles.inputFrame}>
            <View pointerEvents="none" style={[styles.inputOutline, { borderColor: theme.separator }]} />
            <TextField
              label={t(units === 'lb' ? 'weight.labelLb' : 'weight.label')}
              value={text}
              onChangeText={(next) => {
                setDraft({ units, text: next });
                setSaveFailed(false);
              }}
              placeholder="—"
              inputMode="decimal"
              returnKeyType="done"
              onSubmitEditing={save}
              style={styles.input}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">{unit}</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('weight.save')}
            disabled={!valid}
            onPress={save}
            style={({ pressed }) => [
              styles.save,
              { backgroundColor: valid ? theme.accentSoft : theme.background },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="checkmark" size={20} color={valid ? theme.accent : theme.textSecondary} aria-hidden />
          </Pressable>
        </View>
        {(saveFailed || invalid) && (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert" style={styles.error}>
            {saveFailed
              ? t('weight.saveError')
              : t('weight.invalid', { min: formatWeight(min), max: formatWeight(max) })}
          </ThemedText>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', marginTop: Spacing.two },
  card: { borderWidth: 1, borderRadius: Radius.field, padding: Spacing.half },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingLeft: Spacing.two },
  label: { flex: 1, minWidth: 0, fontSize: 17, lineHeight: 22 },
  inputFrame: { width: 64, justifyContent: 'center' },
  inputOutline: { position: 'absolute', left: 0, right: 0, height: 32, borderWidth: 1, borderRadius: 10 },
  input: {
    height: 44,
    minHeight: 44,
    paddingHorizontal: Spacing.one,
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontSize: 15,
    textAlign: 'center',
  },
  save: { width: 44, height: 44, borderRadius: Radius.field, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
  error: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
});
