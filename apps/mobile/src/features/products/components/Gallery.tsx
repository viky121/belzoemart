import { useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

const WIDTH = Dimensions.get('window').width;
const HEIGHT = 380;

export interface GalleryProps {
  images: string[];
  fallbackLabel: string;
  onOpenImage: (index: number) => void;
}

/** Full-bleed paged product gallery with page dots; tap opens the full-screen viewer. */
export function Gallery({ images, fallbackLabel, onOpenImage }: GalleryProps) {
  const [page, setPage] = useState(0);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / WIDTH));

  if (images.length === 0) {
    return (
      <View style={styles.slide}>
        <RemoteImage uri={null} width={WIDTH} height={HEIGHT} fallbackLabel={fallbackLabel} />
      </View>
    );
  }
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
      >
        {images.map((uri, i) => (
          <Pressable
            key={`${uri}-${i}`}
            onPress={() => onOpenImage(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${fallbackLabel} image ${i + 1}`}
          >
            <View style={styles.slide}>
              <RemoteImage uri={uri} width={WIDTH} height={HEIGHT} contentFit="contain" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {images.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {images.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { width: WIDTH, height: HEIGHT, backgroundColor: theme.colors.surface2 },
  dots: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.slate },
  dotOn: { width: 16, backgroundColor: theme.colors.primaryStrong },
});
