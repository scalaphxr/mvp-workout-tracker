import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import i18n from '@/i18n';
import { useAuthStore } from '@/lib/auth-store';
import { syncCatalog, useCatalog } from '@/lib/catalog';
import { dataReady } from '@/lib/db';
import { ensureDefaultGym } from '@/lib/gym';
import { useReminderDriver } from '@/lib/reminders';
import { loadSyncInfo, syncNow } from '@/lib/sync';

const queryClient = new QueryClient();

/** Once per launch: picks up a newer exercise catalog when the server is reachable. */
function CatalogSync() {
  useQuery({ queryKey: ['catalog-sync'], queryFn: syncCatalog, staleTime: Infinity, retry: false });
  return null;
}

/** The headers and backgrounds of the navigation take the app's colours: a header melts into its screen. */
const navigationThemes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.accent,
      background: Colors.light.background,
      card: Colors.light.background,
      text: Colors.light.text,
      border: Colors.light.separator,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: Colors.dark.accent,
      background: Colors.dark.background,
      card: Colors.dark.background,
      text: Colors.dark.text,
      border: Colors.dark.separator,
    },
  },
};

const darkHeader = {
  headerStyle: { backgroundColor: Colors.dark.background },
  headerTintColor: Colors.dark.text,
};

/**
 * Sync runs in the background and never blocks a screen: at launch, after signing in, and
 * whenever the app comes back to the foreground.
 */
function SyncDriver() {
  const signedIn = useAuthStore((state) => state.session !== null);

  useEffect(() => {
    if (!signedIn) return;
    void syncNow();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [signedIn]);

  return null;
}

/** Reminders follow the data; rendered once the database is open. */
function ReminderDriver() {
  useReminderDriver();
  return null;
}

/** The phone database opens and migrates before the first screen is drawn. */
function useDatabase(): 'opening' | 'ready' | 'failed' {
  const [state, setState] = useState<'opening' | 'ready' | 'failed'>('opening');

  useEffect(() => {
    let mounted = true;
    dataReady.then(
      (ctx) => {
        ensureDefaultGym(ctx, useCatalog.getState().catalog, i18n.t('gym.defaultName'));
        loadSyncInfo();
        if (mounted) setState('ready');
      },
      (error: unknown) => {
        console.error(error);
        if (mounted) setState('failed');
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const database = useDatabase();

  if (database === 'opening') return null;
  if (database === 'failed') {
    return <EmptyState title={t('errors.databaseTitle')} text={t('errors.databaseText')} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <CatalogSync />
      <SyncDriver />
      <ReminderDriver />
      <ThemeProvider value={colorScheme === 'dark' ? navigationThemes.dark : navigationThemes.light}>
        {/*
          Without the minimal mode a back button is labelled with the route name, "(tabs)".
          On iOS 26 headers are see-through glass with the content running under them; ours keep
          the screen's colour instead, so no screen has to make room for the header itself.
        */}
        <Stack
          screenOptions={{
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            headerTransparent: false,
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="sign-in"
            options={{ presentation: 'modal', title: t('signIn.title') }}
          />
          <Stack.Screen
            name="exercise-filters"
            options={{ presentation: 'modal', title: t('filters.title') }}
          />
          {/* The name of the exercise is the heading of the screen itself. */}
          <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
          <Stack.Screen name="exercise-picker" options={{ title: t('picker.title') }} />
          <Stack.Screen name="gym/index" options={{ title: t('gym.title') }} />
          <Stack.Screen name="gym/[id]" options={{ title: '' }} />
          <Stack.Screen name="program/[id]" options={{ title: '' }} />
          <Stack.Screen name="program/item/[id]" options={{ title: '' }} />
          <Stack.Screen name="program/replace/[id]" options={{ title: t('replace.title') }} />
          <Stack.Screen name="program/share/[id]" options={{ title: t('share.title') }} />
          <Stack.Screen name="code" options={{ title: t('code.title') }} />
          {/* The workout is dark whatever the system theme is, header included. */}
          <Stack.Screen name="workout/[id]" options={{ title: '', ...darkHeader }} />
          <Stack.Screen
            name="workout/replace/[id]"
            options={{ title: t('busy.title'), ...darkHeader }}
          />
          <Stack.Screen name="workout/summary/[id]" options={{ title: '' }} />
          <Stack.Screen name="report" options={{ title: t('report.title') }} />
          <Stack.Screen name="questionnaire" options={{ title: t('questionnaire.title') }} />
          <Stack.Screen name="import-text" options={{ title: t('importText.title') }} />
          <Stack.Screen name="activity" options={{ title: '' }} />
          <Stack.Screen name="support" options={{ title: t('support.title') }} />
          <Stack.Screen name="interval/index" options={{ title: t('interval.title') }} />
          <Stack.Screen name="interval/preset" options={{ title: '' }} />
          <Stack.Screen name="interval/run" options={{ title: t('interval.title'), ...darkHeader }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
