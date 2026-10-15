import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

import { theme } from '@/theme';

/**
 * Belzo Mart app mark: a crisp rounded-square badge with a shopping bag and an
 * orange accent. Icon-in-badge (not the ornate web emblem) so it stays sharp
 * and never clips at small sizes in the header.
 */
export function BelzoLogo({ size = 40 }: { size?: number }) {
  const radius = Math.round(size * 0.28);
  const dot = Math.max(6, Math.round(size * 0.16));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Belzo Mart"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: theme.colors.primaryStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name="shopping" size={Math.round(size * 0.54)} color="#ffffff" />
      <View
        style={{
          position: 'absolute',
          top: Math.round(size * 0.16),
          right: Math.round(size * 0.16),
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: theme.colors.orange,
        }}
      />
    </View>
  );
}
