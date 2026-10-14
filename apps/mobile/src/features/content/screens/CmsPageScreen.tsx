import { useLayoutEffect } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { isApiError } from '@/api/errors';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCmsPage } from '../hooks';

/** CMS page (design §11): title + body paragraphs; 404 → "not available". Text is selectable. */
export function CmsPageScreen({ navigation, route }: RootScreenProps<'CmsPage'>) {
  const { slug } = route.params;
  const { data, isLoading, isError, error, refetch } = useCmsPage(slug);

  useLayoutEffect(() => {
    if (data?.title) navigation.setOptions({ title: data.title });
  }, [navigation, data?.title]);

  if (isLoading) {
    return (
      <Screen padded>
        <ListSkeleton rows={6} />
      </Screen>
    );
  }
  if (isError) {
    const notFound = isApiError(error) && error.status === 404;
    return (
      <Screen>
        {notFound ? (
          <EmptyState icon="file-remove-outline" title="This page is not available" />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </Screen>
    );
  }

  const paragraphs = (data?.body ?? '').split('\n').map((p) => p.trim()).filter(Boolean);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title} selectable accessibilityRole="header">
          {data?.title}
        </Text>
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.para} selectable>
            {p}
          </Text>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong },
  para: { ...theme.typography.body, color: theme.colors.ink, lineHeight: 22 },
});
