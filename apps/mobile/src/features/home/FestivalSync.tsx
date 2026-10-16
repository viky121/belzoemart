import { sanitizeMobileHome, type MobileHome } from '@belzo/shared';
import { useEffect } from 'react';

import { useFestivalStore, type FestivalValues } from '@/store/festival';

import { useSettings } from './hooks';

/** Festival fields of the admin config, in the shape the festival store keeps. */
export function festivalValuesFrom(home: MobileHome): FestivalValues {
  return { festival: home.festival, greeting: home.festivalGreeting, decor: home.festivalDecor };
}

/**
 * Keeps the persisted festival theme in step with the server. It only reacts to a
 * successful settings response — while loading or offline the last known festival
 * (persisted) stays, so the app never flickers back to the normal look.
 */
export function FestivalSync() {
  const { data } = useSettings();
  useEffect(() => {
    if (!data) return;
    useFestivalStore.getState().apply(festivalValuesFrom(sanitizeMobileHome(data.mobileHome)));
  }, [data]);
  return null;
}
