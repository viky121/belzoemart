import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { theme } from '@/theme';

/**
 * "Belzo eMart" in the colours of the logo lettering: "Belzo" navy, "eMart" orange.
 * Put it on a light background (the festive header and the menu use a white pill for that).
 */
export function BrandWordmark({ size = 22, style }: { size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[styles.base, { fontSize: size, lineHeight: Math.round(size * 1.25) }, style]}
      accessibilityLabel="Belzo eMart"
      numberOfLines={1}
    >
      <Text style={styles.navy}>Belzo </Text>
      <Text style={styles.orange}>eMart</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontWeight: '800' },
  navy: { color: theme.colors.logoNavy },
  orange: { color: theme.colors.logoOrange },
});
