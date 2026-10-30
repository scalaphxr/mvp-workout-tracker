import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/**
 * The tab bar floats over the content as a pill; the chosen tab sits in a pill of its own, which
 * slides from tab to tab. Each tab lights up as the pill passes over it.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  // Measured in tabs, not in points, so the bar can be any width.
  const [position] = useState(() => new Animated.Value(state.index));
  const [trackWidth, setTrackWidth] = useState(0);
  const tabWidth = trackWidth / state.routes.length;

  useEffect(() => {
    // Clamped, so the pill does not spring past the ends of the bar.
    Animated.spring(position, {
      toValue: state.index,
      friction: 10,
      tension: 80,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }, [position, state.index]);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
      <View
        accessibilityRole="tablist"
        style={[styles.bar, { backgroundColor: theme.tabBar, borderColor: theme.separator }]}>
        <View
          style={styles.track}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
          <Animated.View
            style={[
              styles.pill,
              {
                width: tabWidth,
                backgroundColor: theme.backgroundSelected,
                transform: [{ translateX: Animated.multiply(position, tabWidth) }],
              },
            ]}
          />
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key]!;
            const focused = state.index === index;
            const title = options.title ?? route.name;
            const lit = position.interpolate({
              inputRange: [index - 1, index, index + 1],
              outputRange: [0, 1, 0],
              extrapolate: 'clamp',
            });

            const press = () => {
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            };

            const content = (color: string, chosen: boolean) => (
              <>
                {options.tabBarIcon?.({ focused: chosen, color, size: 24 })}
                <ThemedText
                  style={[styles.label, { color }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}>
                  {title}
                </ThemedText>
              </>
            );

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={title}
                onPress={press}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                style={styles.item}>
                <Animated.View style={[styles.face, { opacity: Animated.subtract(1, lit) }]}>
                  {content(theme.text, false)}
                </Animated.View>
                <Animated.View style={[styles.face, StyleSheet.absoluteFill, { opacity: lit }]}>
                  {content(theme.accent, true)}
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    pointerEvents: 'box-none',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.two + Spacing.one,
  },
  bar: {
    width: '100%',
    maxWidth: 480,
    padding: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)' },
      default: {
        shadowColor: '#000000',
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
      },
    }),
  },
  track: {
    flexDirection: 'row',
  },
  pill: {
    position: 'absolute',
    pointerEvents: 'none',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.pill,
  },
  item: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.half,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: 600,
    letterSpacing: -0.2,
  },
});
