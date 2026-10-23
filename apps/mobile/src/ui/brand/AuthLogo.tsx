import { StyleSheet, View } from 'react-native';

import { theme } from '@/theme';

import { BelzoLogo } from './BelzoLogo';

/** Centered brand logo for the top of sign-in / sign-up / verify screens. */
export function AuthLogo({ size = 88 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <BelzoLogo size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: theme.spacing.md },
});
