import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { userMessage } from '@/api/errors';
import { uploadImage } from '@/api/upload';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { RemoteImage } from '@/ui/RemoteImage';
import { useToast } from '@/ui/Toast';

import { useProfile, useUpdateProfile } from '../hooks';

const PROFILE_UPLOAD_PATH = '/me/photo/upload';
const SIZE = 96;

/** Two initials (or one) from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts[0]!.charAt(0) + (parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '')).toUpperCase();
}

/**
 * Round profile picture with a camera badge. Tapping the buttons picks a photo (camera or
 * gallery), shrinks it, uploads it and saves the URL on the profile straight away.
 */
export function ProfilePhoto() {
  const brand = useBrand();
  const toast = useToast();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [busy, setBusy] = useState(false);

  const name = profile && profile.name !== 'Belzo Customer' ? profile.name : '';

  async function pick(source: 'camera' | 'library') {
    if (busy) return;
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          toast.show({ message: 'Allow camera access in Settings to take a photo.', tone: 'info' });
          void Linking.openSettings();
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      setBusy(true);
      const normalised = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      const uploaded = await uploadImage(PROFILE_UPLOAD_PATH, normalised.uri);
      await update.mutateAsync({ photoUrl: uploaded.url });
      toast.show({ message: 'Profile photo updated' });
    } catch (e) {
      // Say what went wrong (too large, not signed in, no network) instead of a blind "try again".
      toast.show({ message: userMessage(e) || 'Could not update the photo. Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.avatar, { borderColor: brand.primaryBg }]}>
        {profile?.photoUrl ? (
          <RemoteImage
            uri={profile.photoUrl}
            width={SIZE}
            height={SIZE}
            radius={SIZE / 2}
            alt="Profile photo"
            fallbackLabel={name}
          />
        ) : name ? (
          <Text style={[styles.initials, { color: brand.primary }]}>{initialsOf(name)}</Text>
        ) : (
          <MaterialCommunityIcons name="account" size={48} color={brand.primary} />
        )}
        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={theme.colors.white} />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => void pick('library')}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Choose profile photo from gallery"
          style={[styles.btn, { backgroundColor: brand.primaryBg }]}
        >
          <MaterialCommunityIcons name="image-outline" size={16} color={brand.primary} />
          <Text style={[styles.btnText, { color: brand.primary }]}>Gallery</Text>
        </Pressable>
        <Pressable
          onPress={() => void pick('camera')}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Take a profile photo with the camera"
          style={[styles.btn, { backgroundColor: brand.primaryBg }]}
        >
          <MaterialCommunityIcons name="camera-outline" size={16} color={brand.primary} />
          <Text style={[styles.btnText, { color: brand.primary }]}>Camera</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  avatar: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  busy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  btnText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
