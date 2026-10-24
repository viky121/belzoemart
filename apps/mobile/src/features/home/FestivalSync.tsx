import { msUntilNextIstDay, sanitizeMobileHome, type MobileHome } from '@belzo/shared';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useFestivalStore, type FestivalValues } from '@/store/festival';

import { useSettings } from './hooks';

/** Festival fields of the admin config, in the shape the festival store keeps. */
export function festivalValuesFrom(home: MobileHome): FestivalValues {
  return {
    festival: home.festival,
    greeting: home.festivalGreeting,
    decor: home.festivalDecor,
    start: home.festivalStart,
    end: home.festivalEnd,
  };
}

/**
 * Keeps the persisted festival theme in step with the server, and re-checks its
 * start/end dates when the app returns to the foreground and at midnight (India time)
 * while it stays open.
 *
 * It only reacts to a successful settings response: while loading or offline the last
 * known festival (persisted) stays, so the app never flickers back to the normal look.
 */
export function FestivalSync() {
  const { data } = useSettings();

  useEffect(() => {
    if (!data) return;
    useFestivalStore.getState().apply(festivalValuesFrom(sanitizeMobileHome(data.mobileHome)));
  }, [data]);

  useEffect(() => {
    const tick = () => useFestivalStore.getState().tick();
    tick();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      // +1s so we land just after midnight.
      timer = setTimeout(() => {
        tick();
        arm();
      }, msUntilNextIstDay() + 1000);
    };
    arm();
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  return null;
}
