import {vi} from 'vitest';

export function stubVisibleDocument() {
  const document = Object.assign(new EventTarget(), {hidden: false});
  vi.stubGlobal('document', document);
  return document;
}

// A promise a test settles by hand.
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

// Controller tests use the same hook-slot stand-in as ui/hooks.test.ts, without a DOM renderer.
const slots: unknown[] = [];
let slot = 0;
// Effects of the last render, run only when a test asks, whatever their dependencies; cleanups wait for unmount.
const effects: Array<() => void | (() => void)> = [];
const cleanups: Array<() => void> = [];
export const hookHarness = {
  reset() {
    slots.length = 0;
    slot = 0;
    effects.length = 0;
    cleanups.length = 0;
  },
  render<T>(read: () => T): T {
    slot = 0;
    effects.length = 0;
    return read();
  },
  runEffects() {
    for (const effect of effects.splice(0)) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }
  },
  unmount() {
    for (const cleanup of cleanups.splice(0)) cleanup();
  },
  hooks: {
    useState<T>(initial: T) {
      const index = slot++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index] as T,
        (next: T | ((previous: T) => T)) => {
          slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(slots[index] as T) : next;
        }
      ] as const;
    },
    useRef<T>(initial: T) {
      const index = slot++;
      return (slots[index] ??= {current: initial}) as {current: T};
    },
    useMemo<T>(read: () => T) {
      return read();
    },
    useEffect(effect: () => void | (() => void)) {
      effects.push(effect);
    }
  }
};
