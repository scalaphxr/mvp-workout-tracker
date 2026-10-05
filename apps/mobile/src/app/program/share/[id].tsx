import { formatShareCode } from '@mvp/domain';
import type { ShareCode } from '@mvp/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setStringAsync } from 'expo-clipboard';
import { createURL } from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ConfirmButton, Group, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getProgramTree, updateProgram } from '@/data/programs';
import { useLocale } from '@/hooks/use-locale';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { mutate, useLocal } from '@/lib/local';
import { syncNow } from '@/lib/sync';

const EXPIRY_OPTIONS = [
  { days: null, label: 'share.forever' },
  { days: 7, label: 'share.days7' },
  { days: 30, label: 'share.days30' },
] as const;

const errorKey = (error: unknown) =>
  error instanceof ApiRequestError && (error.code === 'network' || error.code === 'rate_limited')
    ? (`errors.${error.code}` as const)
    : ('errors.unknown' as const);

export default function ShareProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const signedIn = useAuthStore((state) => state.session !== null);
  const tree = useLocal((ctx) => getProgramTree(ctx, id));
  const [expiry, setExpiry] = useState<7 | 30 | null>(null);

  const queryKey = ['share-codes', id];
  // The server shares what it has: the program is sent there first, in its current state.
  const sendProgram = () => syncNow(true);

  const codes = useQuery({
    queryKey,
    enabled: signedIn && tree !== null,
    queryFn: async () => {
      await sendProgram();
      return (await api.shareCodes(id)).codes;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      mutate((ctx) => updateProgram(ctx, id, { visibility: 'code' }));
      await sendProgram();
      return api.createShareCode(id, expiry);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const revoke = useMutation({
    mutationFn: (code: string) => api.revokeShareCode(code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (!tree) {
    return <EmptyState title={t('program.notFoundTitle')} text={t('program.notFoundText')} />;
  }
  if (!signedIn) {
    return (
      <Screen>
        <Group>
          <ThemedText style={styles.title}>{t('share.signInTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">{t('share.signInText')}</ThemedText>
        </Group>
        <Button title={t('share.signIn')} onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  }

  const failure = create.error ?? revoke.error ?? codes.error;

  return (
    <Screen>
      <ThemedText themeColor="textSecondary">{t('share.intro')}</ThemedText>

      <Group title={t('share.expiry')}>
        <View style={styles.chips}>
          {EXPIRY_OPTIONS.map(({ days, label }) => (
            <Chip
              key={label}
              label={t(label)}
              selected={expiry === days}
              onPress={() => setExpiry(days)}
            />
          ))}
        </View>
        <Button title={t('share.create')} loading={create.isPending} onPress={() => create.mutate()} />
      </Group>

      {failure && (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {t(errorKey(failure))}
        </ThemedText>
      )}

      <Group title={t('share.codes')}>
        {codes.isPending ? (
          <ActivityIndicator />
        ) : codes.data?.length ? (
          codes.data.map((code) => (
            <CodeCard
              key={code.code}
              code={code}
              programTitle={tree.program.title}
              onRevoke={() => revoke.mutate(code.code)}
            />
          ))
        ) : (
          <ThemedText themeColor="textSecondary">{t('share.noCodes')}</ThemedText>
        )}
      </Group>
    </Screen>
  );
}

function CodeCard({
  code,
  programTitle,
  onRevoke,
}: {
  code: ShareCode;
  programTitle: string;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [copied, setCopied] = useState(false);

  const shown = formatShareCode(code.code);
  // Opens the "program by code" screen of the app with the code filled in.
  const link = createURL('/code', { queryParams: { code: shown } });

  const copy = async () => {
    await setStringAsync(shown);
    setCopied(true);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText style={styles.code} selectable>
        {shown}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {code.expires_at
          ? t('share.expires', {
              date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
                new Date(code.expires_at),
              ),
            })
          : t('share.noExpiry')}
        {code.uses_count > 0 && `\n${t('share.used', { count: code.uses_count })}`}
      </ThemedText>

      <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel={t('share.qrLabel')}>
        <QRCode value={link} size={176} />
      </View>

      <View style={styles.actions}>
        <Button
          variant="secondary"
          title={copied ? t('share.copied') : t('share.copy')}
          onPress={copy}
        />
        <Button
          variant="secondary"
          title={t('share.send')}
          onPress={() =>
            Share.share({ message: t('share.message', { title: programTitle, code: shown, link }) })
          }
        />
        <ConfirmButton title={t('share.revoke')} onConfirm={onRevoke} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  code: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
    letterSpacing: 2,
  },
  qr: {
    // A QR code needs a white field around it to be read, in the dark theme too.
    alignSelf: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#ffffff',
  },
  actions: {
    gap: Spacing.two,
  },
});
