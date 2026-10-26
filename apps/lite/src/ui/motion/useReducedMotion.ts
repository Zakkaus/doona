/**
 * The OS reduced-motion setting, shared so every primitive here renders its
 * final state at once when it is on. `prefersReducedMotion()` is the same
 * check for effects.
 */
import {useSyncExternalStore} from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/**
 * Calls `stop` when the user turns reduced motion on while an animation runs,
 * so running motion ends at its final state at once. Returns the unsubscribe
 * for the effect cleanup.
 */
export function onReducedMotion(stop: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const list = window.matchMedia(QUERY);
  const onChange = () => {
    if (list.matches) stop();
  };
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** Cancels `running` now and whenever reduced motion turns on; returns the cleanup. */
export function cancelOnReducedMotion(running: Animation[]): () => void {
  const cancel = () => running.forEach(a => a.cancel());
  const off = onReducedMotion(cancel);
  return () => {
    off();
    cancel();
  };
}
