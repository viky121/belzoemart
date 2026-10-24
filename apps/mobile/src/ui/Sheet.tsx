import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '@/lib/use-bottom-inset';

import { theme } from '@/theme';

import { IconButton } from './IconButton';
import { keyboardOverlap } from './use-keyboard';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet built on RN Modal (no gesture-handler); back and scrim tap close it. */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const insets = useInsets();
  const panel = useRef<View>(null);
  const [lift, setLift] = useState(0);

  // Edge-to-edge: the keyboard can cover a Modal without resizing it, so lift the sheet by the overlap.
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      panel.current?.measureInWindow((_x, y, _w, h) => {
        const overlap = keyboardOverlap(y + h, keyboardTop);
        if (overlap > 0) setLift(overlap);
      });
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setLift(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => setLift(0)}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
        <View
          ref={panel}
          style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg, marginBottom: lift }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <IconButton icon="close" label={`Close ${title}`} onPress={onClose} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.overlay },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...theme.typography.title, color: theme.colors.inkStrong },
});
