import { programTemplates } from '@mvp/content';
import {
  type Answers,
  applyFocus,
  FOCUS_MIN_DURATION,
  focusAnswers,
  generateProgram,
  hasFeature,
  MUSCLE_GROUPS,
  MUSCLE_TO_GROUP,
  startingAnswers,
  WEEKLY_SETS,
} from '@mvp/domain';
import { GOALS, LEVELS } from '@mvp/schemas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Group, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { listGymProfiles } from '@/data/gym';
import { createProgramFromDraft, getProgramTree } from '@/data/programs';
import { knownExercises } from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useCatalog } from '@/lib/catalog';
import { formatItemPlan } from '@/lib/format';
import { useGym } from '@/lib/gym';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { usePreferences } from '@/lib/preferences';
import { syncNow } from '@/lib/sync';

const FREQUENCIES = [2, '2-3', 3, 4, 5, 6] as const;
const DURATIONS = [30, 45, 60, 75, 90] as const;
const SPLITS = ['auto', 'full_body', 'chest_back_legs'] as const;

/** The questionnaire: a few answers, then a draft of a program with the reasons behind it. */
export default function QuestionnaireScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const { catalog, exerciseById, muscleByCode } = useCatalog();
  const profiles = useLocal(listGymProfiles);
  const activeId = useActiveProgram((state) => state.id);
  const setActive = useActiveProgram((state) => state.set);
  const lastAnswers = usePreferences((state) => state.lastAnswers);
  const activeProgram = useLocal(
    (ctx) => (activeId ? (getProgramTree(ctx, activeId)?.program ?? null) : null),
    [activeId],
  );
  const known = useLocal(knownExercises);
  // The muscles of a program with a focus; empty for the ordinary questionnaire.
  const focus = params.focus ? params.focus.split(',') : [];
  const focused = focus.length > 0;

  const [answers, setAnswers] = useState<Answers>(() => {
    const starting = startingAnswers(lastAnswers, activeProgram);
    return focused ? focusAnswers(starting) : starting;
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
      body: DURATIONS.filter((value) => !focused || value >= FOCUS_MIN_DURATION).map((duration_min) => (
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
  const equipment = gym?.equipment ?? new Set<string>();
  const base = generateProgram(answers, programTemplates, catalog.exercises, equipment);
  const emphasis = focused
    ? applyFocus(base, focus, answers, {
        exercises: catalog.exercises,
        equipment,
        level: answers.level,
        known,
      })
    : null;
  const draft = emphasis ?? base;
  const target = WEEKLY_SETS[answers.level];
  const nameOf = (code: string) => muscleByCode.get(code)?.name[locale] ?? code;
  const focusNames = focus.map(nameOf).join(', ');
  // The picked muscles have lines of their own in the reasons.
  const focusGroups = new Set(focus.map((muscle) => MUSCLE_TO_GROUP[muscle]));

  // A program named after a muscle it does not train is not saved.
  const blocked = (emphasis?.dropped.length ?? 0) > 0;

  const save = (activate: boolean) => {
    const program = mutate((ctx) =>
      createProgramFromDraft(ctx, {
        title: focused
          ? t('questionnaire.focusTitle', { muscles: focusNames.toLocaleLowerCase(locale) })
          : t('questionnaire.programTitle', {
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
    // The goal of a week of the series: a floating 2–3 counts as 2 (spec 6.13).
    usePreferences.getState().set({
      weeklyGoal: answers.frequency === '2-3' ? 2 : answers.frequency,
      lastAnswers: answers,
    });
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
      {focused && (
        <ThemedText themeColor="textSecondary">
          {t('questionnaire.focusOn', { muscles: focusNames })}
        </ThemedText>
      )}
      {focused && answers.level === 'beginner' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('questionnaire.focusBeginner')}
        </ThemedText>
      )}
      {emphasis && emphasis.short.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('questionnaire.focusShort', { muscles: emphasis.short.map(nameOf).join(', ') })}
        </ThemedText>
      )}
      {emphasis && emphasis.dropped.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('questionnaire.focusDropped', { muscles: emphasis.dropped.map(nameOf).join(', ') })}
        </ThemedText>
      )}

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
        {emphasis ? (
          <ThemedText>
            {focus
              .map((muscle) =>
                t('questionnaire.weekly', {
                  group: nameOf(muscle),
                  sets: emphasis.focus_weekly_sets[muscle] ?? 0,
                }),
              )
              .join('\n')}
          </ThemedText>
        ) : (
          <ThemedText>{t('questionnaire.whyTarget', { min: target.min, max: target.max })}</ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {MUSCLE_GROUPS.filter((group) => draft.weekly_sets[group] && !focusGroups.has(group))
            .map((group) =>
              t('questionnaire.weekly', {
                group: t(`questionnaire.groups.${group}`),
                sets: draft.weekly_sets[group],
              }),
            )
            .join('\n')}
        </ThemedText>
        {!focused && MUSCLE_GROUPS.some((group) => (draft.weekly_sets[group] ?? target.min) < target.min) && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('questionnaire.whyShort')}
          </ThemedText>
        )}
      </Group>

      <View style={styles.actions}>
        {/* Making a program from the questionnaire is a Pro feature, open during the beta. */}
        <Button
          title={t('questionnaire.start')}
          disabled={!hasFeature(null, 'program_generation') || draft.days.every((day) => day.items.length === 0) || blocked}
          onPress={() => save(true)}
        />
        <Button
          variant="secondary"
          title={t('questionnaire.edit')}
          disabled={blocked}
          onPress={() => save(false)}
        />
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
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
  },
});
