import { useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';

const WIDTH = Dimensions.get('window').width;

/** Full-screen image viewer (design §11): paged, with a page indicator. No pinch zoom. */
export function ImageViewerScreen({ navigation, route }: RootScreenProps<'ImageViewer'>) {
  const { images, index } = route.params;
  const [page, setPage] = useState(index);

  return (
    <View style={styles.root}>
      <FlatList
        horizontal
        pagingEnabled
        data={images}
        initialScrollIndex={Math.min(index, Math.max(0, images.length - 1))}
        getItemLayout={(_, i) => ({ length: WIDTH, offset: WIDTH * i, index: i })}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / WIDTH))}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <RemoteImage uri={item} width={WIDTH} height="100%" contentFit="contain" />
          </View>
        )}
      />
      <SafeAreaView style={styles.top} edges={['top']}>
        <IconButton icon="close" label="Close" onPress={() => navigation.goBack()} color={theme.colors.white} />
      </SafeAreaView>
      {images.length > 1 ? (
        <SafeAreaView style={styles.bottom} edges={['bottom']}>
          <Text style={styles.counter}>
            {page + 1} / {images.length}
          </Text>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  slide: { width: WIDTH, height: '100%', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: theme.spacing.sm },
  bottom: { position: 'absolute', bottom: theme.spacing.lg, alignSelf: 'center' },
  counter: { ...theme.typography.body, color: theme.colors.white, fontWeight: '700' },
});
