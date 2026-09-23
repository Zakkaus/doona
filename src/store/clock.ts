import {useCallback, useSyncExternalStore} from 'react';

// One ticking store per interval, shared by every subscriber. Relative times and freshness advance on it rather than
// on each poll, since an unchanged poll no longer produces a new object. It stops while the page is hidden and
// ticks once when the page is shown again.
type Clock = {now: number; subscribers: Set<() => void>; timer?: ReturnType<typeof setInterval>};
const clocks = new Map<number, Clock>();

function tick(clock: Clock) {
  clock.now = Date.now();
  clock.subscribers.forEach(fn => fn());
}

function run(clock: Clock, ms: number) {
  clearInterval(clock.timer);
  clock.timer = document.hidden || !clock.subscribers.size ? undefined : setInterval(() => tick(clock), ms);
}

function clockFor(ms: number) {
  let clock = clocks.get(ms);
  if (!clock) {
    const created: Clock = {now: Date.now(), subscribers: new Set()};
    clocks.set(ms, (clock = created));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && created.subscribers.size) tick(created);
      run(created, ms);
    });
  }
  return clock;
}

function subscribe(ms: number, notify: () => void) {
  const clock = clockFor(ms);
  if (!clock.subscribers.size) clock.now = Date.now();
  clock.subscribers.add(notify);
  if (clock.subscribers.size === 1) run(clock, ms);
  return () => {
    clock.subscribers.delete(notify);
    if (!clock.subscribers.size) run(clock, ms);
  };
}

export function useNow(ms = 5000) {
  return useSyncExternalStore(
    useCallback((notify: () => void) => subscribe(ms, notify), [ms]),
    () => clockFor(ms).now
  );
}
