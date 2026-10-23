import type { OtpPurpose } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { userMessage } from '@/api/errors';
import { env } from '@/config/env';
import { theme } from '@/theme';
import { Button, OtpField } from '@/ui';

import { useProveOtp, useRequestOtp } from '../hooks';
import { useCountdown } from './use-countdown';

export interface OtpVerifyRowProps {
  kind: 'phone' | 'email';
  /** Normalized mobile / email being verified (already validated by the parent). */
  target: string;
  purpose: Extract<OtpPurpose, 'register' | 'reset'>;
  /** Called with the signed proof once the code is accepted. */
  onVerified: (proof: string) => void;
  verified: boolean;
  testID: string;
}

/**
 * "Send OTP → enter code → Verified" for one mobile number or email, inline in a form.
 * The parent gives it `key={target}` so changing the number or email starts over.
 */
export function OtpVerifyRow({ kind, target, purpose, onVerified, verified, testID }: OtpVerifyRowProps) {
  const request = useRequestOtp();
  const prove = useProveOtp();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [demo, setDemo] = useState<string | null>(null);
  const [resendIn, startResend] = useCountdown();
  const label = kind === 'phone' ? 'mobile number' : 'email';

  function send() {
    request.mutate(kind === 'phone' ? { phone: target, purpose } : { email: target, purpose }, {
      onSuccess: (res) => {
        setRequestId(res.requestId);
        setCode(env.showDevOtp && res.devCode ? res.devCode : '');
        setDemo(env.showDevOtp && res.devCode ? res.devCode : null);
        startResend(30);
      },
    });
  }

  function verify() {
    if (!requestId) return;
    prove.mutate(
      { requestId, code },
      {
        onSuccess: (res) => {
          setRequestId(null);
          onVerified(res.proof);
        },
      },
    );
  }

  if (verified) {
    return (
      <View style={styles.okRow} testID={`${testID}-verified`} accessibilityLiveRegion="polite">
        <MaterialCommunityIcons name="check-decagram" size={18} color={theme.colors.brandStrong} />
        <Text style={styles.okText}>{kind === 'phone' ? 'Mobile number' : 'Email'} verified</Text>
      </View>
    );
  }

  const error = request.isError ? userMessage(request.error) : prove.isError ? userMessage(prove.error) : '';

  return (
    <View style={styles.wrap} testID={testID}>
      {!requestId ? (
        <Button
          title={`Send OTP to verify ${label}`}
          variant="secondary"
          loading={request.isPending}
          onPress={send}
          testID={`${testID}-send`}
        />
      ) : (
        <View style={styles.codeBox}>
          <OtpField value={code} onChange={setCode} length={6} autoFocus />
          <View style={styles.actions}>
            <Button
              title="Verify"
              loading={prove.isPending}
              disabled={code.length < 4}
              onPress={verify}
              testID={`${testID}-verify`}
            />
            <Pressable
              onPress={send}
              disabled={resendIn > 0 || request.isPending}
              accessibilityRole="button"
              style={styles.resend}
            >
              <Text style={[styles.link, resendIn > 0 && styles.linkOff]}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
              </Text>
            </Pressable>
          </View>
          {demo ? <Text style={styles.demo}>Demo code (development build only): {demo}</Text> : null}
        </View>
      )}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: theme.spacing.md, gap: theme.spacing.xs },
  codeBox: { gap: theme.spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  resend: { minHeight: theme.touch.minTouch, justifyContent: 'center' },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  linkOff: { color: theme.colors.muted },
  demo: { ...theme.typography.caption, color: theme.colors.muted },
  error: { ...theme.typography.caption, color: theme.colors.danger },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  okText: { ...theme.typography.body, color: theme.colors.brandStrong, fontWeight: '700' },
});
