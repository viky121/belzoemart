import { PASSWORD_RULES } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

/** Live checklist of the password rules: capital letter, small letter, symbol, 8+ characters. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <View style={styles.wrap} accessibilityLabel="Password rules" testID="password-rules">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        return (
          <View key={r.key} style={styles.row} testID={`pw-rule-${r.key}`} accessibilityState={{ checked: ok }}>
            <MaterialCommunityIcons
              name={ok ? 'check-circle' : 'circle-outline'}
              size={16}
              color={ok ? theme.colors.brandStrong : theme.colors.mutedSoft}
            />
            <Text style={[styles.text, ok && styles.ok]}>{r.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginBottom: theme.spacing.md, marginTop: -theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  text: { ...theme.typography.caption, color: theme.colors.muted },
  ok: { color: theme.colors.brandStrong, fontWeight: '600' },
});
