import { useFestivalStore } from './festival';
import { useRecentSearchesStore } from './recent-searches';
import { useRecentlyViewedStore } from './recently-viewed';

/** Rehydrates every persisted store from AsyncStorage (boot, design §2.5). */
export async function hydrateStores(): Promise<void> {
  await Promise.all([
    useFestivalStore.persist.rehydrate(),
    useRecentlyViewedStore.persist.rehydrate(),
    useRecentSearchesStore.persist.rehydrate(),
  ]);
}
