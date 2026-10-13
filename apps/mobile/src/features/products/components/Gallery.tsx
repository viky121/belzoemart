import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

const WIDTH = Dimensions.get('window').width;

export interface GalleryProps {
  images: string[];
  fallbackLabel: string;
  onOpenImage: (index: number) => void;
}

/** Paged product gallery; tapping an image opens the full-screen viewer (design §11). */
export function Gallery({ images, fallbackLabel, onOpenImage }: GalleryProps) {
  if (images.length === 0) {
    return (
      <RemoteImage uri={null} width={WIDTH} height={320} fallbackLabel={fallbackLabel} />
    );
  }
  return (
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
      {images.map((uri, i) => (
        <Pressable key={`${uri}-${i}`} onPress={() => onOpenImage(i)} accessibilityRole="imagebutton" accessibilityLabel={`${fallbackLabel} image ${i + 1}`}>
          <View style={styles.slide}>
            <RemoteImage uri={uri} width={WIDTH} height={320} contentFit="contain" />
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  slide: { width: WIDTH, height: 320, backgroundColor: theme.colors.surface },
});
