import type { ProductCardDto, ProductSort } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCardCart } from '@/features/cart/use-card-cart';
import { useDebouncedValue } from '@/lib/debounce';
import type { RootScreenProps } from '@/navigation/types';
import { useRecentSearchesStore } from '@/store/recent-searches';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { Chip, EmptyState, ErrorState, ProductGridCard, Screen, useGridColumns } from '@/ui';
import { SearchBar } from '@/ui/SearchBar';
import { ProductGridSkeleton } from '@/ui/Skeleton';

import { logSearch } from '../api';
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
  const brand = useBrand();
  const [q, setQ] = useState(route.params?.q ?? '');
  const [submitted, setSubmitted] = useState(Boolean(route.params?.q));
  const [sort, setSort] = useState<ProductSort>(clampSort(route.params?.sort));

  const cardCart = useCardCart();
  // Three products in a row (two on a very narrow phone or with very large text).
  const cols = useGridColumns();
  const recent = useRecentSearchesStore();
  const autoQ = useDebouncedValue(q.trim(), 250);
  const resultsQ = useDebouncedValue(q.trim(), 400);

  const auto = useAutocomplete(autoQ);
  const results = useSearchResults(resultsQ, sort);
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);

  // Opened with a keyword already chosen (for example the brand link on a product page): that is a search too.
  const startQ = route.params?.q;
  useEffect(() => {
    if (startQ) logSearch(startQ);
  }, [startQ]);

  function selectTerm(term: string) {
    setQ(term);
    setSubmitted(true);
    recent.add(term);
    logSearch(term);
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
            <View style={styles.hint}>
              <View style={[styles.hintIcon, { backgroundColor: brand.primaryBg }]}>
                <MaterialCommunityIcons name="magnify" size={34} color={brand.primary} />
              </View>
              <Text style={styles.hintTitle}>What are you looking for?</Text>
              <Text style={styles.muted}>Search for products, brands and more.</Text>
            </View>
          ) : (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.recentTitle}>Recent searches</Text>
                <Pressable onPress={() => recent.clear()} accessibilityRole="button">
                  <Text style={[styles.clear, { color: brand.primary }]}>Clear</Text>
                </Pressable>
              </View>
              {recent.terms.map((t) => (
                <Pressable key={t} style={styles.recentRow} onPress={() => selectTerm(t)} accessibilityRole="button">
                  <MaterialCommunityIcons name="history" size={18} color={theme.colors.mutedSoft} />
                  <Text style={styles.recentText}>{t}</Text>
                  <MaterialCommunityIcons name="arrow-top-left" size={18} color={theme.colors.mutedSoft} />
                </Pressable>
              ))}
            </>
          )}
        </View>
      ) : showSuggestions ? (
        <View style={styles.suggestions} testID="search-suggestions">
          {(auto.data ?? []).map((s) => (
            <Pressable key={s} style={styles.suggestionRow} onPress={() => selectTerm(s)} accessibilityRole="button">
              <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.mutedSoft} />
              <Text style={styles.suggestionText}>{s}</Text>
              <MaterialCommunityIcons name="arrow-top-left" size={18} color={theme.colors.mutedSoft} />
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
              key={cols}
          numColumns={cols}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.grid}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
              }}
              renderItem={({ item }) => (
                <View style={cols === 3 ? styles.cell3 : styles.cell}>
                  <ProductGridCard
                    dense={cols === 3}
                    product={item}
                    onPress={() => onPressProduct(item)}
                    {...cardCart.cardProps(item)}
                  />
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
  header: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    marginBottom: theme.spacing.sm,
  },
  recent: { padding: theme.spacing.lg, gap: theme.spacing.xs },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentTitle: { ...theme.typography.title, color: theme.colors.inkStrong },
  clear: { ...theme.typography.body, fontWeight: '700' },
  recentRow: {
    minHeight: theme.touch.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  recentText: { ...theme.typography.bodyLg, color: theme.colors.ink, flex: 1 },
  hint: { alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xxl },
  hintIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  hintTitle: { ...theme.typography.title, color: theme.colors.inkStrong },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  suggestions: { paddingHorizontal: theme.spacing.lg },
  suggestionRow: {
    minHeight: theme.touch.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  suggestionText: { ...theme.typography.bodyLg, color: theme.colors.ink, flex: 1 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, padding: theme.spacing.lg, paddingTop: 0 },
  grid: { padding: theme.spacing.sm },
  cell: { flex: 1, padding: theme.spacing.sm },
  cell3: { flex: 1, padding: 3 },
  footer: { paddingVertical: theme.spacing.lg },
});
