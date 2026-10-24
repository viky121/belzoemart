import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface RadioRowProps {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function RadioRow({
  label,
  description,
  selected,
  onPress,
  disabled = false,
}: RadioRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={description ? `${label}, ${description}` : label}
      accessibilityState={{ checked: selected, selected, disabled }}
      style={styles.row}
    >
      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={24}
        color={
          disabled
            ? theme.colors.mutedSoft
            : selected
              ? theme.colors.primaryStrong
              : theme.colors.muted
        }
      />
      <View style={styles.text}>
        <Text style={[styles.label, disabled && styles.disabled]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touch.minTouch,
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  text: { flex: 1 },
  label: { ...theme.typography.bodyLg, color: theme.colors.ink },
  disabled: { color: theme.colors.mutedSoft },
  description: { ...theme.typography.caption, color: theme.colors.muted },
});
