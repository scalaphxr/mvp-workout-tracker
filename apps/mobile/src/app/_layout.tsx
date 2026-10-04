import '@/i18n';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncCatalog } from '@/lib/catalog';

const queryClient = new QueryClient();

/** Once per launch: picks up a newer exercise catalog when the server is reachable. */
function CatalogSync() {
  useQuery({ queryKey: ['catalog-sync'], queryFn: syncCatalog, staleTime: Infinity, retry: false });
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();

  return (
    <QueryClientProvider client={queryClient}>
      <CatalogSync />
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Without the minimal mode a back button is labelled with the route name, "(tabs)". */}
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
