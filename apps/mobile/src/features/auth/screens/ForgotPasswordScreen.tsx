import { zodResolver } from '@hookform/resolvers/zod';
import { passwordProblems, strongPasswordSchema } from '@belzo/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text } from 'react-native';
import { z } from 'zod';

import { userMessage } from '@/api/errors';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Screen, TextField } from '@/ui';
import { AuthLogo } from '@/ui/brand/AuthLogo';
import { useToast } from '@/ui/Toast';

import { OtpVerifyRow } from '../components/OtpVerifyRow';
import { PasswordField } from '../components/PasswordField';
import { PasswordRules } from '../components/PasswordRules';
import { useResetPassword } from '../hooks';
import { normalizeEmail, normalizeMobile } from '../identifiers';

/** The mobile number or the email an account can be found by (null when neither is valid yet). */
function normalizeAccountId(raw: string): { kind: 'phone' | 'email'; target: string } | null {
  const v = raw.trim();
  if (v.includes('@')) {
    const email = normalizeEmail(v);
    return email ? { kind: 'email', target: email } : null;
  }
  const phone = normalizeMobile(v);
  return phone ? { kind: 'phone', target: phone } : null;
}

const formSchema = z
  .object({
    phone: z
      .string()
      .refine((v) => normalizeAccountId(v) !== null, 'Enter a valid mobile number or email'),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Both passwords must match',
  });
type FormValues = z.infer<typeof formSchema>;

/** Forgot password: verify the mobile number with an OTP, then choose a new password (twice). */
export function ForgotPasswordScreen({ navigation, route }: RootScreenProps<'ForgotPassword'>) {
  const redirect = route.params?.redirect;
  const toast = useToast();
  const reset = useResetPassword();
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { phone: '', password: '', confirmPassword: '' },
  });
  const [verified, setVerified] = useState<{ target: string; proof: string } | null>(null);

  const account = normalizeAccountId(useWatch({ control, name: 'phone' }));
  const phoneTarget = account?.target ?? null;
  const password = useWatch({ control, name: 'password' });
  const proof = verified && verified.target === phoneTarget ? verified.proof : null;

  function submit(values: FormValues) {
    if (!proof) return;
    reset.mutate(
      { proof, password: values.password, confirmPassword: values.confirmPassword },
      {
        onSuccess: () => {
          toast.show({
            message: 'Password changed. Sign in with your new password.',
            tone: 'success',
          });
          navigation.replace('Login', { redirect });
        },
      },
    );
  }

  const error = reset.isError ? userMessage(reset.error) : '';

  return (
    <Screen scroll padded>
      <AuthLogo />
      <Text style={styles.heading} accessibilityRole="header">
        Reset your password
      </Text>
      <Text style={styles.sub}>
        Verify your mobile number or email with an OTP, then choose a new password.
      </Text>

      <TextField
        control={control}
        name="phone"
        label="Registered mobile number or email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="tel"
        placeholder="10-digit mobile number or email"
        error={formState.errors.phone?.message}
      />
      {phoneTarget ? (
        <OtpVerifyRow
          key={phoneTarget}
          kind={account?.kind ?? 'phone'}
          target={phoneTarget}
          purpose="reset"
          verified={Boolean(proof)}
          onVerified={(p) => setVerified({ target: phoneTarget, proof: p })}
          testID="forgot-otp"
        />
      ) : null}

      {proof ? (
        <>
          <PasswordField
            control={control}
            name="password"
            label="New password"
            autoComplete="new-password"
            placeholder="Create a new password"
            error={formState.errors.password?.message}
            testID="forgot-password"
          />
          <PasswordRules password={password} />
          <PasswordField
            control={control}
            name="confirmPassword"
            label="Confirm new password"
            autoComplete="new-password"
            placeholder="Enter the password again"
            error={formState.errors.confirmPassword?.message}
            testID="forgot-confirm"
          />
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            title="Change password"
            fullWidth
            loading={reset.isPending}
            disabled={passwordProblems(password).length > 0}
            onPress={handleSubmit(submit)}
            testID="forgot-submit"
            style={styles.submit}
          />
        </>
      ) : null}

      <Pressable style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="link">
        <Text style={styles.link}>Back to sign in</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...theme.typography.heading, color: theme.colors.inkStrong },
  sub: {
    ...theme.typography.body,
    color: theme.colors.muted,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.sm },
  submit: { marginTop: theme.spacing.md },
  back: {
    alignSelf: 'center',
    marginTop: theme.spacing.xl,
    minHeight: theme.touch.minTouch,
    justifyContent: 'center',
  },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
});
