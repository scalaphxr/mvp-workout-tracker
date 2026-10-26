import { EmailSchema, LOGIN_CODE_LENGTH } from '@mvp/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentLanguage } from '@/i18n';
import { api, ApiRequestError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const ERROR_KEYS = {
  invalid_code: 'errors.invalid_code',
  too_many_attempts: 'errors.too_many_attempts',
  rate_limited: 'errors.rate_limited',
  network: 'errors.network',
} as const;

type ErrorKey = (typeof ERROR_KEYS)[keyof typeof ERROR_KEYS] | 'errors.invalidEmail' | 'errors.unknown';

const errorKey = (error: unknown): ErrorKey =>
  (error instanceof ApiRequestError && ERROR_KEYS[error.code as keyof typeof ERROR_KEYS]) ||
  'errors.unknown';

export default function SignInScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);

  const [email, setEmail] = useState('');
  /** The address the code was sent to; `null` while the user is still typing the email. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [secondsLeft, setSecondsLeft] = useCountdown();

  const sendCode = async () => {
    const parsed = EmailSchema.safeParse(email);
    if (!parsed.success) {
      setError('errors.invalidEmail');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { resend_after_sec } = await api.startEmailLogin(parsed.data, currentLanguage());
      setSentTo(parsed.data);
      setCode('');
      setSecondsLeft(resend_after_sec);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'rate_limited' && e.retryAfterSec) {
        setSecondsLeft(e.retryAfterSec);
      }
      setError(errorKey(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    try {
      const { user, ...tokens } = await api.verifyEmailCode(sentTo, value);
      setSession(tokens);
      queryClient.setQueryData(['me'], { user });
      // Opened by a link, the screen has nothing behind it to return to.
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } catch (e) {
      setError(errorKey(e));
      setBusy(false);
    }
  };

  const changeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, LOGIN_CODE_LENGTH);
    setCode(digits);
    setError(null);
    // The last digit submits the code: nothing else is left to type.
    if (digits.length === LOGIN_CODE_LENGTH && digits !== code) void verify(digits);
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sentTo === null ? (
          <>
            <ThemedText style={styles.title}>{t('signIn.emailTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('signIn.emailHint')}</ThemedText>
            <TextInput
              style={inputStyle}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError(null);
              }}
              onSubmitEditing={sendCode}
              accessibilityLabel={t('signIn.emailLabel')}
              placeholder={t('signIn.emailPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              autoFocus
              inputMode="email"
              returnKeyType="send"
            />
            {error && <ErrorText message={t(error)} />}
            <Button title={t('signIn.sendCode')} loading={busy} onPress={sendCode} />
          </>
        ) : (
          <>
            <ThemedText style={styles.title}>{t('signIn.codeTitle')}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {t('signIn.codeHint', { email: sentTo })}
            </ThemedText>
            <TextInput
              style={[inputStyle, styles.codeInput]}
              value={code}
              onChangeText={changeCode}
              accessibilityLabel={t('signIn.codeLabel')}
              placeholder={'0'.repeat(LOGIN_CODE_LENGTH)}
              placeholderTextColor={theme.textSecondary}
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
              maxLength={LOGIN_CODE_LENGTH}
            />
            {error && <ErrorText message={t(error)} />}
            <Button
              title={t('signIn.submit')}
              loading={busy}
              disabled={code.length !== LOGIN_CODE_LENGTH}
              onPress={() => verify(code)}
            />
            <Button
              variant="secondary"
              title={
                secondsLeft > 0
                  ? t('signIn.resendIn', { seconds: secondsLeft })
                  : t('signIn.resend')
              }
              disabled={busy || secondsLeft > 0}
              onPress={sendCode}
            />
            <Button
              variant="secondary"
              title={t('signIn.changeEmail')}
              disabled={busy}
              onPress={() => {
                setSentTo(null);
                setError(null);
              }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
      {message}
    </ThemedText>
  );
}

/** A number of seconds that ticks down to 0 once set. */
function useCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return [seconds, setSeconds] as const;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    alignSelf: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: 600,
  },
  input: {
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.card,
    fontSize: 18,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },
});
