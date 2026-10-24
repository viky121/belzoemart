import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isApiError, userMessage } from '@/api/errors';
import { env } from '@/config/env';
import { afterAuth } from '@/navigation/after-auth';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, OtpField, Screen } from '@/ui';
import { AuthLogo } from '@/ui/brand/AuthLogo';

import { useRequestOtp, useVerifyOtp } from '../hooks';

const RESEND_COOLDOWN_MS = 30_000;

function secondsUntil(ts: number, now: number): number {
  return Math.max(0, Math.ceil((ts - now) / 1000));
}

/** Verify an OTP (design §11 Auth): expiry countdown, resend after 30 s (or the 429 wait), dev box. */
export function OtpVerifyScreen({ navigation, route }: RootScreenProps<'OtpVerify'>) {
  const { target, channel, redirect } = route.params;

  const [requestId, setRequestId] = useState(route.params.requestId);
  const [expiresAt, setExpiresAt] = useState(() => Date.parse(route.params.expiresAt));
  const [devCode, setDevCode] = useState(route.params.devCode);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_COOLDOWN_MS);
  const [now, setNow] = useState(() => Date.now());

  const verify = useVerifyOtp();
  const resend = useRequestOtp();
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tick.current = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, []);

  const expirySec = secondsUntil(expiresAt, now);
  const resendInSec = secondsUntil(resendAt, now);

  function submit() {
    verify.mutate(
      { requestId, code },
      { onSuccess: () => navigation.dispatch(afterAuth(redirect)) },
    );
  }

  function doResend() {
    resend.mutate(channel === 'phone' ? { phone: target, purpose: 'login' } : { email: target, purpose: 'login' }, {
      onSuccess: (res) => {
        setRequestId(res.requestId);
        setExpiresAt(Date.parse(res.expiresAt));
        setDevCode(res.devCode);
        setCode('');
        setResendAt(Date.now() + RESEND_COOLDOWN_MS);
      },
      onError: (e) => {
        if (isApiError(e) && e.retryAfterSec !== undefined) {
          setResendAt(Date.now() + e.retryAfterSec * 1000);
        }
      },
    });
  }

  const error = verify.isError ? userMessage(verify.error) : '';

  return (
    <Screen scroll padded>
      <AuthLogo />
      <Text style={styles.heading} accessibilityRole="header">
        Enter the code
      </Text>
      <Text style={styles.sub}>
        We sent a 6-digit code to {channel === 'phone' ? 'your phone' : target}.
      </Text>

      <OtpField value={code} onChange={setCode} length={6} autoFocus error={error || undefined} />

      <Text style={styles.timer}>
        {expirySec > 0 ? `Code expires in ${expirySec}s` : 'Code expired. Request a new one.'}
      </Text>

      {env.showDevOtp && devCode ? (
        <View style={styles.devBox}>
          <Text style={styles.devLabel}>Demo code (development build only): {devCode}</Text>
          <Pressable onPress={() => setCode(devCode)} accessibilityRole="button">
            <Text style={styles.link}>Use code</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        title="Verify"
        fullWidth
        loading={verify.isPending}
        disabled={code.length !== 6 || expirySec === 0}
        onPress={submit}
        testID="otp-verify-submit"
        style={styles.verify}
      />

      <Pressable
        onPress={doResend}
        disabled={resendInSec > 0 || resend.isPending}
        accessibilityRole="button"
        style={styles.resend}
      >
        <Text style={[styles.link, resendInSec > 0 && styles.linkDisabled]}>
          {resendInSec > 0 ? `Resend code in ${resendInSec}s` : 'Resend code'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...theme.typography.heading, color: theme.colors.inkStrong },
  sub: { ...theme.typography.body, color: theme.colors.muted, marginTop: theme.spacing.xs, marginBottom: theme.spacing.lg },
  timer: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.sm },
  devBox: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryBg,
    gap: theme.spacing.xs,
  },
  devLabel: { ...theme.typography.caption, color: theme.colors.ink },
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.md },
  verify: { marginTop: theme.spacing.lg },
  resend: { marginTop: theme.spacing.lg, alignSelf: 'center', minHeight: theme.touch.minTouch, justifyContent: 'center' },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  linkDisabled: { color: theme.colors.muted },
});
