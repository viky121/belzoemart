import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { theme } from '@/theme';

import { OfflineBanner } from './OfflineBanner';
import { keyboardOverlap, useKeyboard } from './use-keyboard';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Safe-area edges; SDK 57 enforces edge-to-edge. Default: top, left, right. */
  edges?: Edge[];
  padded?: boolean;
}

/** Space kept between the field being typed in and the top of the keyboard. */
const REVEAL_MARGIN = 24;

/**
 * Scrolling form body that keeps the focused text field above the keyboard. When the keyboard opens,
 * or the focus moves to another field while it is open, the page scrolls so that field is visible,
 * and there is extra room at the bottom so the last field can be lifted too.
 */
function KeyboardAwareScroll({
  children,
  refreshControl,
  padded,
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  padded: boolean;
}) {
  const scroller = useRef<ScrollView>(null);
  const offsetY = useRef(0);
  const { height, top } = useKeyboard();

  useEffect(() => {
    if (height === 0) return;
    let revealed: unknown = null;
    const reveal = () => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input || input === revealed) return;
      revealed = input;
      input.measureInWindow((_x, y, _w, h) => {
        const overlap = keyboardOverlap(y + h, top, REVEAL_MARGIN);
        if (overlap > 0) scroller.current?.scrollTo({ y: offsetY.current + overlap, animated: true });
      });
    };
    const first = setTimeout(reveal, 80);
    // Moving to the next field does not fire another keyboard event, so look for a new focus now and then.
    const poll = setInterval(reveal, 250);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [height, top]);

  return (
    <ScrollView
      ref={scroller}
      contentContainerStyle={[padded && styles.padded, height > 0 && { paddingBottom: height + REVEAL_MARGIN }]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offsetY.current = e.nativeEvent.contentOffset.y;
      }}
    >
      {children}
    </ScrollView>
  );
}

export function Screen({
  children,
  scroll = false,
  refreshControl,
  edges = ['top', 'left', 'right'],
  padded = false,
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <OfflineBanner />
      {scroll ? (
        <KeyboardAwareScroll refreshControl={refreshControl} padded={padded}>
          {children}
        </KeyboardAwareScroll>
      ) : (
        <View style={[styles.fill, padded && styles.padded]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  fill: { flex: 1 },
  padded: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
});
