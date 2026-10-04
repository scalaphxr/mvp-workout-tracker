import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, LinkRow } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getLanguagePreference, type LanguagePreference, setLanguagePreference } from '@/i18n';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const LANGUAGES = [
  { value: 'system', label: 'profile.languageSystem' },
  { value: 'ru', label: 'profile.languageRu' },
  { value: 'en', label: 'profile.languageEn' },
] as const satisfies readonly { value: LanguagePreference; label: string }[];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('profile.account')}
      </ThemedText>
      <Account />

      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {t('profile.training')}
      </ThemedText>
      <Card>
        <LinkRow title={t('gym.title')} onPress={() => router.push('/gym')} />
      </Card>

      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {t('profile.language')}
      </ThemedText>
      <LanguagePicker />
    </ScrollView>
  );
}

function Account() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((state) => state.session);
  const clearSession = useAuthStore((state) => state.clearSession);

  const me = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: session !== null });

  if (!session) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{t('profile.guestTitle')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('profile.guestText')}
        </ThemedText>
        <Button title={t('profile.signIn')} onPress={() => router.push('/sign-in')} />
      </ThemedView>
    );
  }

  const signOut = () => {
    // Best effort: the phone forgets the session even if the server is unreachable.
    api.logout(session.refreshToken).catch(() => {});
    clearSession();
    queryClient.removeQueries({ queryKey: ['me'] });
  };

  // An expired session signs the user out on its own; anything else is worth a retry.
  const failed =
    me.isError && !(me.error instanceof ApiRequestError && me.error.code === 'invalid_refresh_token');

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {me.data ? (
        <View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('profile.signedInAs')}
          </ThemedText>
          <ThemedText type="smallBold">{me.data.user.email}</ThemedText>
        </View>
      ) : failed ? (
        <>
          <ThemedText type="small" themeColor="danger">
            {t('profile.loadError')}
          </ThemedText>
          <Button variant="secondary" title={t('profile.retry')} onPress={() => me.refetch()} />
        </>
      ) : (
        <ActivityIndicator />
      )}
      <Button variant="secondary" title={t('profile.signOut')} onPress={signOut} />
    </ThemedView>
  );
}

function LanguagePicker() {
  const { t } = useTranslation();
  const theme = useTheme();
  const [preference, setPreference] = useState(getLanguagePreference);

  const select = (value: LanguagePreference) => {
    setPreference(value);
    setLanguagePreference(value);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.segments} accessibilityRole="radiogroup">
      {LANGUAGES.map(({ value, label }) => {
        const selected = value === preference;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            aria-checked={selected}
            onPress={() => select(value)}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type={selected ? 'smallBold' : 'small'} style={styles.segmentLabel}>
              {t(label)}
            </ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  sectionTitle: {
    marginTop: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  segments: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two + Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    textAlign: 'center',
  },
});
