import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/**
 * The tab bar along the bottom edge: an icon over a label, the chosen tab in the accent with a
 * filled icon, the others in grey. It sits over the content, which scrolls out from under it.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.bar,
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
          const title = options.title ?? route.name;
          const color = focused ? theme.accent : theme.textSecondary;

          const press = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={title}
              onPress={press}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              {options.tabBarIcon?.({ focused, color, size: 26 })}
              <ThemedText
                style={[styles.label, { color }, focused && styles.chosen]}
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
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  track: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    minHeight: 52,
    paddingHorizontal: Spacing.half,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  chosen: {
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.6,
  },
});
