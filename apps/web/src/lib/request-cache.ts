import * as React from 'react';

type Memoizer = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;

const identity: Memoizer = (fn) => fn;

/**
 * React's per-request memoization (`cache`) when running in a Server Component
 * (Next's react-server runtime provides it), otherwise an identity wrapper.
 *
 * The fallback keeps non-RSC environments working — unit tests and the plain
 * `react` build do not expose `cache`. There it simply does not dedupe, which
 * is harmless (correctness is unchanged; only the request-level optimization is
 * skipped).
 */
export const requestCache: Memoizer =
  typeof (React as { cache?: Memoizer }).cache === 'function'
    ? (React as unknown as { cache: Memoizer }).cache
    : identity;
