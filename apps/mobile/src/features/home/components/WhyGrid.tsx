import type { WhyItem } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { SectionHeader } from '@/ui/SectionHeader';

export interface WhyGridProps {
  items: WhyItem[];
}

/** "Why shop with us" value props from merged home content (design §11 Home). */
export function WhyGrid({ items }: WhyGridProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title="Why shop with Belzo" />
      <View style={styles.list}>
        {items.map((w, i) => (
          <View key={`${w.title}-${i}`} style={styles.row}>
            <Text style={styles.icon}>{w.icon}</Text>
            <View style={styles.flex}>
              <Text style={styles.title}>{w.title}</Text>
              {w.sub ? <Text style={styles.sub}>{w.sub}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: theme.spacing.md },
  list: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  icon: { fontSize: 24, width: 32, textAlign: 'center' },
  flex: { flex: 1 },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
});
