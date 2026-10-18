import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Group, Screen, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useSync } from '@/lib/sync';

/** What is attached to every message: the version, the device and the last sync. */
function details() {
  return {
    app_version: Constants.expoConfig?.version ?? 'unknown',
    device: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 200),
    last_sync_at: useSync.getState().syncedAt,
  };
}

/** The support form (spec: "Поддержка"): an answer comes by email within 48 hours. */
export default function SupportScreen() {
  const { t } = useTranslation();
  const locale = useLocale();
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.session !== null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'limited'>('idle');

  const send = async () => {
    setState('sending');
    try {
      await api.support({
        message: message.trim(),
        ...(email.trim() && { email: email.trim() }),
        locale,
        ...details(),
      });
      setState('sent');
    } catch (error) {
      setState(error instanceof ApiRequestError && error.code === 'rate_limited' ? 'limited' : 'failed');
    }
  };

  if (state === 'sent') {
    return (
      <Screen>
        <ThemedText style={styles.title}>{t('support.sentTitle')}</ThemedText>
        <ThemedText themeColor="textSecondary">{t('support.sentText')}</ThemedText>
        <Button title={t('support.close')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const { app_version, device, last_sync_at } = details();
  return (
    <Screen>
      <ThemedText themeColor="textSecondary">{t('support.intro')}</ThemedText>
      <Group title={t('support.message')}>
        <TextField
          label={t('support.message')}
          value={message}
          placeholder={t('support.messagePlaceholder')}
          maxLength={5000}
          multiline
          style={styles.message}
          onChangeText={setMessage}
        />
      </Group>
      {!signedIn && (
        <Group title={t('support.email')}>
          <TextField
            label={t('support.email')}
            value={email}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            onChangeText={setEmail}
          />
        </Group>
      )}
      <View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('support.attached')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('support.details', {
            version: app_version,
            device,
            sync: last_sync_at
              ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                  new Date(last_sync_at),
                )
              : t('support.never'),
          })}
        </ThemedText>
      </View>
      {(state === 'failed' || state === 'limited') && (
        <ThemedText type="small" themeColor="danger">
          {state === 'limited' ? t('support.limited') : t('support.failed')}
        </ThemedText>
      )}
      <Button
        title={t('support.send')}
        loading={state === 'sending'}
        disabled={message.trim() === ''}
        onPress={() => void send()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
  },
  message: {
    minHeight: 140,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
});
