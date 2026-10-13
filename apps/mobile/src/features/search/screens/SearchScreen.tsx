import type { ProductCardDto, ProductSort } from '@belzo/shared';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDebouncedValue } from '@/lib/debounce';
import type { RootScreenProps } from '@/navigation/types';
import { useRecentSearchesStore } from '@/store/recent-searches';
import { theme } from '@/theme';
import { Chip, EmptyState, ErrorState, ProductCard, Screen } from '@/ui';
import { SearchBar } from '@/ui/SearchBar';
import { ProductGridSkeleton } from '@/ui/Skeleton';

import { useAutocomplete, useSearchResults } from '../hooks';

const SEARCH_SORTS: { key: ProductSort; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'newest', label: 'Newest' },
  { key: 'popularity', label: 'Popularity' },
  { key: 'rating', label: 'Rating' },
];

function clampSort(sort: ProductSort | undefined): ProductSort {
  return SEARCH_SORTS.some((s) => s.key === sort) ? (sort as ProductSort) : 'relevance';
}

/** Search (design §11): 250 ms autocomplete, 400 ms results, recent searches, 4 sort chips. */
export function SearchScreen({ navigation, route }: RootScreenProps<'Search'>) {
  const [q, setQ] = useState(route.params?.q ?? '');
  const [submitted, setSubmitted] = useState(Boolean(route.params?.q));
  const [sort, setSort] = useState<ProductSort>(clampSort(route.params?.sort));

  const recent = useRecentSearchesStore();
  const autoQ = useDebouncedValue(q.trim(), 250);
  const resultsQ = useDebouncedValue(q.trim(), 400);

  const auto = useAutocomplete(autoQ);
  const results = useSearchResults(resultsQ, sort);
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);

  function selectTerm(term: string) {
    setQ(term);
    setSubmitted(true);
    recent.add(term);
  }

  const showSuggestions = !submitted && autoQ.length >= 2 && (auto.data?.length ?? 0) > 0;
  const onPressProduct = (p: ProductCardDto) =>
    navigation.navigate('ProductDetail', { idOrSlug: p.slug });

  return (
    <Screen>
      <View style={styles.header}>
        <SearchBar
          value={q}
          onChangeText={(t) => {
            setQ(t);
            setSubmitted(false);
          }}
          onSubmit={(t) => selectTerm(t)}
          autoFocus
          placeholder="Search products"
        />
      </View>

      {q.trim() === '' ? (
        <View style={styles.recent}>
          {recent.terms.length === 0 ? (
            <Text style={styles.muted}>Search for products, brands and more.</Text>
          ) : (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.recentTitle}>Recent searches</Text>
                <Pressable onPress={() => recent.clear()} accessibilityRole="button">
                  <Text style={styles.clear}>Clear</Text>
                </Pressable>
              </View>
              {recent.terms.map((t) => (
                <Pressable key={t} style={styles.recentRow} onPress={() => selectTerm(t)} accessibilityRole="button">
                  <Text style={styles.recentText}>{t}</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : showSuggestions ? (
        <View style={styles.suggestions} testID="search-suggestions">
          {(auto.data ?? []).map((s) => (
            <Pressable key={s} style={styles.suggestionRow} onPress={() => selectTerm(s)} accessibilityRole="button">
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.sortRow}>
            {SEARCH_SORTS.map((s) => (
              <Chip key={s.key} label={s.label} selected={s.key === sort} onPress={() => setSort(s.key)} />
            ))}
          </View>
          {results.isLoading ? (
            <ProductGridSkeleton count={6} />
          ) : results.isError ? (
            <ErrorState error={results.error} onRetry={() => void results.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon="magnify-close" title="No results found" body={`We couldn't find anything for "${resultsQ}".`} />
          ) : (
            <FlashList
              data={items}
              numColumns={2}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.grid}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
              }}
              renderItem={({ item }) => (
                <View style={styles.cell}>
                  <ProductCard product={item} onPress={() => onPressProduct(item)} />
                </View>
              )}
              ListFooterComponent={
                results.isFetchingNextPage ? (
                  <ActivityIndicator style={styles.footer} color={theme.colors.primaryStrong} />
                ) : null
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  recent: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentTitle: { ...theme.typography.title, color: theme.colors.inkStrong },
  clear: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  recentRow: { minHeight: theme.touch.minTouch, justifyContent: 'center' },
  recentText: { ...theme.typography.bodyLg, color: theme.colors.ink },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  suggestions: { paddingHorizontal: theme.spacing.lg },
  suggestionRow: {
    minHeight: theme.touch.minTouch,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  suggestionText: { ...theme.typography.bodyLg, color: theme.colors.ink },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, padding: theme.spacing.lg, paddingTop: 0 },
  grid: { padding: theme.spacing.sm },
  cell: { flex: 1, padding: theme.spacing.sm },
  footer: { paddingVertical: theme.spacing.lg },
});
