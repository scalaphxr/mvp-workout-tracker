import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ReminderSettings, TrainingSettings } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, ConfirmButton, Group, LinkRow, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getLanguagePreference, type LanguagePreference, setLanguagePreference } from '@/i18n';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { pendingCount } from '@/data/sync';
import { useLocale } from '@/hooks/use-locale';
import { useLocal } from '@/lib/local';
import { deleteAccount, syncNow, useSync } from '@/lib/sync';

const LANGUAGES = [
  { value: 'system', label: 'profile.languageSystem' },
  { value: 'ru', label: 'profile.languageRu' },
  { value: 'en', label: 'profile.languageEn' },
] as const satisfies readonly { value: LanguagePreference; label: string }[];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen title={t('tabs.profile')}>
      <Group title={t('profile.account')}>
        <Account />
      </Group>

      <Group title={t('profile.training')}>
        <Card>
          <LinkRow icon="business" title={t('gym.title')} onPress={() => router.push('/gym')} />
        </Card>
        <TrainingSettings />
      </Group>

      <Group title={t('reminders.title')}>
        <ReminderSettings />
      </Group>

      <Group title={t('sync.title')}>
        <SyncInfo />
      </Group>

      <Group title={t('profile.language')}>
        <LanguagePicker />
      </Group>

      <Group title={t('support.section')}>
        <Card>
          <LinkRow
            icon="help-buoy"
            title={t('support.title')}
            subtitle={t('support.hint')}
            onPress={() => router.push('/support')}
          />
        </Card>
      </Group>

      <DeleteAccount />
    </Screen>
  );
}

/** Where the user's data stands: what is on the server and what is still waiting to go. */
function SyncInfo() {
  const { t } = useTranslation();
  const locale = useLocale();
  const signedIn = useAuthStore((state) => state.session !== null);
  const { status, syncedAt } = useSync();
  const pending = useLocal(pendingCount);

  const state = !signedIn
    ? t('sync.guest')
    : status === 'syncing'
      ? t('sync.syncing')
      : status === 'failed'
        ? t('sync.failed')
        : status === 'other_account'
          ? t('sync.otherAccount')
          : syncedAt
            ? t('sync.syncedAt', {
                time: new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(syncedAt)),
              })
            : t('sync.never');

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View>
        <ThemedText type="small" themeColor={status === 'failed' ? 'danger' : 'text'}>
          {state}
        </ThemedText>
        {pending > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('sync.pending', { count: pending })}
          </ThemedText>
        )}
      </View>
      {signedIn && status !== 'other_account' && (
        <Button
          variant="secondary"
          title={t('sync.now')}
          loading={status === 'syncing'}
          onPress={() => void syncNow()}
        />
      )}
    </ThemedView>
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

/** Deleting the account is final, so it is the last thing on the screen and asks once more. */
function DeleteAccount() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const signedIn = useAuthStore((state) => state.session !== null);
  const [state, setState] = useState<'idle' | 'deleting' | 'failed'>('idle');

  if (!signedIn) return null;

  const remove = async () => {
    setState('deleting');
    try {
      await deleteAccount();
      queryClient.removeQueries({ queryKey: ['me'] });
      setState('idle');
    } catch {
      setState('failed');
    }
  };

  return (
    <Group title={t('profile.deleteTitle')}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('profile.deleteText')}
        </ThemedText>
        {state === 'failed' && (
          <ThemedText type="small" themeColor="danger">
            {t('profile.deleteFailed')}
          </ThemedText>
        )}
        {state === 'deleting' ? (
          <ActivityIndicator />
        ) : (
          <ConfirmButton title={t('profile.delete')} onConfirm={() => void remove()} />
        )}
      </ThemedView>
    </Group>
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
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.three,
  },
  segments: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Radius.card,
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
