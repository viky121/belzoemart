import { formatDateTime, type ReconciledTracking } from '@belzo/shared';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface TrackingTimelineProps {
  tracking: ReconciledTracking;
}

/** Shipment tracking (design §11 OrderDetail): courier, AWB, events newest-first. */
export function TrackingTimeline({ tracking }: TrackingTimelineProps) {
  if (tracking.shipments.length === 0) {
    return <Text style={styles.pending}>Your order will be shipped soon.</Text>;
  }
  return (
    <View style={styles.wrap}>
      {tracking.shipments.map((s) => (
        <View key={s.id} style={styles.shipment}>
          <View style={styles.head}>
            <Text style={styles.courier}>{s.courier ?? 'Courier'}</Text>
            {s.awb ? <Text style={styles.awb}>AWB {s.awb}</Text> : null}
          </View>
          {s.trackingUrl && /^https?:\/\//.test(s.trackingUrl) ? (
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(s.trackingUrl as string)} accessibilityRole="link">
              <Text style={styles.link}>Track on courier site</Text>
            </Pressable>
          ) : null}
          {s.estimatedDelivery ? (
            <Text style={styles.eta}>Estimated delivery: {formatDateTime(s.estimatedDelivery)}</Text>
          ) : null}
          <View style={styles.events}>
            {s.events.map((e, i) => (
              <View key={`${s.id}-${i}`} style={styles.event}>
                <View style={styles.rail}>
                  <View style={[styles.dot, i === 0 && styles.dotActive]} />
                  {i < s.events.length - 1 ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.eventText}>
                  <Text style={styles.eventLabel}>{e.label}</Text>
                  {e.description && e.description !== e.label ? <Text style={styles.eventDesc}>{e.description}</Text> : null}
                  <Text style={styles.eventMeta}>
                    {[e.location, e.occurredAt ? formatDateTime(e.occurredAt) : 'Time not available'].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.md },
  pending: { ...theme.typography.body, color: theme.colors.muted },
  shipment: { gap: theme.spacing.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  courier: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  awb: { ...theme.typography.caption, color: theme.colors.muted },
  link: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '600' },
  eta: { ...theme.typography.caption, color: theme.colors.muted },
  events: { marginTop: theme.spacing.sm },
  event: { flexDirection: 'row', minHeight: 44 },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.slate, marginTop: 4 },
  dotActive: { backgroundColor: theme.colors.brandStrong },
  line: { flex: 1, width: 2, backgroundColor: theme.colors.border },
  eventText: { flex: 1, paddingBottom: theme.spacing.sm },
  eventLabel: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '600' },
  eventDesc: { ...theme.typography.caption, color: theme.colors.ink },
  eventMeta: { ...theme.typography.caption, color: theme.colors.muted },
});
