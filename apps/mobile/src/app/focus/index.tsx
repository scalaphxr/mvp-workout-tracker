import { MUSCLE_CATEGORIES, MUSCLE_CATEGORY_KEYS, rankForMuscle } from '@mvp/domain';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Group, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { activeSession } from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { useFocusContext, useFocusEdits } from '@/lib/focus-workout';
import { useLocal } from '@/lib/local';

/** Muscles a program can put a focus on: with more, no focus is left. */
const MAX_PROGRAM_MUSCLES = 2;

/** The muscles to work on, then a workout for now or a program. */
export default function FocusScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { muscleByCode } = useCatalog();
  const context = useFocusContext();
  const running = useLocal((ctx) => activeSession(ctx) !== null);
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (code: string) =>
    setPicked(picked.includes(code) ? picked.filter((item) => item !== code) : [...picked, code]);

  const hasMissing = MUSCLE_CATEGORY_KEYS.some((category) =>
    MUSCLE_CATEGORIES[category].some((code) => rankForMuscle(code, context).length === 0),
  );
  const tooMany = picked.length > MAX_PROGRAM_MUSCLES;
  const muscles = picked.join(',');

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">{t('focus.intro')}</ThemedText>

      {MUSCLE_CATEGORY_KEYS.map((category) => (
        <Group key={category} title={t(`muscleCategories.${category}`)}>
          <View style={styles.chips}>
            {MUSCLE_CATEGORIES[category].map((code) => (
              <Chip
                key={code}
                label={muscleByCode.get(code)?.name[locale] ?? code}
                selected={picked.includes(code)}
                disabled={rankForMuscle(code, context).length === 0}
                onPress={() => toggle(code)}
              />
            ))}
          </View>
        </Group>
      ))}

      {hasMissing && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('focus.noExercises')}
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Button
          title={t('focus.workoutNow')}
          disabled={picked.length === 0 || running}
          onPress={() => {
            useFocusEdits.getState().reset();
            router.push({ pathname: '/focus/workout', params: { muscles } });
          }}
        />
        {running && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('focus.running')}
          </ThemedText>
        )}
        <Button
          variant="secondary"
          title={t('focus.program')}
          disabled={picked.length === 0 || tooMany}
          onPress={() => router.push({ pathname: '/questionnaire', params: { focus: muscles } })}
        />
        {tooMany && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('focus.tooMany', { count: MAX_PROGRAM_MUSCLES })}
          </ThemedText>
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
  actions: {
    gap: Spacing.two,
  },
});
