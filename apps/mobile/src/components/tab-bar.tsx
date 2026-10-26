import type { BottomTabBarProps } from 'expo-router/tabs';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

/** The tab bar floats over the content as a pill; the chosen tab sits in a pill of its own. */
export function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
      <View
        accessibilityRole="tablist"
        style={[styles.bar, { backgroundColor: theme.tabBar, borderColor: theme.separator }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const color = focused ? theme.accent : theme.text;
          const title = options.title ?? route.name;

          const press = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={title}
              onPress={press}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[styles.item, focused && { backgroundColor: theme.backgroundSelected }]}>
              {options.tabBarIcon?.({ focused, color, size: 24 })}
              <ThemedText
                style={[styles.label, { color }]}
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
    flexDirection: 'row',
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
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    minHeight: 56,
    paddingHorizontal: Spacing.half,
    borderRadius: Radius.pill,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: 600,
    letterSpacing: -0.2,
  },
});
