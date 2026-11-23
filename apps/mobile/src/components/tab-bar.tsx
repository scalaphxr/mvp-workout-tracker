import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { activeSession, nextWorkout, startFreeSession, startSession } from '@/data/sessions';
import { useTheme } from '@/hooks/use-theme';
import { mutate, useActiveProgram, useLocalAlways } from '@/lib/local';

import { GraffitiIcon } from './graffiti-icon';
import { AccentGradient } from './gradients';
import { ThemedText } from './themed-text';

export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const color = theme.accent;

  return (
    <View pointerEvents="box-none" style={styles.bar}>
      {state.routes[state.index]?.name === 'index' && <HomeActions />}
      <View
        style={[
          styles.surface,
          {
            backgroundColor: theme.tabBar,
            borderTopColor: theme.separator,
            paddingBottom: Math.max(insets.bottom, Spacing.two),
          },
        ]}>
        <View accessibilityRole="tablist" style={styles.track}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key]!;
            const focused = state.index === index;
            const tint = focused ? color : theme.textSecondary;
            const title = options.title ?? route.name;
            const press = () => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                aria-selected={focused}
                accessibilityLabel={title}
                onPress={press}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.item, width < 400 && styles.narrowItem, pressed && styles.pressed]}>
                {options.tabBarIcon?.({ focused, color: tint, size: 24 })}
                <ThemedText
                  style={[styles.label, width < 350 && styles.compactLabel, focused && styles.chosen, { color: tint }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}>
                  {title}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function HomeActions() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const running = useLocalAlways(activeSession);

  function openWorkout() {
    const { id } = mutate((ctx) => {
      const current = activeSession(ctx);
      if (current) return current;
      const programId = useActiveProgram.getState().id;
      const next = programId ? nextWorkout(ctx, programId) : null;
      return programId && next ? startSession(ctx, programId, next.day.id) : startFreeSession(ctx);
    });
    router.navigate({ pathname: '/workout/[id]', params: { id } });
  }

  const workoutTitle = t(running ? 'today.resumeWorkout' : 'today.start');
  const foodTitle = t('food.record');
  return (
    <View pointerEvents="box-none" style={styles.actionInset}>
      <View style={[styles.actions, { backgroundColor: theme.action }]}>
        <AccentGradient />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={workoutTitle}
          onPress={openWorkout}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <GraffitiIcon name={running ? 'play' : 'workout'} size={16} color={theme.onAction} />
          <ThemedText type="smallBold" style={[styles.actionLabel, { color: theme.onAction }]}>
            {workoutTitle}
          </ThemedText>
        </Pressable>
        <View pointerEvents="none" style={[styles.divider, { backgroundColor: theme.onAction }]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={foodTitle}
          onPress={() => router.navigate('/food')}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <GraffitiIcon name="food" size={16} color={theme.onAction} />
          <ThemedText type="smallBold" style={[styles.actionLabel, { color: theme.onAction }]}>
            {foodTitle}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  surface: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    ...Platform.select({
      web: { boxShadow: '0 -6px 24px rgba(13, 35, 40, 0.06)' },
      default: {
        shadowColor: '#0B1410',
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -6 },
        elevation: 8,
      },
    }),
  },
  actionInset: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    alignItems: 'center',
  },
  actions: {
    width: '100%',
    maxWidth: 352,
    flexDirection: 'row',
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  actionLabel: { flexShrink: 1, textAlign: 'center', fontSize: 12, lineHeight: 16 },
  divider: {
    marginVertical: Spacing.two,
    width: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
  track: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    minHeight: 52,
    paddingHorizontal: Spacing.half,
  },
  narrowItem: {
    flexBasis: 'auto',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  compactLabel: {
    fontSize: 11,
  },
  chosen: {
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.6,
  },
});
