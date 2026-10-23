import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { userMessage } from '@/api/errors';
import { afterAuth } from '@/navigation/after-auth';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Screen, TextField } from '@/ui';
import { AuthLogo } from '@/ui/brand/AuthLogo';

import { PasswordField } from '../components/PasswordField';
import { useIdentifierLogin } from '../hooks';
import { normalizeEmail, normalizeMobile } from '../identifiers';

/** The mobile number or the email, normalized (used as the sign-in id). */
function normalizeIdentifier(raw: string): string | null {
  return raw.includes('@') ? normalizeEmail(raw) : normalizeMobile(raw);
}

const formSchema = z.object({
  identifier: z.string().refine((v) => normalizeIdentifier(v.trim()) !== null, 'Enter a valid mobile number or email'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof formSchema>;

/** Sign in: mobile number OR email, plus the password. */
export function LoginScreen({ navigation, route }: RootScreenProps<'Login'>) {
  const redirect = route.params?.redirect;
  const login = useIdentifierLogin();
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { identifier: '', password: '' },
  });

  function submit(values: FormValues) {
    const identifier = normalizeIdentifier(values.identifier.trim());
    if (!identifier) return;
    login.mutate(
      { identifier, password: values.password },
      { onSuccess: () => navigation.dispatch(afterAuth(redirect)) },
    );
  }

  const error = login.isError ? userMessage(login.error) : '';

  return (
    <Screen scroll padded>
      <AuthLogo />
      <Text style={styles.heading} accessibilityRole="header">
        Sign in to Belzo
      </Text>

      <View>
        <TextField
          control={control}
          name="identifier"
          label="Mobile number or email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          placeholder="10-digit mobile number or email"
          error={formState.errors.identifier?.message}
        />
        <PasswordField
          control={control}
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          error={formState.errors.password?.message}
          testID="login-password"
        />
        <Pressable
          style={styles.forgot}
          onPress={() => navigation.navigate('ForgotPassword', { redirect })}
          accessibilityRole="link"
          testID="login-forgot"
        >
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
        <Button
          title="Sign in"
          fullWidth
          loading={login.isPending}
          onPress={handleSubmit(submit)}
          testID="login-password-submit"
        />
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>

      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate('Register', { redirect })}
        accessibilityRole="link"
      >
        <Text style={styles.muted}>New to Belzo? </Text>
        <Text style={styles.link}>Create an account</Text>
      </Pressable>
      <Text style={styles.oldAccount}>
        No password yet? Use &quot;Forgot password?&quot; to set one. Signed up earlier with only an email? Create an
        account with the same email to add your mobile number.
      </Text>
      <Text style={styles.legal}>
        By continuing you agree to our{' '}
        <Text style={styles.link} onPress={() => navigation.navigate('CmsPage', { slug: 'terms' })}>
          Terms
        </Text>{' '}
        and{' '}
        <Text style={styles.link} onPress={() => navigation.navigate('CmsPage', { slug: 'privacy' })}>
          Privacy Policy
        </Text>
        .
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...theme.typography.heading, color: theme.colors.inkStrong, marginBottom: theme.spacing.lg },
  forgot: { alignSelf: 'flex-end', marginTop: -theme.spacing.xs, marginBottom: theme.spacing.md, minHeight: 32, justifyContent: 'center' },
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.md },
  linkRow: { flexDirection: 'row', marginTop: theme.spacing.xl, alignItems: 'center', justifyContent: 'center' },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  oldAccount: { ...theme.typography.caption, color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.sm },
  legal: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.lg },
});
