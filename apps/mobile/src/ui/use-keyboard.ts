import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export interface KeyboardState {
  /** Height of the on-screen keyboard in px; 0 while it is hidden. */
  height: number;
  /** Where the keyboard's top edge is, in screen coordinates; 0 while it is hidden. */
  top: number;
}

const HIDDEN: KeyboardState = { height: 0, top: 0 };

/**
 * Tracks the on-screen keyboard. The app draws edge-to-edge, so on Android the system often does
 * NOT shrink the window for the keyboard; screens use this to keep the field being typed in visible.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>(HIDDEN);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setState({ height: e.endCoordinates.height, top: e.endCoordinates.screenY }),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setState(HIDDEN),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return state;
}

/** How far (px) something whose bottom edge is at `bottom` is covered by a keyboard whose top is at `keyboardTop`. */
export function keyboardOverlap(bottom: number, keyboardTop: number, margin = 0): number {
  if (keyboardTop <= 0) return 0;
  return Math.max(0, bottom + margin - keyboardTop);
}
