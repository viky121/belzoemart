import { useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { RemoteImage } from '@/ui/RemoteImage';

const WIDTH = Dimensions.get('window').width;
const HEIGHT = 380;

export interface GalleryProps {
  images: string[];
  fallbackLabel: string;
  onOpenImage: (index: number) => void;
}

/** Full-bleed paged product gallery with rounded bottom corners, page dots and a "1/4" counter; tap opens the viewer. */
export function Gallery({ images, fallbackLabel, onOpenImage }: GalleryProps) {
  const brand = useBrand();
  const [page, setPage] = useState(0);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / WIDTH));

  if (images.length === 0) {
    return (
      <View style={[styles.frame, styles.slide]}>
        <RemoteImage uri={null} width={WIDTH} height={HEIGHT} fallbackLabel={fallbackLabel} />
      </View>
    );
  }
  return (
    <View style={styles.frame}>
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
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {page + 1}/{images.length}
            </Text>
          </View>
          <View style={styles.dots} pointerEvents="none">
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && [styles.dotOn, { backgroundColor: brand.primary }]]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  slide: { width: WIDTH, height: HEIGHT, backgroundColor: theme.colors.surface },
  counter: {
    position: 'absolute',
    right: 14,
    bottom: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  counterText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: theme.colors.white },
  dots: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.slate },
  dotOn: { width: 18 },
});
