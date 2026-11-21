import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Card, CardLabel, ConfirmButton, LinkRow, Screen, Section, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { activitiesSince } from '@/data/activities';
import type { DataContext } from '@/data/context';
import { recentProgramIds, type WorkoutRecord, workoutsBetween } from '@/data/history';
import { getProgramTree, listPrograms } from '@/data/programs';
import { activeSession, nextWorkout, startSession } from '@/data/sessions';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { useCatalog } from '@/lib/catalog';
import { activityName, formatActivity, formatCardio, formatDuration, toLocalDate } from '@/lib/format';
import { mutate, useActiveProgram, useLocal } from '@/lib/local';
import { type PlannedWorkout, usePlannedWorkouts } from '@/lib/planned-workouts';
import { useWeightFormat } from '@/lib/units';
import { parseWeekDate, plannedWorkoutTime } from '@/lib/week';

export default function WeekDateScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { t } = useTranslation();
  const day = parseWeekDate(date);
  return day
    ? <DayScreen key={date} date={date} day={day} />
    : <Screen><ThemedText>{t('week.invalidDate')}</ThemedText></Screen>;
}

function DayScreen({ date, day }: { date: string; day: Date }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const today = toLocalDate(new Date());
  const end = new Date(day);
  end.setDate(day.getDate() + 1);
  const from = day.toISOString();
  const until = end.toISOString();
  const history = useLocal((ctx) => ({
    workouts: workoutsBetween(ctx, from, until),
    activities: activitiesSince(ctx, new Date(day.getTime() - 1).toISOString())
      .filter((activity) => activity.started_at < until),
  }), [from, until]);

  return (
    <Screen>
      <ThemedText type="subtitle" accessibilityRole="header">
        {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}
      </ThemedText>
      {date >= today && <DayPlan date={date} isToday={date === today} />}
      {history.workouts.length > 0 && (
        <Section title={t('week.completed')}>
          {history.workouts.map((workout) => <WorkoutDetails key={workout.session.id} workout={workout} />)}
        </Section>
      )}
      {history.activities.length > 0 && (
        <Section title={t('week.activities')}>
          <Card>
            {history.activities.map((activity) => (
              <LinkRow key={activity.id} icon="walk"
                title={activityName(t, activity.activity_type)}
                subtitle={formatActivity(t, locale, activity).split(': ').slice(1).join(': ')}
                onPress={() => router.push({ pathname: '/activity', params: { id: activity.id } })}
              />
            ))}
          </Card>
        </Section>
      )}
      {date < today && history.workouts.length === 0 && history.activities.length === 0 && (
        <Card><ThemedText themeColor="textSecondary">{t('week.emptyDay')}</ThemedText></Card>
      )}
    </Screen>
  );
}

