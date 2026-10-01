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
export const hookHarness = {
  reset() {
    slots.length = 0;
    slot = 0;
  },
  render<T>(read: () => T): T {
    slot = 0;
    return read();
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
    useEffect() {}
  }
};
