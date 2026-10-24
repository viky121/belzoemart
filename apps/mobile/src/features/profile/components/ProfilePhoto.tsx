import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { isApiError, userMessage } from '@/api/errors';
import { uploadImage } from '@/api/upload';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { RemoteImage } from '@/ui/RemoteImage';
import { useToast } from '@/ui/Toast';

import { uploadProfilePhoto } from '../api';
import { useProfile, useUpdateProfile } from '../hooks';

const PROFILE_UPLOAD_PATH = '/me/photo/upload';
const SIZE = 96;

/** Two initials (or one) from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts[0]!.charAt(0) + (parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '')).toUpperCase();
}

/** Widths tried in turn until the picture fits in one JSON request (a profile picture shows at 96 px). */
const WIDTHS = [600, 400, 256];
/** The JSON request limit is 1 MB; stay well inside it. */
const MAX_BASE64_CHARS = 900_000;

/** Shrinks the picked picture and returns it as base64 JPEG text. */
async function prepare(uri: string): Promise<string> {
  for (const width of WIDTHS) {
    const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (out.base64 && out.base64.length <= MAX_BASE64_CHARS) return out.base64;
  }
  throw new Error('The picture is too large');
}

/** Upload as JSON; if this server does not have that route yet, fall back to the file upload route. */
async function upload(uri: string, base64: string): Promise<{ url: string }> {
  try {
    return await uploadProfilePhoto(base64);
  } catch (e) {
    if (isApiError(e) && e.kind === 'http' && (e.status === 404 || e.status === 405)) {
      return uploadImage(PROFILE_UPLOAD_PATH, uri);
    }
    throw e;
  }
}

/** Plain words for whatever went wrong, saying WHICH step failed (a blind "you're offline" hid the real cause). */
function failureMessage(stage: 'open' | 'prepare' | 'upload' | 'save', e: unknown): string {
  if (isApiError(e)) return userMessage(e) || 'Could not update the photo. Please try again.';
  const detail = e instanceof Error && e.message ? ` (${e.message})` : '';
  switch (stage) {
    case 'open':
      return `Could not open your photos${detail}`;
    case 'prepare':
      return `Could not read that picture. Please choose another one${detail}`;
    case 'upload':
      return `Could not send the picture${detail}`;
    default:
      return `Could not save the picture${detail}`;
  }
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
    let stage: 'open' | 'prepare' | 'upload' | 'save' = 'open';
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
      const picked = result.assets[0].uri;
      setBusy(true);
      stage = 'prepare';
      const base64 = await prepare(picked);
      stage = 'upload';
      const uploaded = await upload(picked, base64);
      stage = 'save';
      await update.mutateAsync({ photoUrl: uploaded.url });
      toast.show({ message: 'Profile photo updated' });
    } catch (e) {
      toast.show({ message: failureMessage(stage, e), tone: 'error' });
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
