import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, type ImageContentFit } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { resolveImageUrl } from '@/api/image-url';
import { theme } from '@/theme';

export interface RemoteImageProps {
  uri: string | null | undefined;
  width: DimensionValue;
  height: DimensionValue;
  contentFit?: ImageContentFit;
  /** Accessible description; omit for decorative images. */
  alt?: string;
  /** First letter is shown when the image is missing or fails to load. */
  fallbackLabel?: string;
  radius?: number;
}

/** expo-image with memory+disk cache, neutral placeholder and a lettered fallback (design §3.4). */
export function RemoteImage({
  uri,
  width,
  height,
  contentFit = 'cover',
  alt,
  fallbackLabel,
  radius = 0,
}: RemoteImageProps) {
  const resolved = resolveImageUrl(uri);
  const [failed, setFailed] = useState(false);
  const box = { width, height, borderRadius: radius };

  if (!resolved || failed) {
    const letter = fallbackLabel?.trim().charAt(0).toUpperCase();
    return (
      <View
        style={[styles.fallback, box]}
        accessible={Boolean(alt)}
        accessibilityRole={alt ? 'image' : undefined}
        accessibilityLabel={alt}
        testID="remote-image-fallback"
      >
        {letter ? (
          <Text style={styles.letter}>{letter}</Text>
        ) : (
          <MaterialCommunityIcons
            name="image-off-outline"
            size={24}
            color={theme.colors.mutedSoft}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.placeholder, box]}>
      <Image
        source={{ uri: resolved }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={resolved}
        transition={theme.motion.imageTransitionMs}
        accessible={Boolean(alt)}
        accessibilityLabel={alt}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: theme.colors.surface2, overflow: 'hidden' },
  fallback: {
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: { ...theme.typography.display, color: theme.colors.muted },
});
