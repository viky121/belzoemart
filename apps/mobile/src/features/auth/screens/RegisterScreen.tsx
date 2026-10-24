import { zodResolver } from '@hookform/resolvers/zod';
import { passwordProblems, strongPasswordSchema } from '@belzo/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { userMessage } from '@/api/errors';
import { afterAuth } from '@/navigation/after-auth';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Screen, TextField } from '@/ui';
import { AuthLogo } from '@/ui/brand/AuthLogo';

import { OtpVerifyRow } from '../components/OtpVerifyRow';
import { PasswordField } from '../components/PasswordField';
import { PasswordRules } from '../components/PasswordRules';
import { useRegister } from '../hooks';
import { normalizeEmail, normalizeMobile } from '../identifiers';

const formSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    phone: z.string().refine((v) => normalizeMobile(v) !== null, 'Enter a valid 10-digit mobile number'),
    email: z.string().refine((v) => normalizeEmail(v) !== null, 'Enter a valid email address'),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Both passwords must match',
  });
type FormValues = z.infer<typeof formSchema>;

interface Verified {
  target: string;
  proof: string;
}

/**
 * Create account: full name, mobile and email (each verified by an OTP) and a strong password
 * entered twice. "Create account" stays disabled until both OTPs are verified.
 */
export function RegisterScreen({ navigation, route }: RootScreenProps<'Register'>) {
  const redirect = route.params?.redirect;
  const register = useRegister();
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: { name: '', phone: '', email: '', password: '', confirmPassword: '' },
  });
  const [phoneOk, setPhoneOk] = useState<Verified | null>(null);
  const [emailOk, setEmailOk] = useState<Verified | null>(null);

  const phoneTarget = normalizeMobile(useWatch({ control, name: 'phone' }));
  const emailTarget = normalizeEmail(useWatch({ control, name: 'email' }));
  const password = useWatch({ control, name: 'password' });
  // A proof only counts for the exact number / email it was issued for.
  const phoneProof = phoneOk && phoneOk.target === phoneTarget ? phoneOk.proof : null;
  const emailProof = emailOk && emailOk.target === emailTarget ? emailOk.proof : null;
  const ready = Boolean(phoneProof && emailProof) && passwordProblems(password).length === 0;

  function submit(values: FormValues) {
    if (!phoneTarget || !emailTarget || !phoneProof || !emailProof) return;
    register.mutate(
      {
        name: values.name.trim(),
        phone: phoneTarget,
        email: emailTarget,
        password: values.password,
        confirmPassword: values.confirmPassword,
        phoneProof,
        emailProof,
      },
      { onSuccess: () => navigation.dispatch(afterAuth(redirect)) },
    );
  }

  const error = register.isError ? userMessage(register.error) : '';

  return (
    <Screen scroll padded>
      <AuthLogo />
      <Text style={styles.heading} accessibilityRole="header">
        Create your account
      </Text>
      <Text style={styles.sub}>Verify your mobile number and email, then set a password.</Text>

      <TextField
        control={control}
        name="name"
        label="Full name"
        autoComplete="name"
        autoCapitalize="words"
        placeholder="Your full name"
        error={formState.errors.name?.message}
      />

      <TextField
        control={control}
        name="phone"
        label="Mobile number"
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="10-digit mobile number"
        error={formState.errors.phone?.message}
      />
      {phoneTarget ? (
        <OtpVerifyRow
          key={phoneTarget}
          kind="phone"
          target={phoneTarget}
          purpose="register"
          verified={Boolean(phoneProof)}
          onVerified={(proof) => setPhoneOk({ target: phoneTarget, proof })}
          testID="register-phone-otp"
        />
      ) : null}

      <TextField
        control={control}
        name="email"
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        placeholder="you@example.com"
        error={formState.errors.email?.message}
      />
      {emailTarget ? (
        <OtpVerifyRow
          key={emailTarget}
          kind="email"
          target={emailTarget}
          purpose="register"
          verified={Boolean(emailProof)}
          onVerified={(proof) => setEmailOk({ target: emailTarget, proof })}
          testID="register-email-otp"
        />
      ) : null}

      <PasswordField
        control={control}
        name="password"
        label="Password"
        autoComplete="new-password"
        placeholder="Create a password"
        error={formState.errors.password?.message}
        testID="register-password"
      />
      <PasswordRules password={password} />
      <PasswordField
        control={control}
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        placeholder="Enter the password again"
        error={formState.errors.confirmPassword?.message}
        testID="register-confirm"
      />

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        title="Create account"
        fullWidth
        loading={register.isPending}
        disabled={!ready}
        onPress={handleSubmit(submit)}
        testID="register-submit"
        style={styles.submit}
      />
      {!ready ? (
        <Text style={styles.hint}>Verify your mobile and email and set a strong password to continue.</Text>
      ) : null}

      <Pressable style={styles.linkRow} onPress={() => navigation.navigate('Login', { redirect })} accessibilityRole="link">
        <Text style={styles.muted}>Already have an account? </Text>
        <Text style={styles.link}>Sign in</Text>
      </Pressable>

      <Text style={styles.legal}>
        By creating an account you agree to our{' '}
        <Text style={styles.link} onPress={() => navigation.navigate('CmsPage', { slug: 'terms' })}>
          Terms
        </Text>{' '}
        and{' '}
        <Text style={styles.link} onPress={() => navigation.navigate('CmsPage', { slug: 'privacy' })}>
          Privacy Policy
        </Text>
        .
      </Text>
      <View style={styles.bottomPad} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...theme.typography.heading, color: theme.colors.inkStrong },
  sub: { ...theme.typography.body, color: theme.colors.muted, marginTop: theme.spacing.xs, marginBottom: theme.spacing.lg },
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.sm },
  submit: { marginTop: theme.spacing.md },
  hint: { ...theme.typography.caption, color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.sm },
  linkRow: { flexDirection: 'row', marginTop: theme.spacing.xl, alignItems: 'center', justifyContent: 'center' },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  legal: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.lg },
  bottomPad: { height: theme.spacing.xl },
});
