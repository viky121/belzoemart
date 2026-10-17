import { parseCmsBody } from '@belzo/shared';
import { useLayoutEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { isApiError } from '@/api/errors';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCmsPage } from '../hooks';

/**
 * CMS page (design §11): title + body. Body lines starting with "## " are section headings and
 * "- " are bullet points; the rest are paragraphs. A page an admin has switched off answers 404
 * and shows "not available". Text is selectable and never rendered as markup.
 */
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

  const blocks = parseCmsBody(data?.body ?? '');
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title} selectable accessibilityRole="header">
          {data?.title}
        </Text>
        {blocks.map((b, i) =>
          b.type === 'heading' ? (
            <Text key={i} style={styles.heading} selectable accessibilityRole="header">
              {b.text}
            </Text>
          ) : b.type === 'bullet' ? (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>{'\u2022'}</Text>
              <Text style={[styles.para, styles.bulletText]} selectable>
                {b.text}
              </Text>
            </View>
          ) : (
            <Text key={i} style={styles.para} selectable>
              {b.text}
            </Text>
          ),
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong },
  heading: { ...theme.typography.title, color: theme.colors.inkStrong, fontWeight: '800', marginTop: theme.spacing.sm },
  para: { ...theme.typography.body, color: theme.colors.ink, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', gap: theme.spacing.sm },
  bulletDot: { ...theme.typography.body, color: theme.colors.ink, lineHeight: 22 },
  bulletText: { flex: 1 },
});
