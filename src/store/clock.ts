import {useSyncExternalStore} from 'react';

// One ticking store shared by every subscriber. Relative times and freshness advance on it rather than on each poll,
// since an unchanged poll no longer produces a new object. It stops while the page is hidden and ticks once when the
// page is shown again.
const every = 5000;
const subscribers = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
let watching = false;

function tick() {
  now = Date.now();
  subscribers.forEach(fn => fn());
}

function run() {
  clearInterval(timer);
  timer = document.hidden || !subscribers.size ? undefined : setInterval(tick, every);
}

function subscribe(notify: () => void) {
  if (!watching) {
    watching = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && subscribers.size) tick();
      run();
    });
  }
  if (!subscribers.size) now = Date.now();
  subscribers.add(notify);
  if (subscribers.size === 1) run();
  return () => {
    subscribers.delete(notify);
    if (!subscribers.size) run();
  };
}

export function useNow() {
  return useSyncExternalStore(subscribe, () => now);
}
