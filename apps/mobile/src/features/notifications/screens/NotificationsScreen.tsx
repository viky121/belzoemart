import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { useMarkRead, useNotifications } from '../hooks';

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Notifications (design §11): list with unread dots; marks unread read on focus. */
export function NotificationsScreen() {
  const { data, isLoading, isError, error, refetch } = useNotifications();
  const markRead = useMarkRead();
  const items = data ?? [];

  useFocusEffect(
    useCallback(() => {
      const unread = items.filter((n) => n.readAt === null).map((n) => n.id).slice(0, 100);
      if (unread.length > 0) markRead.mutate(unread);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]),
  );

  if (isLoading) {
    return (
      <Screen>
        <ListSkeleton rows={5} />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState icon="bell-outline" title="No notifications" body="Updates about your orders show up here." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        {items.map((n) => (
          <View key={n.id} style={styles.row}>
            <View style={[styles.dot, n.readAt === null ? styles.unread : styles.read]} />
            <View style={styles.flex}>
              <Text style={styles.title}>{n.title}</Text>
              {n.body ? <Text style={styles.bodyText}>{n.body}</Text> : null}
              <Text style={styles.time}>{relativeTime(n.createdAt)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  unread: { backgroundColor: theme.colors.primaryStrong },
  read: { backgroundColor: 'transparent' },
  flex: { flex: 1 },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  bodyText: { ...theme.typography.body, color: theme.colors.ink },
  time: { ...theme.typography.caption, color: theme.colors.muted },
});
