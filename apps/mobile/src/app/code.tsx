import { planSubstitutions } from '@mvp/domain';
import type { ProgramTree } from '@mvp/schemas';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { gymChanges, listGymProfiles } from '@/data/gym';
import { importTree } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useCatalog } from '@/lib/catalog';
import { data } from '@/lib/db';
import { formatItemPlan } from '@/lib/format';
import { useGym } from '@/lib/gym';
import { mutate, pushChanges, useActiveProgram, useLocal } from '@/lib/local';

const ERROR_KEYS = {
  invalid_share_code: 'errors.invalid_share_code',
  rate_limited: 'errors.rate_limited',
  network: 'errors.network',
} as const;

const errorKey = (error: unknown) =>
  (error instanceof ApiRequestError && ERROR_KEYS[error.code as keyof typeof ERROR_KEYS]) ||
  'errors.unknown';

/** Taking a program by a code: enter the code, look at the program, take a copy. */
export default function ProgramByCodeScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.session !== null);
  const [code, setCode] = useState(params.code ?? '');

  const preview = useMutation({ mutationFn: (typed: string) => api.previewShareCode(typed) });

  if (!signedIn) {
    return (
      <Screen>
        <ThemedText themeColor="textSecondary">{t('code.signInText')}</ThemedText>
        <Button title={t('share.signIn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Group title={t('code.label')}>
        <TextField
          label={t('code.label')}
          value={code}
          onChangeText={(text) => {
            setCode(text);
            preview.reset();
          }}
          onSubmitEditing={() => preview.mutate(code)}
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          style={styles.code}
        />
        {preview.error && (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {t(errorKey(preview.error))}
          </ThemedText>
        )}
        {!preview.data && (
          <Button
            title={t('code.find')}
            loading={preview.isPending}
            disabled={code.trim() === ''}
            onPress={() => preview.mutate(code)}
          />
        )}
      </Group>

      {preview.data && <Preview code={code} tree={preview.data.tree} />}
    </Screen>
  );
}

function Preview({ code, tree }: { code: string; tree: ProgramTree }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { catalog, exerciseById } = useCatalog();
  const profiles = useLocal(listGymProfiles);
  const [gymId, setGymId] = useState(profiles[0]?.id);
  const gym = useGym(gymId);
  const hasActive = useActiveProgram((state) => state.id !== null);
  const setActive = useActiveProgram((state) => state.set);

  const name = (exerciseId: string) =>
    exerciseById.get(exerciseId)?.translations[locale].name ?? t('program.unknownExercise');
  // The same rules the server applies when the program is taken.
  const substitutions = gym ? planSubstitutions(tree.items, catalog.exercises, gym.equipment) : [];

  const adopt = useMutation({
    mutationFn: async () => {
      if (!gym) throw new Error('No gym profile');
      // The server fits the program to a gym profile, so it needs the profile first.
      await pushChanges(gymChanges(data(), gym.profile.id));
      return api.adoptShareCode(code, gym.profile.id);
    },
    onSuccess: ({ tree: copy }) => {
      mutate((ctx) => importTree(ctx, copy));
      if (!hasActive) setActive(copy.program.id);
      router.replace({ pathname: '/program/[id]', params: { id: copy.program.id } });
    },
  });

  return (
    <>
      <ThemedText style={styles.title}>{tree.program.title}</ThemedText>

      {tree.days.map((day) => (
        <ThemedView key={day.id} type="backgroundElement" style={styles.day}>
          <ThemedText type="smallBold">
            {day.kind === 'every_session' ? t('program.everySessionTitle') : day.title}
          </ThemedText>
          {tree.items
            .filter((item) => item.program_day_id === day.id)
            .map((item) => (
              <View key={item.id}>
                <ThemedText>{name(item.exercise_id)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatItemPlan(t, item, exerciseById.get(item.exercise_id))}
                </ThemedText>
              </View>
            ))}
        </ThemedView>
      ))}

      {profiles.length > 1 && (
        <Group title={t('code.gym')}>
          <View style={styles.chips}>
            {profiles.map((profile) => (
              <Chip
                key={profile.id}
                label={profile.name}
                selected={profile.id === gymId}
                onPress={() => setGymId(profile.id)}
              />
            ))}
          </View>
        </Group>
      )}

      {substitutions.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('code.fits')}</ThemedText>
      ) : (
        <Group title={t('code.replaced')}>
          {substitutions.map((substitution) => (
            <ThemedText key={substitution.item_id}>
              {substitution.to_exercise_id
                ? t('code.replacement', {
                    from: name(substitution.from_exercise_id),
                    to: name(substitution.to_exercise_id),
                  })
                : t('code.noReplacement', { from: name(substitution.from_exercise_id) })}
            </ThemedText>
          ))}
        </Group>
      )}

      {adopt.error && (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {t(errorKey(adopt.error))}
        </ThemedText>
      )}
      <Button title={t('code.adopt')} loading={adopt.isPending} onPress={() => adopt.mutate()} />
    </>
  );
}

const styles = StyleSheet.create({
  code: {
    fontSize: 24,
    letterSpacing: 2,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
  },
  day: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
