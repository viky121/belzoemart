import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { emailRegisterSchema, type EmailRegister } from '@belzo/shared';

import { userMessage } from '@/api/errors';
import { afterAuth } from '@/navigation/after-auth';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Screen, TextField } from '@/ui';

import { useRegister } from '../hooks';

/** Create account (design §11 Auth): name, email, password via emailRegisterSchema. */
export function RegisterScreen({ navigation, route }: RootScreenProps<'Register'>) {
  const redirect = route.params?.redirect;
  const register = useRegister();
  const { control, handleSubmit, formState } = useForm<EmailRegister>({
    resolver: zodResolver(emailRegisterSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  function submit(values: EmailRegister) {
    register.mutate(values, { onSuccess: () => navigation.dispatch(afterAuth(redirect)) });
  }

  const error = register.isError ? userMessage(register.error) : '';

  return (
    <Screen scroll padded>
      <Text style={styles.heading} accessibilityRole="header">
        Create your account
      </Text>

      <TextField
        control={control}
        name="name"
        label="Full name"
        autoComplete="name"
        placeholder="Your name"
        error={formState.errors.name?.message}
      />
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
      <TextField
        control={control}
        name="password"
        label="Password"
        secureTextEntry
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={formState.errors.password?.message}
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
        onPress={handleSubmit(submit)}
        testID="register-submit"
        style={styles.submit}
      />

      <Text style={styles.legal}>
        By creating an account you agree to our{' '}
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
  error: { ...theme.typography.body, color: theme.colors.danger, marginTop: theme.spacing.sm },
  submit: { marginTop: theme.spacing.md },
  legal: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.lg },
  link: { color: theme.colors.primaryStrong, fontWeight: '700' },
});
