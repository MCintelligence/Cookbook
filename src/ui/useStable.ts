import { useCallback, useRef } from 'react';

/**
 * A function that stays the same object from render to render but always runs the newest
 * `fn`, so memoised components (the Shelf, the toolbar) aren't redrawn for a new handler.
 */
export function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}
