import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { uploadImage } from '@/api/upload';
import { theme } from '@/theme';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';
import { useToast } from '@/ui/Toast';

const RETURN_UPLOAD_PATH = '/orders/returns/media/upload';

export interface ReturnPhotoPickerProps {
  images: string[];
  max: number;
  onChange: (images: string[]) => void;
}

/** Return photo picker (design §11): camera/library → normalise → upload; up to `max`. */
export function ReturnPhotoPicker({ images, max, onChange }: ReturnPhotoPickerProps) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const atLimit = images.length >= max;

  async function add(source: 'camera' | 'library') {
    if (atLimit || busy) return;
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          toast.show({ message: 'Allow camera access in Settings to take a photo.', tone: 'info' });
          void Linking.openSettings();
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets[0]) return;

      setBusy(true);
      const normalised = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      const uploaded = await uploadImage(RETURN_UPLOAD_PATH, normalised.uri);
      onChange([...images, uploaded.url]);
    } catch {
      toast.show({ message: 'Could not add that photo. Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.thumbs}>
        {images.map((uri, i) => (
          <View key={`${uri}-${i}`} style={styles.thumb}>
            <RemoteImage uri={uri} width={72} height={72} radius={theme.radius.sm} />
            <View style={styles.remove}>
              <IconButton
                icon="close-circle"
                label={`Remove photo ${i + 1}`}
                size={20}
                color={theme.colors.danger}
                onPress={() => onChange(images.filter((_, idx) => idx !== i))}
              />
            </View>
          </View>
        ))}
      </View>
      {!atLimit ? (
        <View style={styles.actions}>
          <Pressable style={styles.addBtn} onPress={() => add('camera')} disabled={busy} accessibilityRole="button">
            <Text style={styles.addText}>{busy ? 'Uploading…' : '📷 Camera'}</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => add('library')} disabled={busy} accessibilityRole="button">
            <Text style={styles.addText}>🖼 Library</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.limit}>Maximum {max} photos added.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  thumb: { position: 'relative' },
  remove: { position: 'absolute', top: -8, right: -8 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  addBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touch.minTouch,
    justifyContent: 'center',
  },
  addText: { ...theme.typography.body, color: theme.colors.ink },
  limit: { ...theme.typography.caption, color: theme.colors.muted },
});
