import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useEffect, useRef, type ReactElement, type ReactNode } from 'react';
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

import { useBottomInset } from '@/lib/use-bottom-inset';
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
  /**
   * 'auto' (default): keep the content above the system navigation bar (back/home buttons), so the last
   * button or list row is never hidden under it. 'none': the screen draws its own bottom bar and pads it
   * itself. Screens inside the bottom tabs need nothing: the tab bar already does it.
   */
  bottom?: 'auto' | 'none';
}

/** Room under the last item of a scrolling tab page, so the floating "View cart" pill never covers it. */
const TAB_PAGE_CLEARANCE = 130;

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
  clearance = 0,
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  padded: boolean;
  /** Extra room under the last item (the floating "View cart" pill sits over tab pages). */
  clearance?: number;
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
      testID="screen-scroll"
      contentContainerStyle={[
        padded && styles.padded,
        clearance > 0 && { paddingBottom: clearance },
        height > 0 && { paddingBottom: height + REVEAL_MARGIN },
      ]}
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
  bottom = 'auto',
}: ScreenProps) {
  const navBar = useBottomInset();
  // Inside the bottom tabs the tab bar already sits above the system buttons.
  const insideTabs = useContext(BottomTabBarHeightContext) !== undefined;
  const padBottom = bottom === 'none' || insideTabs || edges.includes('bottom') ? 0 : navBar;
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <OfflineBanner />
      <View style={[styles.fill, { paddingBottom: padBottom }]} testID="screen-body">
        {scroll ? (
          <KeyboardAwareScroll refreshControl={refreshControl} padded={padded} clearance={insideTabs ? TAB_PAGE_CLEARANCE : 0}>
            {children}
          </KeyboardAwareScroll>
        ) : (
          <View style={[styles.fill, padded && styles.padded]}>{children}</View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  fill: { flex: 1 },
  padded: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
});
