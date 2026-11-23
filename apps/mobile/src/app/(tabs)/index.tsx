import Ionicons from '@expo/vector-icons/Ionicons';
import { consecutiveWorkoutWeeks } from '@mvp/domain';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, type SharedValue, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { DayCounters } from '@/components/day-counters';
import { ScreenGlow } from '@/components/gradients';
import { MorningWeightRow } from '@/components/morning-weight-row';
import { ProgramWeekCard } from '@/components/program-week-card';
import { WeekStrip } from '@/components/week-strip';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { workoutCalendarDays } from '@/data/history';
import { getProgram, listPrograms } from '@/data/programs';
import { lastFinishedSession } from '@/data/sessions';
import { useTheme } from '@/hooks/use-theme';
import { toLocalDate } from '@/lib/format';
import { useActiveProgram, useLocal } from '@/lib/local';
import { usePreferences } from '@/lib/preferences';
import { calendarDayIndex, dateFromCalendarDay, parseWeekDate } from '@/lib/week';

export default function TodayScreen() {
  const onboarded = usePreferences((state) => state.onboarded);
  const fresh = useLocal((ctx) => listPrograms(ctx).length === 0 && lastFinishedSession(ctx) === null);

  if (!onboarded && fresh) return <Redirect href="/onboarding" />;

  return (
    <GestureHandlerRootView style={styles.fill}>
      <DayPager />
    </GestureHandlerRootView>
  );
}

function DayPager() {
  const { t } = useTranslation();
  const router = useRouter();
  const { calendarDate } = useLocalSearchParams<{ calendarDate?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const today = calendarDayIndex(new Date());
  const todayDate = toLocalDate(dateFromCalendarDay(today));
  const [day, setDay] = useState(today);
  const position = useSharedValue(today);
  const settledDay = useSharedValue(today);
  const settling = useSharedValue(false);
  const { recorded, workouts } = useLocal(workoutCalendarDays);
  const streak = consecutiveWorkoutWeeks(workouts, todayDate);
  const activeId = useActiveProgram((state) => state.id);
  const program = useLocal((ctx) => activeId ? getProgram(ctx, activeId) : null, [activeId]);

  const jumpTo = useCallback((target: number) => {
    scheduleOnUI(() => {
      'worklet';
      position.set(target);
      settledDay.set(target);
      settling.set(false);
    });
    setDay(target);
  }, [position, settledDay, settling, setDay]);

  useFocusEffect(useCallback(() => {
    if (!calendarDate) return;
    const date = parseWeekDate(calendarDate);
    if (date) jumpTo(calendarDayIndex(date));
    router.setParams({ calendarDate: undefined });
  }, [calendarDate, jumpTo, router]));

  function finishTurn(target: number) {
    'worklet';
    settling.set(true);
    position.set(withTiming(target, { duration: 240, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) {
        settledDay.set(target);
        scheduleOnRN(setDay, target);
      }
      settling.set(false);
    }));
  }

  const canSwipe = useDerivedValue(() => !settling.get());
  const swipe = usePanGesture({
    enabled: canSwipe,
    activeOffsetX: [-8, 8],
    failOffsetY: [-16, 16],
    maxPointers: 1,
    onUpdate: ({ translationX }) => {
      'worklet';
      const progress = Math.max(-1, Math.min(1, translationX / width));
      position.set(settledDay.get() - progress);
    },
    onDeactivate: ({ translationX, velocityX, canceled }) => {
      'worklet';
      const shouldTurn = !canceled && (
        Math.abs(translationX) > width * 0.2 ||
        (Math.abs(translationX) > 12 && Math.abs(velocityX) > 450)
      );
      finishTurn(settledDay.get() + (shouldTurn ? (translationX < 0 ? 1 : -1) : 0));
    },
  });

  return (
    <View style={[styles.fill, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <ScreenGlow />
      <View style={[styles.header, {
        paddingLeft: insets.left + Spacing.three,
        paddingRight: insets.right + Spacing.three,
      }]}>
        <View style={[styles.toolbar, { backgroundColor: theme.backgroundElement, borderColor: theme.separator }]}>
          <WeekStrip
            today={today}
            selected={day}
            position={position}
            recorded={recorded}
            onSelect={(target) => scheduleOnUI(finishTurn, target)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('week.openTodayCalendar')}
            testID="open-workout-calendar"
            onPress={() => {
              router.navigate('/calendar');
              jumpTo(calendarDayIndex(new Date()));
            }}
            style={({ pressed }) => [styles.calendarButton, pressed && styles.pressed]}>
            <Ionicons name="calendar-outline" color={theme.accent} size={21} />
          </Pressable>
        </View>
      </View>
      <GestureDetector gesture={swipe}>
        <View collapsable={false} style={styles.viewport}>
          {[-2, -1, 0, 1, 2].map((offset) => (
            <DayPage
              key={day + offset}
              day={day + offset}
              offset={offset}
              position={position}
              width={width}
              program={program}
              workouts={workouts}
              streak={streak}
              todayDate={todayDate}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

function DayPage({ day, offset, position, width, program, workouts, streak, todayDate }: {
  day: number; offset: number; position: SharedValue<number>; width: number;
  program: ReturnType<typeof getProgram>; workouts: ReadonlySet<string>; streak: number;
  todayDate: string;
}) {
  const selectedDate = dateFromCalendarDay(day);
  const date = toLocalDate(selectedDate);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: (day - position.get()) * width }],
  }));
  return (
    <Animated.View
      pointerEvents={offset === 0 ? 'box-none' : 'none'}
      aria-hidden={offset !== 0}
      accessibilityElementsHidden={offset !== 0}
      importantForAccessibility={offset === 0 ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, slide]}>
      {Math.abs(offset) <= 1 && (
        <>
          <DayCounters date={date} />
          <ProgramWeekCard
            program={program}
            selectedDate={selectedDate}
            todayDate={todayDate}
            workouts={workouts}
            streak={streak}
            interactive={offset === 0}
          />
          {offset === 0 && date <= todayDate && <MorningWeightRow date={date} />}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', zIndex: 1 },
  toolbar: { flexDirection: 'row', gap: Spacing.half, borderWidth: 1, borderRadius: 16, padding: Spacing.half },
  calendarButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  pressed: { opacity: 0.68 },
  viewport: { flex: 1, overflow: 'hidden' },
});
