import { defaultItemParams } from '@mvp/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { createProgramFromDraft } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { formatDuration, formatRange } from '@/lib/format';
import { useImportDraft } from '@/lib/import-draft';
import { mutate } from '@/lib/local';
import { syncNow } from '@/lib/sync';

/**
 * A program from pasted text: the text is read into days and exercises, lines the catalog
 * does not know are marked for the user to pick, and nothing is saved until they say so.
 */
export default function ImportTextScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { catalog, exerciseById } = useCatalog();
  const draft = useImportDraft();
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);

  if (!draft.days || draft.days.length === 0) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">{t('importText.hint')}</ThemedText>
        <TextField
          label={t('importText.label')}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setTried(false);
          }}
          placeholder={t('importText.placeholder')}
          multiline
          autoCorrect={false}
          style={styles.text}
        />
        {tried && (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {t('importText.nothing')}
          </ThemedText>
        )}
        <Button
          title={t('importText.parse')}
          disabled={text.trim() === ''}
          onPress={() => {
            draft.read(text, catalog.exercises);
            setTried(true);
          }}
        />
      </Screen>
    );
  }

  const { days } = draft;
  const unresolved = days.flatMap((day) => day.items).filter((item) => item.exerciseId === null).length;

  const save = () => {
    const program = mutate((ctx) =>
      createProgramFromDraft(ctx, {
        title: t('importText.programTitle'),
        goal: null,
        level: null,
        days_per_week: null,
        days: days.map((day, index) => ({
          title: day.title ?? t('programs.dayTitle', { number: index + 1 }),
          items: day.items.flatMap(({ parsed, exerciseId }) => {
            const exercise = exerciseId ? exerciseById.get(exerciseId) : undefined;
            if (!exercise) return [];
            // What the text does not say (rest, RIR) takes the usual values for the exercise.
            const usual = defaultItemParams(exercise, null);
            return {
              ...usual,
              exercise_id: exercise.id,
              sets: parsed.sets,
              rep_min: parsed.rep_min,
              rep_max: parsed.rep_max,
              rest_sec: parsed.rest_sec ?? usual.rest_sec,
              superset: parsed.superset,
            };
          }),
        })),
      }),
    );
    draft.clear();
    void syncNow();
    router.replace({ pathname: '/program/[id]', params: { id: program.id } });
  };

  return (
    <Screen>
      {days.map((day, dayIndex) => (
        <ThemedView key={dayIndex} type="backgroundElement" style={styles.day}>
          <ThemedText type="smallBold">
            {day.title ?? t('programs.dayTitle', { number: dayIndex + 1 })}
          </ThemedText>
          {day.items.map(({ parsed, exerciseId }, itemIndex) => {
            const exercise = exerciseId ? exerciseById.get(exerciseId) : undefined;
            const range = formatRange(parsed.rep_min, parsed.rep_max);
            const plan = [
              // With the exercise above it.
              parsed.superset ? t('program.superset') : null,
              t('program.sets', {
                sets: parsed.sets,
                range: parsed.unit === 'sec' ? t('units.sec', { value: range }) : range,
              }),
              parsed.rest_sec !== null
                ? t('program.rest', { rest: formatDuration(t, parsed.rest_sec) })
                : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <View key={itemIndex} style={styles.item}>
                <View style={styles.itemText}>
                  <ThemedText>{exercise ? exercise.translations[locale].name : parsed.name}</ThemedText>
                  {/* The line as it was written stays visible next to what it was taken for. */}
                  <ThemedText type="small" themeColor="textSecondary">
                    {exercise ? `${parsed.name}: ${plan}` : plan}
                  </ThemedText>
                  {!exercise && (
                    <ThemedText type="small" themeColor="danger">
                      {t('importText.unknown')}
                    </ThemedText>
                  )}
                </View>
                <Button
                  variant="secondary"
                  title={t('importText.choose')}
                  onPress={() =>
                    router.push({
                      pathname: '/exercise-picker',
                      params: { importDay: String(dayIndex), importItem: String(itemIndex) },
                    })
                  }
                />
              </View>
            );
          })}
        </ThemedView>
      ))}

      {draft.skipped.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('importText.skipped', { count: draft.skipped.length })}
        </ThemedText>
      )}
      {unresolved > 0 && (
        <ThemedText type="small" themeColor="danger">
          {t('importText.unresolved', { count: unresolved })}
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Button title={t('importText.save')} disabled={unresolved > 0} onPress={save} />
        <Button variant="secondary" title={t('importText.edit')} onPress={draft.clear} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: {
    minHeight: 220,
    paddingVertical: Spacing.three,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  day: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  itemText: {
    flex: 1,
  },
  actions: {
    gap: Spacing.two,
  },
});
