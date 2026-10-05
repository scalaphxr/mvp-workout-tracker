import { programTemplates } from '@mvp/content';
import {
  type Answers,
  generateProgram,
  hasFeature,
  MUSCLE_GROUPS,
  WEEKLY_SETS,
} from '@mvp/domain';
import { GOALS, LEVELS } from '@mvp/schemas';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { listGymProfiles } from '@/data/gym';
import { createProgramFromDraft } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { formatItemPlan } from '@/lib/format';
import { useGym } from '@/lib/gym';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';

const FREQUENCIES = [2, '2-3', 3, 4, 5, 6] as const;
const DURATIONS = [30, 45, 60, 75, 90] as const;
const SPLITS = ['auto', 'full_body', 'chest_back_legs'] as const;

/** The questionnaire: a few answers, then a draft of a program with the reasons behind it. */
export default function QuestionnaireScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const { catalog, exerciseById } = useCatalog();
  const profiles = useLocal(listGymProfiles);
  const setActive = useActiveProgram((state) => state.set);

  const [answers, setAnswers] = useState<Answers>({
    goal: 'mass',
    level: 'beginner',
    frequency: 3,
    duration_min: 60,
    split: 'auto',
  });
  const [gymId, setGymId] = useState(profiles[0]?.id);
  const gym = useGym(gymId);
  const [step, setStep] = useState(0);
  const answer = (patch: Partial<Answers>) => setAnswers({ ...answers, ...patch });

  // The split is only a question where the table of splits leaves a choice.
  const asksSplit = answers.frequency === 3 && answers.level !== 'beginner';
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: t('questionnaire.goal'),
      body: GOALS.map((goal) => (
        <Chip
          key={goal}
          label={t(`questionnaire.goals.${goal}`)}
          selected={answers.goal === goal}
          onPress={() => answer({ goal })}
        />
      )),
    },
    {
      title: t('questionnaire.level'),
      body: LEVELS.map((level) => (
        <Chip
          key={level}
          label={t(`questionnaire.levels.${level}`)}
          selected={answers.level === level}
          onPress={() => answer({ level })}
        />
      )),
    },
    {
      title: t('questionnaire.frequency'),
      body: FREQUENCIES.map((frequency) => (
        <Chip
          key={frequency}
          label={frequency === '2-3' ? t('questionnaire.floating') : String(frequency)}
          selected={answers.frequency === frequency}
          onPress={() => answer({ frequency })}
        />
      )),
    },
    {
      title: t('questionnaire.duration'),
      body: DURATIONS.map((duration_min) => (
        <Chip
          key={duration_min}
          label={t('units.min', { value: duration_min })}
          selected={answers.duration_min === duration_min}
          onPress={() => answer({ duration_min })}
        />
      )),
    },
    {
      title: t('questionnaire.place'),
      body: (
        <>
          {profiles.map((profile) => (
            <Chip
              key={profile.id}
              label={profile.name}
              selected={profile.id === gym?.profile.id}
              onPress={() => setGymId(profile.id)}
            />
          ))}
          {gym && (
            <Button
              variant="secondary"
              title={t('questionnaire.editPlace')}
              onPress={() => router.push({ pathname: '/gym/[id]', params: { id: gym.profile.id } })}
            />
          )}
        </>
      ),
    },
    ...(asksSplit
      ? [
          {
            title: t('questionnaire.split'),
            body: SPLITS.map((split) => (
              <Chip
                key={split}
                label={t(`questionnaire.splits.${split}`)}
                selected={answers.split === split}
                onPress={() => answer({ split })}
              />
            )),
          },
        ]
      : []),
  ];

  const current = steps[step];
  if (current) {
    return (
      <Screen>
        <ThemedText type="small" themeColor="textSecondary">
          {t('questionnaire.step', { step: step + 1, total: steps.length })}
        </ThemedText>
        <ThemedText style={styles.title}>{current.title}</ThemedText>
        <View style={styles.chips}>{current.body}</View>
        <View style={styles.nav}>
          {step > 0 && (
            <Button variant="secondary" title={t('questionnaire.back')} onPress={() => setStep(step - 1)} />
          )}
          <View style={styles.grow}>
            <Button title={t('questionnaire.next')} onPress={() => setStep(step + 1)} />
          </View>
        </View>
      </Screen>
    );
  }

  // The draft is made on the phone, from the catalog it carries: no network needed.
  const draft = generateProgram(answers, programTemplates, catalog.exercises, gym?.equipment ?? new Set());
  const target = WEEKLY_SETS[answers.level];

  const save = (activate: boolean) => {
    const program = mutate((ctx) =>
      createProgramFromDraft(ctx, {
        title: t('questionnaire.programTitle', {
          goal: t(`questionnaire.goals.${answers.goal}`),
          count: draft.days_per_week,
        }),
        goal: answers.goal,
        level: answers.level,
        days_per_week: draft.days_per_week,
        days: draft.days.map((day) => ({
          title: t(`questionnaire.days.${day.key}` as 'questionnaire.days.legs'),
          items: day.items.map(({ group: _group, ...item }) => item),
        })),
      }),
    );
    void syncNow();
    if (activate) {
      setActive(program.id);
      router.dismissTo('/');
    } else {
      router.replace({ pathname: '/program/[id]', params: { id: program.id } });
    }
  };

  return (
    <Screen>
      <ThemedText style={styles.title}>{t('questionnaire.draft')}</ThemedText>

      {draft.days.map((day) => (
        <ThemedView key={day.key} type="backgroundElement" style={styles.day}>
          <ThemedText type="smallBold">
            {t(`questionnaire.days.${day.key}` as 'questionnaire.days.legs')}
          </ThemedText>
          {day.items.map((item) => {
            const exercise = exerciseById.get(item.exercise_id);
            return (
              <View key={item.exercise_id}>
                <ThemedText>{exercise?.translations[locale].name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatItemPlan(t, item, exercise)}
                </ThemedText>
              </View>
            );
          })}
        </ThemedView>
      ))}

      <Group title={t('questionnaire.why')}>
        <ThemedText>{t(`questionnaire.whySplit.${draft.split}`)}</ThemedText>
        <ThemedText>
          {t('questionnaire.whyVolume', { minutes: answers.duration_min, cap: draft.set_cap })}
        </ThemedText>
        <ThemedText>{t('questionnaire.whyTarget', { min: target.min, max: target.max })}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {MUSCLE_GROUPS.filter((group) => draft.weekly_sets[group])
            .map((group) =>
              t('questionnaire.weekly', {
                group: t(`questionnaire.groups.${group}`),
                sets: draft.weekly_sets[group],
              }),
            )
            .join('\n')}
        </ThemedText>
        {MUSCLE_GROUPS.some((group) => (draft.weekly_sets[group] ?? target.min) < target.min) && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('questionnaire.whyShort')}
          </ThemedText>
        )}
      </Group>

      <View style={styles.actions}>
        {/* Making a program from the questionnaire is a Pro feature, open during the beta. */}
        <Button
          title={t('questionnaire.start')}
          disabled={!hasFeature(null, 'program_generation') || draft.days.every((day) => day.items.length === 0)}
          onPress={() => save(true)}
        />
        <Button variant="secondary" title={t('questionnaire.edit')} onPress={() => save(false)} />
        <Button variant="secondary" title={t('questionnaire.back')} onPress={() => setStep(steps.length - 1)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  nav: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  day: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
