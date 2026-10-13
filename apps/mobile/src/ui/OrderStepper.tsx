import { formatDateTime, type Step, type StepState } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

const DOT: Record<StepState, string> = {
  done: theme.colors.brandStrong,
  current: theme.colors.primaryStrong,
  upcoming: theme.colors.slate,
  terminal: theme.colors.danger,
};

const STATE_LABEL: Record<StepState, string> = {
  done: 'completed',
  current: 'current',
  upcoming: 'upcoming',
  terminal: 'stopped',
};

/** Vertical stepper from the shared `buildStepper` output. */
export function OrderStepper({ steps }: { steps: Step[] }) {
  return (
    <View accessibilityRole="list">
      {steps.map((s, i) => {
        const at = formatDateTime(s.at);
        const last = i === steps.length - 1;
        return (
          <View
            key={s.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${s.label}, ${STATE_LABEL[s.state]}${at ? `, ${at}` : ''}`}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: DOT[s.state] }]} />
              {!last ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, s.state === 'upcoming' && styles.upcoming]}>
                {s.label}
              </Text>
              {at ? <Text style={styles.at}>{at}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', minHeight: 48 },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { flex: 1, width: 2, backgroundColor: theme.colors.border },
  text: { flex: 1, paddingBottom: theme.spacing.md },
  label: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '700' },
  upcoming: { color: theme.colors.muted, fontWeight: '400' },
  at: { ...theme.typography.caption, color: theme.colors.muted },
});