function WorkoutDetails({ workout }: { workout: WorkoutRecord }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const weight = useWeightFormat();
  const theme = useTheme();
  const exerciseById = useCatalog((state) => state.exerciseById);
  const performed = workout.exercises.filter(({ sets }) => sets.length > 0);
  const workSets = performed.reduce((total, { sets }) => total + sets.filter((set) => !set.is_warmup).length, 0);
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(workout.session.started_at));

  return (
    <Card>
      <View style={styles.cardBody}>
        <View style={styles.heading}>
          <CardLabel icon="checkmark-circle" title={time} />
          <ThemedText type="section">{workout.dayTitle || t('workout.freeTitle')}</ThemedText>
          {workout.programTitle ? <ThemedText themeColor="textSecondary">{workout.programTitle}</ThemedText> : null}
        </View>
        <View style={[styles.metrics, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="smallBold">{formatDuration(t, workout.durationSec)}</ThemedText>
          <ThemedText type="smallBold">{t('summary.sets', { count: workSets })}</ThemedText>
          {workout.volumeKg > 0 && (
            <ThemedText type="smallBold">{t('today.volume', { volume: weight(Math.round(workout.volumeKg)) })}</ThemedText>
          )}
        </View>
        <View>
          {performed.map(({ exercise, sets }) => (
            <View key={exercise.id} style={[styles.exercise, { borderBottomColor: theme.separator }]}>
              <ThemedText type="smallBold">
                {exerciseById.get(exercise.exercise_id)?.translations[locale].name ?? t('program.unknownExercise')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {sets.map((set) => {
                  const value = set.reps === null
                    ? formatCardio(t, locale, set)
                    : set.weight_kg === null
                      ? t('week.reps', { count: set.reps })
                      : `${weight(set.weight_kg)} × ${set.reps}`;
                  return value && (set.is_warmup ? t('week.warmup', { value }) : value);
                }).filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
          ))}
        </View>
        {workout.session.notes ? <ThemedText themeColor="textSecondary">{workout.session.notes}</ThemedText> : null}
        <Button variant="secondary" title={t('week.fullAnalysis')} onPress={() => router.push({
          pathname: '/workout/summary/[id]', params: { id: workout.session.id },
        })} />
      </View>
    </Card>
  );
}

function availablePrograms(ctx: DataContext, activeId: string | null) {
  const programs = listPrograms(ctx);
  const ids = new Set([...(activeId ? [activeId] : []), ...recentProgramIds(ctx), ...programs.map(({ id }) => id)]);
  return [...ids].flatMap((id) => {
    const program = programs.find((option) => option.id === id);
    const tree = program && getProgramTree(ctx, id);
    const next = tree && nextWorkout(ctx, id);
    if (!program || !tree || !next) return [];
    const daysWithItems = new Set(tree.items.map((item) => item.program_day_id));
    const days = next.days.filter((day) => daysWithItems.has(day.id));
    return days.length ? [{ program, days, nextId: next.day?.id }] : [];
  });
}

function DayPlan({ date, isToday }: { date: string; isToday: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const activeProgram = useActiveProgram((state) => state.id);
  const plan = usePlannedWorkouts((state) => state.plans[date]);
  const save = usePlannedWorkouts((state) => state.save);
  const choices = useLocal((ctx) => availablePrograms(ctx, activeProgram), [activeProgram]);
  const [editing, setEditing] = useState(!plan);
  const [time, setTime] = useState(() => {
    if (plan) return plan.time;
    const now = new Date();
    if (!isToday || now.getHours() < 18) return '18:00';
    const minutes = Math.min(23 * 60 + 59, (Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) + 1) * 15);
    return [Math.floor(minutes / 60), minutes % 60].map((part) => String(part).padStart(2, '0')).join(':');
  });
  const [programId, setProgramId] = useState(plan?.programId ?? '');
  const [dayId, setDayId] = useState(plan?.dayId ?? '');
  const [invalidTime, setInvalidTime] = useState(false);
  const selected = choices.find(({ program }) => program.id === programId) ?? choices[0];
  const selectedDay = selected?.days.find(({ id }) => id === dayId)
    ?? selected?.days.find(({ id }) => id === selected.nextId) ?? selected?.days[0];
  const savedProgram = choices.find(({ program }) => program.id === plan?.programId);
  const savedDay = savedProgram?.days.find(({ id }) => id === plan?.dayId);

  const savePlan = () => {
    if (!selected || !selectedDay) return;
    const at = plannedWorkoutTime(date, time);
    if (!at || at <= new Date()) {
      setInvalidTime(true);
      return;
    }
    save(date, { time: time.trim().padStart(5, '0'), programId: selected.program.id, dayId: selectedDay.id });
    setEditing(false);
  };

  const startPlan = (entry: PlannedWorkout) => {
    const { session, started } = mutate((ctx) => {
      const running = activeSession(ctx);
      return running
        ? { session: running, started: false }
        : { session: startSession(ctx, entry.programId, entry.dayId), started: true };
    });
    if (started) {
      save(date, null);
      setEditing(true);
    }
    router.push({ pathname: '/workout/[id]', params: { id: session.id } });
  };

  return (
    <Card>
      <View style={styles.cardBody}>
        <CardLabel icon="calendar" title={t('week.planTitle')} />
        {plan && !editing ? (
          <>
            <ThemedText type="subtitle">{plan.time}</ThemedText>
            <ThemedText>{savedProgram?.program.title ?? t('week.unavailable')}</ThemedText>
            {savedDay && <ThemedText themeColor="textSecondary">{savedDay.title}</ThemedText>}
            {isToday && savedDay && <Button title={t('today.start')} onPress={() => startPlan(plan)} />}
            <Button variant="secondary" title={t('week.edit')} onPress={() => {
              setTime(plan.time);
              setProgramId(plan.programId);
              setDayId(plan.dayId);
              setEditing(true);
            }} />
            <ConfirmButton title={t('week.removePlan')}
              onConfirm={() => { save(date, null); setEditing(true); }} />
          </>
        ) : selected ? (
          <>
            <View style={styles.field}>
              <ThemedText type="smallBold">{t('week.program')}</ThemedText>
              <View style={styles.options}>
                {choices.map(({ program }) => (
                  <Chip key={program.id} label={program.title} onCard selected={selected.program.id === program.id}
                    onPress={() => { setProgramId(program.id); setDayId(''); }} />
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <ThemedText type="smallBold">{t('week.programDay')}</ThemedText>
              <View style={styles.options}>
                {selected.days.map((day) => (
                  <Chip key={day.id} label={day.title} onCard selected={selectedDay?.id === day.id}
                    onPress={() => setDayId(day.id)} />
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <ThemedText type="smallBold">{t('week.time')}</ThemedText>
              <TextField label={t('week.time')} value={time} placeholder="18:00" maxLength={5}
                onChangeText={(value) => { setTime(value); setInvalidTime(false); }} />
              {invalidTime && (
                <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">{t('week.invalidTime')}</ThemedText>
              )}
            </View>
            <Button title={t('week.save')} onPress={savePlan} />
            {plan && <Button variant="secondary" title={t('week.cancelEdit')} onPress={() => {
              setInvalidTime(false);
              setEditing(false);
            }} />}
          </>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">{t('week.noPrograms')}</ThemedText>
            <Button variant="secondary" title={t('today.toPrograms')} onPress={() => router.dismissTo('/programs')} />
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardBody: { paddingVertical: Spacing.two, gap: Spacing.three },
  heading: { gap: Spacing.one },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
    padding: Spacing.two + Spacing.one,
    borderRadius: Radius.field,
  },
  exercise: {
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.one,
  },
  field: { gap: Spacing.two },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
