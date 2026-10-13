import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { emailLoginSchema, emailSchema, phoneSchema } from '@belzo/shared';

import { userMessage } from '@/api/errors';
import { env } from '@/config/env';
import { afterAuth } from '@/navigation/after-auth';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Chip, Screen, TextField } from '@/ui';

import { usePasswordLogin, useRequestOtp } from '../hooks';

type Tab = 'phone' | 'emailOtp' | 'password';

const phoneForm = z.object({ phone: phoneSchema });
const emailForm = z.object({ email: emailSchema });

/** Login (design §11 Auth): Phone OTP (flag-gated), Email OTP, Email & password. No Google. */
export function LoginScreen({ navigation, route }: RootScreenProps<'Login'>) {
  const redirect = route.params?.redirect;
  const [tab, setTab] = useState<Tab>(env.phoneOtpEnabled ? 'phone' : 'emailOtp');

  const requestOtp = useRequestOtp();
  const passwordLogin = usePasswordLogin();

  const phoneCtrl = useForm<z.infer<typeof phoneForm>>({
    resolver: zodResolver(phoneForm),
    defaultValues: { phone: '' },
  });
  const emailCtrl = useForm<z.infer<typeof emailForm>>({
    resolver: zodResolver(emailForm),
    defaultValues: { email: '' },
  });
  const pwdCtrl = useForm<z.infer<typeof emailLoginSchema>>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  function sendOtp(channel: 'phone' | 'email', target: string) {
    requestOtp.mutate(
      channel === 'phone' ? { phone: target } : { email: target },
      {
        onSuccess: (res) => {
          navigation.navigate('OtpVerify', {
            requestId: res.requestId,
            target,
            channel,
            expiresAt: res.expiresAt,
            devCode: res.devCode,
            redirect,
          });
        },
      },
    );
  }

  function submitPassword(values: z.infer<typeof emailLoginSchema>) {
    passwordLogin.mutate(values, {
      onSuccess: () => navigation.dispatch(afterAuth(redirect)),
    });
  }

  const otpError = requestOtp.isError ? userMessage(requestOtp.error) : '';
  const pwdError = passwordLogin.isError ? userMessage(passwordLogin.error) : '';

  return (
    <Screen scroll padded>
      <Text style={styles.heading} accessibilityRole="header">
        Sign in to Belzo
      </Text>

      <View style={styles.tabs}>
        {env.phoneOtpEnabled ? (
          <Chip label="Phone OTP" selected={tab === 'phone'} onPress={() => setTab('phone')} />
        ) : null}
        <Chip label="Email OTP" selected={tab === 'emailOtp'} onPress={() => setTab('emailOtp')} />
        <Chip label="Password" selected={tab === 'password'} onPress={() => setTab('password')} />
      </View>

      {tab === 'phone' ? (
        <View>
          <TextField
            control={phoneCtrl.control}
            name="phone"
            label="Phone number"
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="10-digit mobile number"
            error={phoneCtrl.formState.errors.phone?.message}
          />
          <Button
            title="Send code"
            fullWidth
            loading={requestOtp.isPending}
            onPress={phoneCtrl.handleSubmit((v) => sendOtp('phone', v.phone))}
            testID="login-send-phone-otp"
          />
        </View>
      ) : null}

      {tab === 'emailOtp' ? (
        <View>
          <TextField
            control={emailCtrl.control}
            name="email"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            error={emailCtrl.formState.errors.email?.message}
          />
          <Button
            title="Send code"
            fullWidth
            loading={requestOtp.isPending}
            onPress={emailCtrl.handleSubmit((v) => sendOtp('email', v.email))}
            testID="login-send-email-otp"
          />
        </View>
      ) : null}

      {tab === 'password' ? (
        <View>
          <TextField
            control={pwdCtrl.control}
            name="email"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            error={pwdCtrl.formState.errors.email?.message}
          />
          <TextField
            control={pwdCtrl.control}
            name="password"
            label="Password"
            secureTextEntry
            autoComplete="current-password"
            error={pwdCtrl.formState.errors.password?.message}
          />
          <Button
            title="Sign in"
            fullWidth
            loading={passwordLogin.isPending}
            onPress={pwdCtrl.handleSubmit(submitPassword)}
            testID="login-password-submit"
          />
        </View>
      ) : null}

      {otpError || pwdError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {otpError || pwdError}
        </Text>
      ) : null}

      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate('Register', { redirect })}
        accessibilityRole="link"
      >
        <Text style={styles.muted}>New to Belzo? </Text>
        <Text style={styles.link}>Create an account</Text>
      </Pressable>

      <Text style={styles.legal}>
        By continuing you agree to our{' '}
        <Text style={styles.link} onPress={() => navigation.navigate('CmsPage', { slug: 'terms' })}>
          Terms
        </Text>{' '}
        and{' '}
        <Text
          style={styles.link}
          onPress={() => navigation.navigate('CmsPage', { slug: 'privacy' })}
        >
          Privacy Policy
        </Text>
        .
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...theme.typography.heading, color: theme.colors.inkStrong, marginBottom: theme.spacing.lg },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.md },
  linkRow: { flexDirection: 'row', marginTop: theme.spacing.xl, alignItems: 'center' },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  legal: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.lg },
});
