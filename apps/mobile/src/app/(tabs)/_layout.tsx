import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

import { GraffitiIcon, type GraffitiIconName } from '@/components/graffiti-icon';
import { FloatingTabBar } from '@/components/tab-bar';

function icon(name: GraffitiIconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <GraffitiIcon name={name} color={String(color)} size={size} emphasized={focused} />;
  };
}

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    // Every tab draws its own large title, the way the system apps do.
    <Tabs
      backBehavior="history"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: icon('home') }}
      />
      <Tabs.Screen
        name="programs"
        options={{ title: t('tabs.programs'), tabBarIcon: icon('programs') }}
      />
      <Tabs.Screen
        name="exercises"
        options={{ title: t('tabs.exercises'), tabBarIcon: icon('workout') }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('tabs.progress'),
          tabBarIcon: icon('progress'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: icon('profile') }}
      />
    </Tabs>
  );
}
