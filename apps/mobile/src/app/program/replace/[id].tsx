import { rankAlternatives } from '@mvp/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Card, Group, LinkRow, Screen } from '@/components/ui';
import { getItem, replaceExercise } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { useGym } from '@/lib/gym';
import { mutate, useLocal } from '@/lib/local';

/** Replacements for an exercise of a program, picked for the main gym, best first. */
export default function ReplaceExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { catalog, exerciseById, muscleByCode } = useCatalog();
  const gym = useGym();
  const item = useLocal((ctx) => getItem(ctx, id));

  const exercise = item && exerciseById.get(item.exercise_id);
  if (!item || !exercise || !gym) {
    return <EmptyState title={t('program.notFoundTitle')} text={t('program.notFoundText')} />;
  }
  const alternatives = rankAlternatives(exercise, catalog.exercises, { equipment: gym.equipment });

  const fromLibrary = (
    <Button
      variant="secondary"
      title={t('replace.fromLibrary')}
      onPress={() => router.push({ pathname: '/exercise-picker', params: { itemId: item.id } })}
    />
  );

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        {t('replace.instead', { name: exercise.translations[locale].name })}
      </ThemedText>

      {alternatives.length === 0 ? (
        <Group>
          <ThemedText type="smallBold">{t('replace.noneTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('replace.noneText')}</ThemedText>
        </Group>
      ) : (
        <Card>
          {alternatives.map(({ exercise: candidate }) => (
            <LinkRow
              key={candidate.id}
              title={candidate.translations[locale].name}
              subtitle={candidate.primary_muscles
                .map((code) => muscleByCode.get(code)?.name[locale])
                .join(', ')}
              onPress={() => {
                mutate((ctx) => replaceExercise(ctx, item.id, candidate.id));
                router.back();
              }}
            />
          ))}
        </Card>
      )}
      {fromLibrary}
    </Screen>
  );
}
