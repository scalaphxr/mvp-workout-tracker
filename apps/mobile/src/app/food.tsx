import { parseNumber } from '@mvp/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen, Section, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { addFoodEntry, readFoodEntries } from '@/lib/food-log';
import { formatNumber, toLocalDate } from '@/lib/format';
import { mutate, useLocal } from '@/lib/local';

export default function FoodScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const [date] = useState(() => new Date());
  const key = toLocalDate(date);
  const entries = useLocal(() => readFoodEntries(key), [key]);
  const [draft, setDraft] = useState('');
  const [calories, setCalories] = useState('');
  const [saveError, setSaveError] = useState(false);
  const text = draft.trim();
  const kcal = parseNumber(calories);
  const invalidCalories = calories.trim() !== '' && (kcal === null || kcal < 0);

  function save() {
    if (!text || invalidCalories) return;
    try {
      mutate((ctx) => addFoodEntry(key, { id: ctx.newId(), text, ...(kcal === null ? {} : { kcal }) }));
      setDraft('');
      setCalories('');
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  return (
    <Screen>
      <ThemedText type="subtitle" accessibilityRole="header">
        {new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date)}
      </ThemedText>
      <TextField
        label={t('food.description')}
        placeholder={t('food.description')}
        multiline
        maxLength={500}
        value={draft}
        onChangeText={setDraft}
        style={styles.input}
      />
      <TextField
        label={t('food.calories')}
        placeholder={t('food.calories')}
        keyboardType="decimal-pad"
        maxLength={12}
        value={calories}
        onChangeText={setCalories}
      />
      {invalidCalories && <ThemedText themeColor="danger">{t('food.invalidCalories')}</ThemedText>}
      <Button title={t('food.save')} disabled={!text || invalidCalories} onPress={save} />
      {saveError && <ThemedText themeColor="danger">{t('food.saveError')}</ThemedText>}
      {entries.length > 0 && (
        <Section title={t('food.entries')}>
          <Card>
            <View style={styles.entries}>
              {entries.map((entry) => (
                <View key={entry.id}>
                  <ThemedText>{entry.text}</ThemedText>
                  {entry.kcal !== undefined && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('units.kcal', { value: formatNumber(entry.kcal, locale) })}
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
          </Card>
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 100, textAlignVertical: 'top' },
  entries: { padding: Spacing.three, gap: Spacing.two },
});
