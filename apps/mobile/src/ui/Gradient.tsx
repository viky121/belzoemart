import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** A diagonal two-stop gradient background (via react-native-svg; no native dep). */
export function Gradient({
  colors,
  style,
  children,
}: {
  colors: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  // Unique id per instance so multiple gradients don't collide.
  const [id] = useState(() => `grad-${Math.random().toString(36).slice(2)}`);
  return (
    <View style={style}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
