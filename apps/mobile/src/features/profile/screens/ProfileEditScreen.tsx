import { profilePatchSchema } from '@belzo/shared';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { userMessage } from '@/api/errors';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Chip, Screen } from '@/ui';
import { useToast } from '@/ui/Toast';

import type { ProfilePatch } from '../api';
import { useProfile, useUpdateProfile } from '../hooks';

interface Fields {
  name: string;
  email: string;
  phone: string;
  gender: string;
  locale: 'en' | 'hi';
}

const EMPTY: Fields = { name: '', email: '', phone: '', gender: '', locale: 'en' };

/** Edit profile (design §11): add/change name, email, phone, gender, locale. */
export function ProfileEditScreen({ navigation }: RootScreenProps<'ProfileEdit'>) {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate once from the loaded profile (render-time, guarded).
  if (profile && !hydrated) {
    setHydrated(true);
    setFields({
      name: profile.name === 'Belzo Customer' ? '' : profile.name,
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      gender: profile.gender ?? '',
      locale: profile.locale === 'hi' ? 'hi' : 'en',
    });
  }

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    setError(null);
    const patch: ProfilePatch = {};
    const name = fields.name.trim();
    const email = fields.email.trim();
    const phone = fields.phone.trim();
    const gender = fields.gender.trim();
    if (name && name !== profile?.name) patch.name = name;
    if (email && email !== (profile?.email ?? '')) patch.email = email;
    if (phone && phone !== (profile?.phone ?? '')) patch.phone = phone;
    if (gender && gender !== (profile?.gender ?? '')) patch.gender = gender;
    if (fields.locale !== profile?.locale) patch.locale = fields.locale;

    if (Object.keys(patch).length === 0) {
      navigation.goBack();
      return;
    }
    const parsed = profilePatchSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the details.');
      return;
    }
    update.mutate(parsed.data, {
      onSuccess: () => {
        toast.show({ message: 'Profile updated' });
        navigation.goBack();
      },
      onError: (e) => setError(userMessage(e) || 'Could not update profile.'),
    });
  }

  return (
    <Screen scroll padded>
      <Field label="Full name" value={fields.name} onChange={(v) => set('name', v)} placeholder="Your name" />
      <Field label="Email" value={fields.email} onChange={(v) => set('email', v)} placeholder="you@example.com" keyboardType="email-address" />
      <Field label="Phone" value={fields.phone} onChange={(v) => set('phone', v)} placeholder="10-digit mobile" keyboardType="phone-pad" />
      <Field label="Gender (optional)" value={fields.gender} onChange={(v) => set('gender', v)} placeholder="e.g. Female" />

      <Text style={styles.label}>Language</Text>
      <View style={styles.chips}>
        <Chip label="English" selected={fields.locale === 'en'} onPress={() => set('locale', 'en')} />
        <Chip label="हिंदी" selected={fields.locale === 'hi'} onPress={() => set('locale', 'hi')} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Save profile" fullWidth loading={update.isPending} onPress={submit} style={styles.submit} testID="profile-save" />
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'email-address' | 'phone-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: theme.spacing.md },
  label: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '500', marginBottom: theme.spacing.xs },
  input: {
    minHeight: theme.touch.minTouch,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.typography.bodyLg,
  },
  chips: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  error: { ...theme.typography.body, color: theme.colors.danger, marginBottom: theme.spacing.sm },
  submit: { marginTop: theme.spacing.md },
});
