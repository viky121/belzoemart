import {
  festivalGreeting,
  getFestivalTheme,
  isFestivalActiveOnDay,
  type FestivalMotif,
  type MobileFestival,
} from '@belzo/shared';
import { useMemo } from 'react';

import { useFestivalStore } from '@/store/festival';

import { colors } from './tokens';

export interface Brand {
  /** True while a festival theme is on. */
  active: boolean;
  festival: MobileFestival;
  /** Buttons, active tab, links, selected states. */
  primary: string;
  primaryBg: string;
  headerFrom: string;
  headerTo: string;
  accent: string;
  /** Pastel tones cycled through category circles. */
  tints: readonly string[];
  motifs: readonly FestivalMotif[];
  greeting: string;
  greetingLocal: string;
  /** Show falling decorations (admin choice; the UI additionally honours reduce-motion). */
  decor: boolean;
}

/** Category-circle tones when no festival is active (the app's original palette). */
const DEFAULT_TINTS = [
  '#e4f3ec',
  '#fdeee4',
  '#e7f0ff',
  '#f3e8ff',
  '#e2f7ff',
  '#fff2d9',
  '#ffe3ec',
  '#e9fbf3',
] as const;

/**
 * The current brand colours. With no festival these are EXACTLY the app's normal
 * tokens (so nothing changes visually); with a festival they come from the shared
 * festival palette. Components read colours from here instead of hard-wiring them.
 */
export function useBrand(): Brand {
  const chosen = useFestivalStore((s) => s.festival);
  const customGreeting = useFestivalStore((s) => s.greeting);
  const decor = useFestivalStore((s) => s.decor);
  const start = useFestivalStore((s) => s.start);
  const end = useFestivalStore((s) => s.end);
  // Changes when the India date rolls over, so the schedule is re-evaluated.
  const day = useFestivalStore((s) => s.day);

  return useMemo<Brand>(() => {
    // Outside its start/end dates the festival is simply off: the normal look.
    const festival: MobileFestival = isFestivalActiveOnDay(
      { festival: chosen, festivalStart: start, festivalEnd: end },
      day,
    )
      ? chosen
      : 'none';
    if (festival === 'none') {
      return {
        active: false,
        festival,
        primary: colors.primaryStrong,
        primaryBg: colors.primaryBg,
        headerFrom: colors.primaryStrong,
        headerTo: colors.primaryDeep,
        accent: colors.orange,
        tints: DEFAULT_TINTS,
        motifs: [],
        greeting: '',
        greetingLocal: '',
        decor: false,
      };
    }
    const t = getFestivalTheme(festival);
    return {
      active: true,
      festival,
      primary: t.primary,
      primaryBg: t.primaryBg,
      headerFrom: t.headerFrom,
      headerTo: t.headerTo,
      accent: t.accent,
      tints: t.tints,
      motifs: t.motifs,
      greeting: festivalGreeting(festival, customGreeting),
      greetingLocal: t.greetingLocal,
      decor,
    };
  }, [chosen, customGreeting, decor, start, end, day]);
}
