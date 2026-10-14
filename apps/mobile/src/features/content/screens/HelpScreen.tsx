import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCmsPages } from '../hooks';

/** Help (design §11): lists CMS pages; each opens the CmsPage screen. */
export function HelpScreen({ navigation }: RootScreenProps<'Help'>) {
  const { data, isLoading, isError, error, refetch } = useCmsPages();
  const pages = data ?? [];

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
  if (pages.length === 0) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="No help pages available" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        {pages.map((p) => (
          <Pressable
            key={p.slug}
            style={styles.row}
            onPress={() => navigation.navigate('CmsPage', { slug: p.slug })}
            accessibilityRole="button"
          >
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touch.minTouch,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { ...theme.typography.bodyLg, color: theme.colors.ink },
  chevron: { ...theme.typography.title, color: theme.colors.mutedSoft },
});
